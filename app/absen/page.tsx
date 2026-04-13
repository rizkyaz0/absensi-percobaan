"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function AbsenPage() {
    const webcamRef = useRef<Webcam>(null);
    const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
    const [modelReady, setModelReady] = useState(false);
    const [absenStatus, setAbsenStatus] = useState<AbsenStatus>("idle");
    const [hasilAbsen, setHasilAbsen] = useState<AbsenResult | null>(null);
    const [lokasi, setLokasi] = useState<{ lat: number; lon: number } | null>(null);
    const [lokasiError, setLokasiError] = useState<string>("");
    const [jamSekarang, setJamSekarang] = useState(new Date());

    // Update jam setiap detik
    useEffect(() => {
        const timer = setInterval(() => setJamSekarang(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Minta izin lokasi GPS
    useEffect(() => {
        if (!navigator.geolocation) {
            setLokasiError("Browser Anda tidak mendukung GPS.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLokasi({ lat: pos.coords.latitude, lon: pos.coords.longitude });
            },
            (err) => {
                setLokasiError("Izin GPS ditolak. Absensi memerlukan lokasi Anda.");
            },
            { enableHighAccuracy: true }
        );
    }, []);

    // Load MediaPipe Model
    useEffect(() => {
        async function loadModel() {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );
                const landmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                        delegate: "GPU",
                    },
                    outputFaceBlendshapes: true,
                    runningMode: "IMAGE",
                });
                setFaceLandmarker(landmarker);
                setModelReady(true);
            } catch (error) {
                toast.error("Gagal memuat AI", { description: "Model pengenalan wajah gagal dimuat." });
            }
        }
        loadModel();
    }, []);

    const handleAbsen = useCallback(async () => {
        if (!faceLandmarker || !webcamRef.current) return;
        if (!lokasi) {
            toast.error("GPS tidak tersedia", { description: lokasiError || "Aktifkan GPS terlebih dahulu." });
            return;
        }

        setAbsenStatus("scanning");
        setHasilAbsen(null);

        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
            toast.error("Kamera tidak aktif");
            setAbsenStatus("idle");
            return;
        }

        const img = new Image();
        img.src = imageSrc;
        img.onload = async () => {
            // Intercept console.error MediaPipe WASM
            const originalConsoleError = console.error;
            console.error = (msg: any, ...args: any[]) => {
                if (typeof msg === "string" && msg.includes("TensorFlow Lite XNNPACK delegate")) return;
                originalConsoleError(msg, ...args);
            };

            let result;
            try {
                result = faceLandmarker.detect(img);
            } finally {
                console.error = originalConsoleError;
            }

            if (!result || result.faceLandmarks.length === 0) {
                toast.error("Wajah tidak terdeteksi", {
                    description: "Pastikan wajah terlihat jelas, pencahayaan cukup, dan tidak tertutup apapun."
                });
                setAbsenStatus("error");
                setTimeout(() => setAbsenStatus("idle"), 2000);
                return;
            }

            const faceData = result.faceLandmarks[0];

            // Validasi geometris: ukuran & posisi wajah
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            for (const pt of faceData) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
            }
            const faceWidth = maxX - minX;
            const faceHeight = maxY - minY;
            const centerX = minX + faceWidth / 2;
            const centerY = minY + faceHeight / 2;

            if (faceWidth < 0.20 || faceHeight < 0.25) {
                toast.error("Wajah terlalu jauh", { description: "Dekatkan wajah lebih ke kamera." });
                setAbsenStatus("error");
                setTimeout(() => setAbsenStatus("idle"), 2000);
                return;
            }
            if (centerX < 0.35 || centerX > 0.65 || centerY < 0.35 || centerY > 0.65) {
                toast.error("Posisi wajah salah", { description: "Posisikan wajah di tengah bingkai." });
                setAbsenStatus("error");
                setTimeout(() => setAbsenStatus("idle"), 2000);
                return;
            }

            // Kirim ke API Absensi
            try {
                const response = await fetch("/api/absensi", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        faceEmbedding: faceData,
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
            } catch (err) {
                setAbsenStatus("error");
                toast.error("Gagal terhubung ke server");
                setTimeout(() => setAbsenStatus("idle"), 2000);
            }
        };
    }, [faceLandmarker, lokasi, lokasiError]);

    const statusConfig = {
        idle: { border: "border-slate-600", pulse: false },
        scanning: { border: "border-blue-400", pulse: true },
        success: { border: "border-green-400", pulse: false },
        error: { border: "border-red-400", pulse: false },
    };

    const cfg = statusConfig[absenStatus];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4 gap-4">
            {/* Header */}
            <div className="text-center">
                <h1 className="text-3xl font-bold text-white tracking-tight">Presensi Wajah</h1>
                <p className="text-slate-400 text-sm mt-1">
                    {jamSekarang.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <p className="text-4xl font-mono font-bold text-blue-300 mt-1">
                    {jamSekarang.toLocaleTimeString("id-ID")}
                </p>
            </div>

            {/* Kamera Card */}
            <Card className="w-full max-w-lg md:max-w-2xl bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-2xl rounded-3xl -mt-2">
                <CardContent className="p-3 md:p-6 space-y-4">
                    {/* Viewport Kamera */}
                    <div className={`relative aspect-[3/4] md:aspect-video rounded-2xl overflow-hidden bg-black border-2 transition-all duration-300 ${cfg.border} ${cfg.pulse ? "shadow-[0_0_30px_rgba(59,130,246,0.3)] shadow-inner" : ""}`}>
                        <Webcam
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover scale-x-[-1]"
                            videoConstraints={{ facingMode: "user" }}
                        />

                        {/* Overlay AI loading */}
                        {!modelReady && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-white gap-2">
                                <Scan className="animate-spin w-8 h-8 text-blue-400" />
                                <span className="text-sm font-medium animate-pulse">Memuat AI...</span>
                            </div>
                        )}

                        {/* Bingkai wajah oval */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className={`w-44 h-60 border-2 border-dashed rounded-[100px] transition-colors duration-300 ${
                                absenStatus === "scanning" ? "border-blue-400" :
                                absenStatus === "success" ? "border-green-400" :
                                absenStatus === "error" ? "border-red-400" : "border-white/30"
                            }`} />
                        </div>

                        {/* Label scanning */}
                        {absenStatus === "scanning" && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                                <span className="bg-blue-600/90 text-white text-xs px-3 py-1 rounded-full animate-pulse font-medium">
                                    Memindai wajah...
                                </span>
                            </div>
                        )}

                        {/* Petunjuk posisi */}
                        {absenStatus === "idle" && modelReady && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                                <span className="bg-black/60 text-white/70 text-xs px-3 py-1 rounded-full">
                                    Posisikan wajah dalam bingkai oval
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
                                <div className="flex gap-2 mt-1">
                                    <Badge variant="outline" className={`text-xs border ${hasilAbsen.status === "HADIR" ? "border-green-500 text-green-300" : "border-yellow-500 text-yellow-300"}`}>
                                        {hasilAbsen.status}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs border-slate-500 text-slate-300">
                                        <Clock className="w-3 h-3 mr-1" />
                                        {new Date(hasilAbsen.waktu).toLocaleTimeString("id-ID")}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs border-blue-500 text-blue-300">
                                        {hasilAbsen.skor}% cocok
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Status Lokasi */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${lokasi ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400"}`}>
                        {lokasi ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                        <MapPin className="w-4 h-4" />
                        {lokasi
                            ? <span>GPS Aktif: {lokasi.lat.toFixed(5)}, {lokasi.lon.toFixed(5)}</span>
                            : <span>{lokasiError || "Mengambil lokasi..."}</span>
                        }
                    </div>

                    {/* Tombol Absen */}
                    <Button
                        className={`w-full h-14 text-base font-semibold transition-all duration-300 ${
                            absenStatus === "success"
                                ? "bg-green-600 hover:bg-green-700"
                                : absenStatus === "scanning"
                                ? "bg-blue-600/70 cursor-not-allowed"
                                : "bg-blue-600 hover:bg-blue-700 hover:scale-[1.02]"
                        }`}
                        onClick={absenStatus === "idle" || absenStatus === "error" ? handleAbsen : undefined}
                        disabled={!modelReady || absenStatus === "scanning"}
                    >
                        {absenStatus === "scanning" ? (
                            <span className="flex items-center gap-2"><Scan className="animate-spin w-5 h-5" /> Memindai...</span>
                        ) : absenStatus === "success" ? (
                            <span className="flex items-center gap-2"><CheckCircle className="w-5 h-5" /> Absensi Tercatat!</span>
                        ) : (
                            <span className="flex items-center gap-2"><Camera className="w-5 h-5" /> Absen Sekarang</span>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Link ke Dashboard */}
            <a href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors underline underline-offset-2">
                Lihat Dashboard Admin →
            </a>
        </div>
    );
}
