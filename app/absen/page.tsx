"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";

// Dynamic import untuk menghindari SSR Build Error (TextEncoder)
let faceapi: any = null;

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, Camera, Scan, CheckCircle, Clock, Wifi, WifiOff } from "lucide-react";

type AbsenStatus = "idle" | "scanning" | "success" | "error";

interface AbsenResult {
    nama: string;
    nis: string;
    status: "HADIR" | "TELAT";
    waktu: string;
    skor: string;
}

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

// ============================================================
// HELPER: Downscale video ke canvas kecil sebelum deteksi.
// Kamera HP (720p-1080p) terlalu besar untuk CPU mobile → tidak ada hasil.
// Canvas 320×240 mengurangi beban ±10x tanpa kehilangan akurasi.
// ============================================================
function getScaledCanvas(videoEl: HTMLVideoElement, maxW = 320, maxH = 240): HTMLCanvasElement {
    const ar = videoEl.videoWidth / videoEl.videoHeight;
    let w = maxW;
    let h = Math.round(maxW / ar);
    if (h > maxH) { h = maxH; w = Math.round(maxH * ar); }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(videoEl, 0, 0, w, h);
    return canvas;
}

export default function AbsenPage() {
    const webcamRef = useRef<Webcam>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [loadingText, setLoadingText] = useState("Mempersiapkan...");
    const [absenStatus, setAbsenStatus] = useState<AbsenStatus>("idle");
    const [hasilAbsen, setHasilAbsen] = useState<AbsenResult | null>(null);
    const [lokasi, setLokasi] = useState<{ lat: number; lon: number } | null>(null);
    const [lokasiError, setLokasiError] = useState<string>("");
    const [jamSekarang, setJamSekarang] = useState(new Date());
    const [mounted, setMounted] = useState(false);

    // Jam realtime — mounted guard mencegah Hydration Mismatch
    useEffect(() => {
        setMounted(true);
        const timer = setInterval(() => setJamSekarang(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Izin GPS
    useEffect(() => {
        if (!navigator.geolocation) {
            setLokasiError("Browser Anda tidak mendukung GPS.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => setLokasi({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => setLokasiError("Izin GPS ditolak. Absensi memerlukan lokasi Anda."),
            { enableHighAccuracy: true }
        );
    }, []);

    // Muat model SsdMobilenetv1 (akurasi tertinggi)
    useEffect(() => {
        let cancelled = false;
        async function loadModels() {
            try {
                if (!faceapi) {
                    setLoadingText("Memuat AI Engine...");
                    faceapi = await import("@vladmandic/face-api");
                }
                if (cancelled) return;

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
                if (!cancelled)
                    toast.error("Gagal memuat AI", { description: "Model gagal dimuat dari server Cloud." });
            }
        }
        loadModels();
        return () => { cancelled = true; };
    }, []);

    const handleAbsen = useCallback(async () => {
        if (!modelsLoaded || !faceapi || !webcamRef.current?.video) return;
        if (!lokasi) {
            toast.error("GPS tidak tersedia", { description: lokasiError || "Aktifkan GPS terlebih dahulu." });
            return;
        }

        setAbsenStatus("scanning");
        setHasilAbsen(null);

        const videoEl = webcamRef.current.video;
        if (videoEl.readyState !== 4) {
            toast.error("Kamera belum siap");
            setAbsenStatus("idle");
            return;
        }

        try {
            // Downscale ke 320×240 agar HP bisa memproses
            const canvas = getScaledCanvas(videoEl);

            const result = await faceapi
                .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!result) {
                toast.error("Wajah tidak terdeteksi", {
                    description: "Pastikan menghadap layar dengan jelas dan pencahayaan cukup."
                });
                setAbsenStatus("error");
                setTimeout(() => setAbsenStatus("idle"), 2000);
                return;
            }

            const faceDescriptorArray = Array.from(result.descriptor) as number[];

            // Validasi ukuran wajah (berdasarkan dimensi canvas yang sudah di-scale)
            const box = result.detection.box;
            if (box.width / canvas.width < 0.18) {
                toast.error("Wajah terlalu jauh", { description: "Dekatkan wajah lebih ke kamera." });
                setAbsenStatus("error");
                setTimeout(() => setAbsenStatus("idle"), 2000);
                return;
            }

            // Kirim ke API
            const response = await fetch("/api/absensi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    faceEmbedding: faceDescriptorArray,
                    latitude: lokasi.lat,
                    longitude: lokasi.lon,
                }),
            });

            const hasil = await response.json();

            if (hasil.success) {
                setHasilAbsen(hasil.data);
                setAbsenStatus("success");
                toast.success(`Hadir! Selamat datang, ${hasil.data.nama}`, {
                    description: `Status: ${hasil.data.status} — ${new Date(hasil.data.waktu).toLocaleTimeString("id-ID")}`
                });
            } else {
                setAbsenStatus("error");
                toast.error("Absensi Ditolak", { description: hasil.message });
                setTimeout(() => setAbsenStatus("idle"), 3000);
            }
        } catch (err: any) {
            setAbsenStatus("error");
            toast.error("Gagal terhubung ke server", { description: err.message });
            setTimeout(() => setAbsenStatus("idle"), 2000);
        }
    }, [modelsLoaded, lokasi, lokasiError]);

    const statusConfig = {
        idle:     { border: "border-slate-600",  pulse: false },
        scanning: { border: "border-blue-400",   pulse: true  },
        success:  { border: "border-green-400",  pulse: false },
        error:    { border: "border-red-400",    pulse: false },
    };
    const cfg = statusConfig[absenStatus];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4 gap-4">
            {/* Header */}
            <div className="text-center">
                <h1 className="text-3xl font-bold text-white tracking-tight">Presensi Wajah</h1>
                <p className="text-slate-400 text-sm mt-1" suppressHydrationWarning>
                    {mounted ? jamSekarang.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}
                </p>
                <p className="text-4xl font-mono font-bold text-blue-300 mt-1" suppressHydrationWarning>
                    {mounted ? jamSekarang.toLocaleTimeString("id-ID") : "--:--:--"}
                </p>
            </div>

            {/* Kamera Card */}
            <Card className="w-full max-w-lg md:max-w-2xl bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-2xl rounded-3xl">
                <CardContent className="p-3 md:p-6 space-y-4 pt-6">
                    {/* Viewport */}
                    <div className={`relative aspect-[4/3] md:aspect-video rounded-2xl overflow-hidden bg-black border-2 transition-all duration-300 ${cfg.border} ${cfg.pulse ? "shadow-[0_0_30px_rgba(59,130,246,0.3)]" : ""}`}>
                        <Webcam
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover scale-x-[-1]"
                            videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
                        />

                        {/* Overlay loading */}
                        {!modelsLoaded && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-3 z-10">
                                <Scan className="animate-spin w-8 h-8 text-blue-400" />
                                <span className="text-sm font-medium animate-pulse">{loadingText}</span>
                                <span className="text-xs text-slate-400">Mengunduh model AI dari server...</span>
                            </div>
                        )}

                        {/* Bingkai oval */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className={`w-44 h-60 border-2 border-dashed rounded-[100px] transition-colors duration-300 ${
                                absenStatus === "scanning" ? "border-blue-400" :
                                absenStatus === "success"  ? "border-green-400" :
                                absenStatus === "error"    ? "border-red-400" : "border-white/30"
                            }`} />
                        </div>

                        {/* Label scanning */}
                        {absenStatus === "scanning" && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                                <span className="bg-blue-600/90 text-white text-xs px-3 py-1.5 rounded-full animate-pulse font-medium">
                                    Memindai identitas biometrik...
                                </span>
                            </div>
                        )}

                        {/* Petunjuk idle */}
                        {absenStatus === "idle" && modelsLoaded && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                                <span className="bg-black/60 text-white/70 text-xs px-3 py-1 rounded-full">
                                    Posisikan wajah di dalam bingkai oval
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Hasil Absen */}
                    {absenStatus === "success" && hasilAbsen && (
                        <div className="bg-green-900/40 border border-green-600/50 rounded-xl p-4 flex items-center gap-3">
                            <CheckCircle className="w-8 h-8 text-green-400 flex-shrink-0" />
                            <div>
                                <p className="text-green-300 font-bold text-lg">{hasilAbsen.nama}</p>
                                <p className="text-green-400/70 text-xs">NIS: {hasilAbsen.nis}</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    <Badge variant="outline" className={`text-xs border ${hasilAbsen.status === "HADIR" ? "border-green-500 text-green-300" : "border-yellow-500 text-yellow-300"}`}>
                                        {hasilAbsen.status}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs border-slate-500 text-slate-300">
                                        <Clock className="w-3 h-3 mr-1" />
                                        {new Date(hasilAbsen.waktu).toLocaleTimeString("id-ID")}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs border-blue-500 text-blue-300 font-mono">
                                        {hasilAbsen.skor}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Status GPS */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${lokasi ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400"}`}>
                        {lokasi ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                        <MapPin className="w-4 h-4" />
                        {lokasi
                            ? <span>GPS Aktif: {lokasi.lat.toFixed(5)}, {lokasi.lon.toFixed(5)}</span>
                            : <span>{lokasiError || "Mengambil sinyal GPS..."}</span>
                        }
                    </div>

                    {/* Tombol Absen */}
                    <Button
                        className={`w-full h-14 text-base font-semibold transition-all duration-300 ${
                            absenStatus === "success"  ? "bg-green-600 hover:bg-green-700" :
                            absenStatus === "scanning" ? "bg-blue-600/70 cursor-not-allowed" :
                            "bg-blue-600 hover:bg-blue-700 hover:scale-[1.02]"
                        }`}
                        onClick={absenStatus === "idle" || absenStatus === "error" ? handleAbsen : undefined}
                        disabled={!modelsLoaded || absenStatus === "scanning"}
                    >
                        {absenStatus === "scanning" ? (
                            <span className="flex items-center gap-2"><Scan className="animate-spin w-5 h-5" /> Autentikasi...</span>
                        ) : absenStatus === "success" ? (
                            <span className="flex items-center gap-2"><CheckCircle className="w-5 h-5" /> Selesai!</span>
                        ) : (
                            <span className="flex items-center gap-2"><Camera className="w-5 h-5" /> SCAN WAJAH</span>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <a href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors underline underline-offset-2">
                Ke Dashboard Admin →
            </a>
        </div>
    );
}
