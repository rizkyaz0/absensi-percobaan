"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";

// Dynamic import untuk menghindari SSR Build Error (TextEncoder di Node.js)
let faceapi: any = null;

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Scan, CheckCircle2, Eye, Glasses, Smile, UserPlus, Camera } from "lucide-react";

// ============================================================
// TIPE DATA
// ============================================================
type RegStep = "netral" | "kacamata" | "senyum" | "submitting" | "success";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

// ============================================================
// HELPER: Downscale video ke canvas 320×240 sebelum deteksi.
// Penyebab utama wajah tidak terdeteksi di HP: resolusi kamera
// HP (720p-1080p) terlalu besar untuk diproses CPU mobile.
// Canvas kecil 320×240 mengurangi beban ±10x tanpa kehilangan akurasi.
// ============================================================
function getScaledCanvas(videoEl: HTMLVideoElement, maxW = 320, maxH = 240): HTMLCanvasElement {
    const aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
    let targetW = maxW;
    let targetH = Math.round(maxW / aspectRatio);
    if (targetH > maxH) {
        targetH = maxH;
        targetW = Math.round(maxH * aspectRatio);
    }
    const canvas = document.createElement("canvas");
    canvas.width  = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(videoEl, 0, 0, targetW, targetH);
    return canvas;
}

// ============================================================
// KOMPONEN UTAMA
// ============================================================
export default function RegisterWajah() {
    const webcamRef = useRef<Webcam>(null);

    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [loadingText, setLoadingText] = useState("Mempersiapkan...");
    const [nama, setNama] = useState("");
    const [nis, setNis] = useState("");
    const [step, setStep] = useState<RegStep>("netral");
    const [embeddings, setEmbeddings] = useState<number[][]>([]);
    const [isProcessing, setIsProcessing] = useState(false); // Mencegah double-click

    // ============================================================
    // MUAT MODEL — SsdMobilenetv1 + Landmark68 + Recognition
    // Model di-cache browser setelah pertama kali diunduh.
    // ============================================================
    useEffect(() => {
        let cancelled = false;

        async function loadModels() {
            try {
                if (!faceapi) {
                    setLoadingText("Memuat AI Engine...");
                    faceapi = await import("@vladmandic/face-api");
                }
                if (cancelled) return;

                setLoadingText("Memuat Detektor SSD (1/3)...");
                await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
                if (cancelled) return;

                setLoadingText("Memuat Landmark 68-Titik (2/3)...");
                await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
                if (cancelled) return;

                setLoadingText("Memuat Model Biometrik (3/3)...");
                await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                if (cancelled) return;

                setModelsLoaded(true);
            } catch (err) {
                if (!cancelled) {
                    console.error(err);
                    toast.error("Gagal memuat model AI. Periksa koneksi internet.");
                }
            }
        }

        loadModels();
        return () => { cancelled = true; };
    }, []);

    // ============================================================
    // CAPTURE — Deteksi hanya saat tombol diklik (tidak ada loop)
    // Tidak ada EAR / requestAnimationFrame sehingga nol lag.
    // ============================================================
    const captureFrame = useCallback(async () => {
        if (!modelsLoaded || !faceapi || isProcessing) return;
        if (!nama.trim() || !nis.trim()) {
            toast.warning("Nama dan NIS wajib diisi terlebih dahulu.");
            return;
        }

        const videoEl = webcamRef.current?.video;
        if (!videoEl || videoEl.readyState !== 4) {
            toast.error("Kamera belum siap. Pastikan kamera diizinkan.");
            return;
        }

        setIsProcessing(true);

        try {
            // Downscale ke 320×240 agar HP bisa memproses dengan cepat
            const canvas = getScaledCanvas(videoEl);

            // Deteksi pada canvas kecil — jauh lebih ringan di CPU mobile
            const result = await faceapi
                .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!result) {
                toast.error("Wajah tidak terdeteksi!", {
                    description: "Pastikan wajah Anda terlihat jelas, pencahayaan cukup, dan tidak ada halangan.",
                });
                return;
            }

            // Validasi ukuran wajah — jangan terlalu jauh dari kamera
            if (result.detection.box.width / videoEl.videoWidth < 0.18) {
                toast.error("Wajah terlalu jauh dari kamera.", {
                    description: "Dekatkan wajah Anda hingga memenuhi area dalam bingkai.",
                });
                return;
            }

            const descriptor = Array.from(result.descriptor) as number[];
            const newEmbeddings = [...embeddings, descriptor];
            setEmbeddings(newEmbeddings);

            if (step === "netral") {
                toast.success("✅ Wajah Netral Terekam!");
                setStep("kacamata");
            } else if (step === "kacamata") {
                toast.success("✅ Variasi Kedua Terekam!");
                setStep("senyum");
            } else if (step === "senyum") {
                toast.success("✅ Semua variasi selesai! Menyimpan ke database...");
                setStep("submitting");
                await submitData(newEmbeddings);
            }
        } catch (err: any) {
            toast.error("Terjadi error saat deteksi.", { description: err.message });
        } finally {
            setIsProcessing(false);
        }
    }, [modelsLoaded, isProcessing, nama, nis, step, embeddings]);

    // ============================================================
    // KIRIM KE API
    // ============================================================
    const submitData = async (finalEmbeddings: number[][]) => {
        try {
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nama: nama.trim(), nis: nis.trim(), faceEmbeddings: finalEmbeddings }),
            });

            const hasil = await res.json();

            if (hasil.success) {
                toast.success("Registrasi Berhasil!", {
                    description: `3 variasi wajah ${nama} berhasil tersimpan.`,
                });
                setStep("success");
                setNama("");
                setNis("");
                setTimeout(() => { setStep("netral"); setEmbeddings([]); }, 3500);
            } else {
                toast.error("Registrasi Ditolak", { description: hasil.message });
                setStep("netral");
                setEmbeddings([]);
            }
        } catch {
            toast.error("Gagal terhubung ke server.");
            setStep("netral");
            setEmbeddings([]);
        }
    };

    // ============================================================
    // KONFIGURASI UI
    // ============================================================
    const stepConfig: Record<RegStep, {
        label: string; subLabel: string; desc: string;
        icon: React.ReactNode; color: string; stepNum: number;
    }> = {
        netral: {
            label: "Ambil Foto Sekarang",
            subLabel: "Langkah 1: Wajah Netral",
            desc: "Hadapkan wajah lurus ke kamera, ekspresi normal.",
            icon: <Eye className="w-5 h-5" />,
            color: "bg-blue-600 hover:bg-blue-700",
            stepNum: 1,
        },
        kacamata: {
            label: "Ambil Foto Sekarang",
            subLabel: "Langkah 2: Dengan Kacamata / Aksesori",
            desc: "Gunakan kacamata atau kondisi berbeda dari langkah 1.",
            icon: <Glasses className="w-5 h-5" />,
            color: "bg-purple-600 hover:bg-purple-700",
            stepNum: 2,
        },
        senyum: {
            label: "Ambil Foto Sekarang",
            subLabel: "Langkah 3: Ekspresi Senyum",
            desc: "Tersenyumlah natural ke arah kamera.",
            icon: <Smile className="w-5 h-5" />,
            color: "bg-amber-500 hover:bg-amber-600 text-slate-900",
            stepNum: 3,
        },
        submitting: {
            label: "Menyimpan ke Database...",
            subLabel: "", desc: "",
            icon: <Scan className="w-5 h-5 animate-spin" />,
            color: "bg-cyan-700 cursor-not-allowed opacity-80",
            stepNum: 3,
        },
        success: {
            label: "Registrasi Berhasil!",
            subLabel: "", desc: "",
            icon: <CheckCircle2 className="w-5 h-5" />,
            color: "bg-green-600 cursor-not-allowed",
            stepNum: 3,
        },
    };

    const ui = stepConfig[step];
    const isActive = step !== "submitting" && step !== "success";
    const canCapture = modelsLoaded && isActive && !isProcessing;

    const stepKeys: RegStep[] = ["netral", "kacamata", "senyum"];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4 gap-4">
            {/* Judul */}
            <div className="text-center">
                <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2 justify-center">
                    <UserPlus className="w-7 h-7 text-blue-400" />
                    Daftar Wajah Biometrik
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    Daftarkan 3 variasi wajah untuk akurasi optimal
                </p>
            </div>

            <Card className="w-full max-w-lg md:max-w-2xl bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-2xl rounded-3xl">
                <CardContent className="p-4 md:p-6 space-y-4 pt-6">

                    {/* Form Input */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-300 ml-1">Nama Lengkap</label>
                            <Input
                                disabled={!isActive}
                                placeholder="Masukkan nama..."
                                value={nama}
                                onChange={(e) => setNama(e.target.value)}
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-300 ml-1">NIS</label>
                            <Input
                                disabled={!isActive}
                                placeholder="Masukkan NIS..."
                                value={nis}
                                onChange={(e) => setNis(e.target.value)}
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Step Progress Bar */}
                    <div className="flex items-center gap-2 px-1">
                        {stepKeys.map((s, i) => {
                            const done = embeddings.length > i;
                            const active = step === s;
                            return (
                                <React.Fragment key={s}>
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                                        done   ? "bg-green-500 text-white" :
                                        active ? "bg-blue-600 text-white ring-2 ring-blue-400" :
                                        "bg-slate-700 text-slate-400"
                                    }`}>
                                        {done
                                            ? <CheckCircle2 className="w-3.5 h-3.5" />
                                            : stepConfig[s].icon
                                        }
                                        <span className="hidden sm:inline">
                                            {done ? "Selesai" : stepConfig[s].subLabel.split(":")[0]}
                                        </span>
                                        <span className="sm:hidden">{i + 1}</span>
                                    </div>
                                    {i < 2 && (
                                        <div className={`flex-1 h-0.5 rounded transition-all duration-300 ${done ? "bg-green-500" : "bg-slate-700"}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Viewport Kamera */}
                    <div className={`relative aspect-[4/3] md:aspect-video rounded-2xl overflow-hidden bg-black shadow-inner border-2 transition-all duration-300 ${
                        isProcessing ? "border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.4)]" :
                        step === "success" ? "border-green-400" :
                        "border-slate-600/50"
                    }`}>
                        <Webcam
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover scale-x-[-1]"
                            videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
                        />

                        {/* Overlay: Loading Model */}
                        {!modelsLoaded && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/93 text-white gap-3 z-10">
                                <Scan className="animate-spin w-9 h-9 text-blue-400" />
                                <span className="text-sm font-medium animate-pulse text-center px-4">{loadingText}</span>
                                <span className="text-xs text-slate-400">Model AI ~7MB — tersimpan cache setelah selesai</span>
                            </div>
                        )}

                        {/* Overlay: Processing */}
                        {isProcessing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-900/70 text-white gap-2 z-10">
                                <Scan className="animate-spin w-9 h-9 text-blue-300" />
                                <span className="text-sm font-semibold">Mengekstrak vektor biometrik...</span>
                            </div>
                        )}

                        {/* Overlay: Sukses */}
                        {step === "success" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/80 text-white gap-3 z-10">
                                <CheckCircle2 className="w-16 h-16 text-green-400" />
                                <span className="text-lg font-bold">Registrasi Berhasil!</span>
                            </div>
                        )}

                        {/* Bingkai Oval Panduan */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className={`w-[50%] h-[80%] border-2 border-dashed rounded-[120px] transition-colors duration-300 ${
                                isProcessing ? "border-blue-400" :
                                canCapture   ? "border-white/50" :
                                "border-white/20"
                            }`} />
                        </div>

                        {/* Label petunjuk langkah */}
                        {modelsLoaded && isActive && !isProcessing && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                                <div className="bg-slate-900/85 text-white/90 text-xs px-3 py-2 rounded-xl font-medium text-center max-w-[90%]">
                                    <div className="font-bold text-blue-300">{ui.subLabel}</div>
                                    <div className="text-slate-400 mt-0.5">{ui.desc}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tombol Capture */}
                    <Button
                        className={`w-full h-14 text-base font-semibold shadow-lg transition-all duration-200 ${ui.color} ${!canCapture ? "opacity-60 pointer-events-none" : "hover:scale-[1.01]"}`}
                        onClick={captureFrame}
                        disabled={!canCapture}
                    >
                        <span className="flex items-center gap-2">
                            {isProcessing ? <Scan className="animate-spin w-5 h-5" /> : ui.icon}
                            {isProcessing ? "Memproses..." : ui.label}
                        </span>
                    </Button>

                </CardContent>
            </Card>

            <a href="/" className="text-slate-500 hover:text-slate-300 text-sm transition-colors underline-offset-2 hover:underline">
                ← Kembali ke Beranda
            </a>
        </div>
    );
}