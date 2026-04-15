"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";

// Dynamic import untuk menghindari SSR Build Error (TextEncoder)
let faceapi: any = null;

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Scan, CheckCircle2, Eye, Glasses, Smile, UserPlus } from "lucide-react";

// ============================================================
// TIPE DATA
// ============================================================
type RegStep = "netral" | "kacamata" | "senyum" | "submitting" | "success";

// ============================================================
// HELPER: Eye Aspect Ratio (EAR) — Anti-Spoofing Liveness
// Rumus: EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
// Indeks landmark face-api.js: mata kanan 36-41, mata kiri 42-47
// ============================================================
function euclidDist(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function computeEAR(eyePts: { x: number; y: number }[]): number {
    // eyePts harus berisi 6 titik (indeks 0-5 dari range mata)
    const A = euclidDist(eyePts[1], eyePts[5]);
    const B = euclidDist(eyePts[2], eyePts[4]);
    const C = euclidDist(eyePts[0], eyePts[3]);
    return (A + B) / (2.0 * C);
}

const EAR_BLINK_THRESHOLD = 0.18; // Di bawah nilai ini = mata tertutup (kedip)
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

// ============================================================
// KOMPONEN UTAMA
// ============================================================
export default function RegisterWajah() {
    const webcamRef = useRef<Webcam>(null);
    const animFrameRef = useRef<number>(0);

    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [loadingText, setLoadingText] = useState("Mempersiapkan...");
    const [nama, setNama] = useState("");
    const [nis, setNis] = useState("");

    // State alur registrasi multivariasi
    const [step, setStep] = useState<RegStep>("netral");
    const [embeddings, setEmbeddings] = useState<number[][]>([]);

    // State Liveness EAR
    const [livnessReady, setLivenessReady] = useState(false);  // apakah kedipan sudah terdeteksi
    const [earStatus, setEarStatus] = useState<"menunggu" | "kedip" | "ok">("menunggu");
    const earWasLow = useRef(false); // penanda EAR sudah pernah turun (kedip)
    const isCapturing = useRef(false);

    // ============================================================
    // MUAT MODEL SSD MOBILENET V1 (Akurasi Tertinggi)
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

                // SsdMobilenetv1: akurasi bounding box tertinggi untuk deskripsi 128D
                setLoadingText("Memuat Detektor SSD...");
                await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
                if (cancelled) return;

                setLoadingText("Memuat Landmark 68 Titik...");
                await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
                if (cancelled) return;

                setLoadingText("Memuat Model Biometrik...");
                await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                if (cancelled) return;

                setModelsLoaded(true);
            } catch (error) {
                if (!cancelled) {
                    console.error("Gagal memuat model:", error);
                    toast.error("Gagal terhubung ke server model AI");
                }
            }
        }
        loadModels();
        return () => { cancelled = true; };
    }, []);

    // ============================================================
    // LOOP DETEKSI EAR REAL-TIME (Anti-Spoofing Liveness)
    // Baca video secara iteratif menggunakan requestAnimationFrame
    // ============================================================
    const startLivenessLoop = useCallback(() => {
        earWasLow.current = false;
        setEarStatus("menunggu");
        setLivenessReady(false);
        isCapturing.current = false;

        const loop = async () => {
            if (!faceapi || !webcamRef.current || !webcamRef.current.video) {
                animFrameRef.current = requestAnimationFrame(loop);
                return;
            }
            const videoEl = webcamRef.current.video;
            if (videoEl.readyState !== 4) {
                animFrameRef.current = requestAnimationFrame(loop);
                return;
            }

            try {
                const result = await faceapi
                    .detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                    .withFaceLandmarks();

                if (result) {
                    const pts = result.landmarks.positions; // Array dari 68 titik { x, y }

                    // Mata kanan: indeks 36-41, Mata kiri: indeks 42-47
                    const rightEye = pts.slice(36, 42);
                    const leftEye  = pts.slice(42, 48);

                    const earRight = computeEAR(rightEye);
                    const earLeft  = computeEAR(leftEye);
                    const ear = (earRight + earLeft) / 2;

                    if (ear < EAR_BLINK_THRESHOLD) {
                        // Mata sedang menutup (kedip)
                        earWasLow.current = true;
                        setEarStatus("kedip");
                    } else if (earWasLow.current && ear >= EAR_BLINK_THRESHOLD) {
                        // Mata sudah terbuka kembali setelah kedip → LIVENESS CONFIRMED
                        setEarStatus("ok");
                        setLivenessReady(true);
                        cancelAnimationFrame(animFrameRef.current);
                        return; // Hentikan loop
                    }
                }
            } catch (_) {
                // Abaikan error deteksi per frame
            }

            animFrameRef.current = requestAnimationFrame(loop);
        };

        animFrameRef.current = requestAnimationFrame(loop);
    }, []);

    // Mulai loop saat model siap
    useEffect(() => {
        if (modelsLoaded && (step === "netral" || step === "kacamata" || step === "senyum")) {
            startLivenessLoop();
        }
        return () => {
            cancelAnimationFrame(animFrameRef.current);
        };
    }, [modelsLoaded, step, startLivenessLoop]);

    // ============================================================
    // AMBIL FRAME SETELAH LIVENESS TERVERIFIKASI
    // ============================================================
    const captureFrame = useCallback(async () => {
        if (!modelsLoaded || !faceapi || !livnessReady || isCapturing.current) return;
        if (!nama || !nis) {
            toast.warning("Nama dan NIS wajib diisi di awal");
            return;
        }

        const videoEl = webcamRef.current?.video;
        if (!videoEl || videoEl.readyState !== 4) return;

        isCapturing.current = true;

        try {
            // Deteksi dengan SsdMobilenetv1 + landmark 68 titik standar + descriptor 128D
            const result = await faceapi
                .detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!result) {
                toast.error("Wajah tidak terdeteksi. Pastikan wajah terlihat jelas dan pencahayaan cukup.");
                isCapturing.current = false;
                return;
            }

            const faceDescriptor = Array.from(result.descriptor) as number[];
            const newEmbeddings = [...embeddings, faceDescriptor];
            setEmbeddings(newEmbeddings);

            if (step === "netral") {
                toast.success("✅ Wajah Netral Terekam!");
                setStep("kacamata");
            } else if (step === "kacamata") {
                toast.success("✅ Wajah Variasi Terekam!");
                setStep("senyum");
            } else if (step === "senyum") {
                toast.success("✅ Semua Variasi Lengkap! Menyimpan...");
                setStep("submitting");
                cancelAnimationFrame(animFrameRef.current);
                await submitData(newEmbeddings);
            }
        } catch (e: any) {
            toast.error(`Error saat capture: ${e.message}`);
        } finally {
            isCapturing.current = false;
        }
    }, [modelsLoaded, livnessReady, nama, nis, step, embeddings]);

    // ============================================================
    // KIRIM DATA KE API
    // ============================================================
    const submitData = async (finalEmbeddings: number[][]) => {
        try {
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nama, nis, faceEmbeddings: finalEmbeddings }),
            });
            const hasil = await res.json();
            if (hasil.success) {
                toast.success("Registrasi Sukses!", {
                    description: `3 variasi biometrik ${nama} berhasil disimpan ke Cloud.`,
                });
                setStep("success");
                setNama("");
                setNis("");
                setTimeout(() => { setStep("netral"); setEmbeddings([]); }, 3500);
            } else {
                toast.error("Pendaftaran Ditolak", { description: hasil.message });
                setStep("netral");
                setEmbeddings([]);
            }
        } catch {
            toast.error("Terjadi kesalahan jaringan/server.");
            setStep("netral");
            setEmbeddings([]);
        }
    };

    // ============================================================
    // KONFIGURASI UI PER LANGKAH
    // ============================================================
    const stepConfig: Record<RegStep, { label: string; subLabel: string; icon: React.ReactNode; color: string; step: number }> = {
        netral:     { label: "Kedipkan Mata, lalu Tekan Tombol",   subLabel: "Wajah Netral (Tanpa Aksesori)", icon: <Eye className="w-5 h-5" />,      color: "bg-blue-600 hover:bg-blue-700", step: 1 },
        kacamata:   { label: "Kedipkan Mata, lalu Tekan Tombol",   subLabel: "Dengan Kacamata / Kondisi Berbeda", icon: <Glasses className="w-5 h-5" />, color: "bg-purple-600 hover:bg-purple-700", step: 2 },
        senyum:     { label: "Kedipkan Mata, lalu Tekan Tombol",   subLabel: "Wajah Tersenyum Natural", icon: <Smile className="w-5 h-5" />,     color: "bg-amber-500 hover:bg-amber-600 text-slate-900", step: 3 },
        submitting: { label: "Menyimpan ke Database...",           subLabel: "", icon: <Scan className="w-5 h-5 animate-spin" />,  color: "bg-cyan-700 cursor-not-allowed opacity-80", step: 3 },
        success:    { label: "Registrasi Berhasil!",               subLabel: "", icon: <CheckCircle2 className="w-5 h-5" />,       color: "bg-green-600 cursor-not-allowed", step: 3 },
    };
    const ui = stepConfig[step];

    const earBadgeColor =
        earStatus === "ok"   ? "bg-green-500 text-white" :
        earStatus === "kedip"? "bg-yellow-400 text-black" :
        "bg-slate-600 text-slate-300";

    const earBadgeLabel =
        earStatus === "ok"   ? "✅ Hidup Terverifikasi" :
        earStatus === "kedip"? "👁 Kedipan Terdeteksi..." :
        "👁 Menunggu Kedipan Mata...";

    const canCapture = modelsLoaded && livnessReady && step !== "submitting" && step !== "success";

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4 gap-4">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2 justify-center">
                    <UserPlus className="w-7 h-7 text-blue-400" /> Daftar Wajah Biometrik
                </h1>
                <p className="text-slate-400 text-sm mt-1">Anti-Spoofing Aktif — Kedipan Mata Diperlukan</p>
            </div>

            <Card className="w-full max-w-lg md:max-w-2xl bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-2xl rounded-3xl">
                <CardContent className="p-4 md:p-6 space-y-4 pt-6">
                    {/* Form Input */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-300 ml-1">Nama Lengkap</label>
                            <Input
                                disabled={step !== "netral"}
                                placeholder="Masukkan nama..."
                                value={nama}
                                onChange={(e) => setNama(e.target.value)}
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-300 ml-1">NIS</label>
                            <Input
                                disabled={step !== "netral"}
                                placeholder="Masukkan NIS..."
                                value={nis}
                                onChange={(e) => setNis(e.target.value)}
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Step Progress */}
                    <div className="flex items-center gap-2 px-1">
                        {(["netral", "kacamata", "senyum"] as RegStep[]).map((s, i) => {
                            const done = embeddings.length > i;
                            const active = step === s;
                            return (
                                <React.Fragment key={s}>
                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold transition-all ${done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white ring-2 ring-blue-400" : "bg-slate-700 text-slate-400"}`}>
                                        {done ? <CheckCircle2 className="w-3 h-3" /> : stepConfig[s].icon}
                                        <span className="hidden sm:inline">{i + 1}. {stepConfig[s].subLabel.split(" ")[0]}</span>
                                        <span className="sm:hidden">{i + 1}</span>
                                    </div>
                                    {i < 2 && <div className={`flex-1 h-0.5 rounded ${done ? "bg-green-500" : "bg-slate-700"}`} />}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Viewport Kamera */}
                    <div className="relative aspect-[4/3] md:aspect-video rounded-2xl overflow-hidden bg-black border-2 border-slate-600/50 shadow-inner">
                        <Webcam
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover scale-x-[-1]"
                            videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
                        />

                        {/* Overlay loading model */}
                        {!modelsLoaded && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/92 text-white gap-3 z-10">
                                <Scan className="animate-spin w-9 h-9 text-blue-400" />
                                <span className="text-sm font-medium animate-pulse text-center px-4">{loadingText}</span>
                                <span className="text-xs text-slate-400">Harap tunggu, mengunduh model AI...</span>
                            </div>
                        )}

                        {/* Overlay Sukses */}
                        {step === "success" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/80 text-white gap-3 z-10">
                                <CheckCircle2 className="w-16 h-16 text-green-400" />
                                <span className="text-lg font-bold">Registrasi Berhasil!</span>
                            </div>
                        )}

                        {/* Oval Bingkai */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className={`w-[52%] h-[80%] border-2 border-dashed rounded-[120px] transition-colors duration-300 ${canCapture ? "border-green-400/70" : "border-white/30"}`} />
                        </div>

                        {/* Instruksi langkah aktif */}
                        {modelsLoaded && step !== "success" && step !== "submitting" && (
                            <div className="absolute top-2 left-0 right-0 flex justify-center">
                                <span className="bg-slate-900/80 text-white/90 text-xs px-3 py-1.5 rounded-full font-medium">
                                    Langkah {ui.step}/3: {ui.subLabel}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Badge Status EAR Liveness */}
                    {modelsLoaded && step !== "success" && step !== "submitting" && (
                        <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${earBadgeColor}`}>
                            <span>{earBadgeLabel}</span>
                        </div>
                    )}

                    {/* Tombol Capture */}
                    <Button
                        className={`w-full h-14 text-base font-semibold shadow-lg transition-all duration-300 ${ui.color} ${!canCapture ? "opacity-50 cursor-not-allowed" : ""}`}
                        onClick={captureFrame}
                        disabled={!canCapture}
                    >
                        <span className="flex items-center gap-2">
                            {ui.icon} {ui.label}
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