"use client";
import React, { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";

// Lazy load API di Client-side untuk menghindari Next.js SSR Build Error (TextEncoder)
let faceapi: any = null;
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Scan, Camera, ArrowLeftCircle, ArrowRightCircle, CheckCircle2 } from "lucide-react";

type RegStep = "depan" | "kiri" | "kanan" | "submitting" | "success";

export default function RegisterWajah() {
    const webcamRef = useRef<Webcam>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [loadingText, setLoadingText] = useState("Mempersiapkan...");
    const [nama, setNama] = useState("");
    const [nis, setNis] = useState("");
    
    // Core State
    const [step, setStep] = useState<RegStep>("depan");
    const [embeddings, setEmbeddings] = useState<number[][]>([]);

    useEffect(() => {
        async function loadModels() {
            try {
                // Import dinamis di sisi klien
                if (!faceapi) {
                    setLoadingText("Memuat AI Engine...");
                    faceapi = await import("@vladmandic/face-api");
                }

                const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
                
                // TinyFaceDetector: 30x lebih cepat dari SSD, dirancang untuk mobile
                setLoadingText("Memuat Detektor Wajah...");
                await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
                
                setLoadingText("Memuat Landmark Model...");
                await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
                
                setLoadingText("Memuat Model Biometrik...");
                await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                
                setModelsLoaded(true);
            } catch (error) {
                console.error("Gagal memuat model:", error);
                toast.error("Gagal terhubung ke Data Server AI");
            }
        }
        loadModels();
    }, []);

    const captureFrame = async () => {
        if (!modelsLoaded || !faceapi || !webcamRef.current || !webcamRef.current.video) return;
        if (!nama || !nis) {
            toast.warning("Nama dan NIS wajib diisi di awal");
            return;
        }

        const videoEl = webcamRef.current.video;
        if (videoEl.readyState !== 4) return;

        try {
            // TinyFaceDetector: jauh lebih cepat & optimal untuk mobile
            const result = await faceapi
                .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
                .withFaceLandmarks(true) // true = gunakan 68-point tiny model
                .withFaceDescriptor();

            if (result) {
                // Konversi Float32Array ke Array native agar bisa dikirim sebagai JSON
                const faceDescriptor = Array.from(result.descriptor) as number[];
                
                const newEmbeddings = [...embeddings, faceDescriptor];
                setEmbeddings(newEmbeddings);
                
                if (step === "depan") {
                    toast.success("Foto Depan Tertangkap!");
                    setStep("kiri");
                } else if (step === "kiri") {
                    toast.success("Foto Kiri Tertangkap!");
                    setStep("kanan");
                } else if (step === "kanan") {
                    toast.success("Mengkalkulasi Biometrik FaceNet...");
                    setStep("submitting");
                    submitData(newEmbeddings);
                }
            } else {
                toast.error("Wajah tidak terdeteksi. Posisikan kembali dengan pencahayaan terang.");
            }
        } catch (e: any) {
            toast.error(`Kamera Error: ${e.message}`);
        }
    };

    const submitData = async (finalEmbeddings: number[][]) => {
        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nama: nama,
                    nis: nis,
                    faceEmbeddings: finalEmbeddings,
                }),
            });

            const hasil = await response.json();
            if (hasil.success) {
                toast.success("Registrasi Sukses!", { description: `Data 3 Sudut Wajah untuk ${nama} berhasil disimpan ke Biometrik Cloud.` });
                setStep("success");
                setNama("");
                setNis("");
                setTimeout(() => { setStep("depan"); setEmbeddings([]); }, 3000);
            } else {
                toast.error("Ditolak!", { description: hasil.message });
                setStep("depan");
                setEmbeddings([]);
            }
        } catch (err) {
            toast.error("Terjadi kesalahan jaringan/server.");
            setStep("depan");
            setEmbeddings([]);
        }
    };

    const getUI = () => {
        switch(step) {
            case "depan": return { label: "Ambil Foto Wajah Depan", icon: <Camera className="w-5 h-5" />, color: "bg-blue-600 hover:bg-blue-700" };
            case "kiri": return { label: "Ambil Foto Tengok Kiri", icon: <ArrowLeftCircle className="w-5 h-5" />, color: "bg-purple-600 hover:bg-purple-700" };
            case "kanan": return { label: "Ambil Foto Tengok Kanan", icon: <ArrowRightCircle className="w-5 h-5" />, color: "bg-yellow-600 hover:bg-yellow-700 text-slate-900" };
            case "submitting": return { label: "Menyimpan ke Database...", icon: <Scan className="w-5 h-5 animate-spin" />, color: "bg-cyan-600 cursor-not-allowed opacity-80" };
            case "success": return { label: "Selesai", icon: <CheckCircle2 className="w-5 h-5" />, color: "bg-green-600 cursor-not-allowed" };
        }
    };
    const ui = getUI();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4 gap-4">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-white tracking-tight">Daftar Wajah 3D</h1>
                <p className="text-slate-400 text-sm mt-1">
                    Ambil 3 sisi wajah untuk presisi 99%
                </p>
            </div>

            <Card className="w-full max-w-lg md:max-w-2xl bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-2xl rounded-3xl -mt-2">
                <CardContent className="p-3 md:p-6 space-y-5 pt-6 md:pt-8">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-300 ml-1">Nama Lengkap</label>
                            <Input 
                                disabled={step !== "depan"}
                                placeholder="Masukkan nama..." 
                                value={nama} 
                                onChange={(e) => setNama(e.target.value)} 
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 disabled:opacity-50" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-300 ml-1">NIS (Nomor Induk Siswa)</label>
                            <Input 
                                disabled={step !== "depan"}
                                placeholder="Masukkan NIS..." 
                                value={nis} 
                                onChange={(e) => setNis(e.target.value)} 
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 disabled:opacity-50" 
                            />
                        </div>
                    </div>

                    {/* Indikator Progres */}
                    <div className="flex justify-between items-center px-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${embeddings.length >= 1 ? 'bg-green-500 text-white' : step === 'depan' ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-800' : 'bg-slate-700 text-slate-400'}`}>1</div>
                        <div className={`flex-1 h-1 mx-2 rounded ${embeddings.length >= 1 ? 'bg-green-500' : 'bg-slate-700'}`}></div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${embeddings.length >= 2 ? 'bg-green-500 text-white' : step === 'kiri' ? 'bg-purple-600 text-white ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-800' : 'bg-slate-700 text-slate-400'}`}>2</div>
                        <div className={`flex-1 h-1 mx-2 rounded ${embeddings.length >= 2 ? 'bg-green-500' : 'bg-slate-700'}`}></div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${embeddings.length >= 3 ? 'bg-green-500 text-white' : step === 'kanan' ? 'bg-yellow-500 text-slate-900 ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-800' : 'bg-slate-700 text-slate-400'}`}>3</div>
                    </div>

                    <div className={`relative aspect-[3/4] md:aspect-video rounded-2xl overflow-hidden bg-black border-2 border-slate-600/50 transition-all duration-300 shadow-inner`}>
                        <Webcam
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover scale-x-[-1] opacity-90 hover:opacity-100 transition-opacity"
                            videoConstraints={{ facingMode: "user" }}
                        />
                        
                        {!modelsLoaded && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white gap-3 z-10">
                                <Scan className="animate-spin w-8 h-8 text-blue-400" />
                                <span className="text-sm font-medium animate-pulse text-center px-4">{loadingText}</span>
                                <span className="text-xs text-slate-400">Mengunduh dari server, harap tunggu...</span>
                            </div>
                        )}

                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-[55%] h-[65%] border-[3px] border-dashed border-white/40 rounded-[120px]"></div>
                        </div>
                    </div>

                    <Button
                        className={`w-full h-14 text-base font-semibold shadow-lg transition-all duration-300 ${ui.color}`}
                        onClick={captureFrame}
                        disabled={step === "submitting" || step === "success" || !modelsLoaded}
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