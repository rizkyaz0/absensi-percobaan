import Link from "next/link";
import { UserPlus, Scan, LayoutDashboard, Shield, ChevronRight } from "lucide-react";

export default function HomePage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-6 md:p-12">
            {/* Hero Section */}
            <div className="text-center mb-16 relative z-10 w-full max-w-3xl">
                <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm px-5 py-2 rounded-full mb-8 shadow-inner shadow-blue-500/20 backdrop-blur-md">
                    <Shield className="w-4 h-4" />
                    Sistem Presensi Biometrik Kelas Enterprise
                </div>
                <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight leading-tight drop-shadow-lg">
                    Absensi Wajah<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 drop-shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                        Real-time & Akurat
                    </span>
                </h1>
                <p className="text-slate-400 mt-6 md:text-lg max-w-2xl mx-auto leading-relaxed">
                    Sistem otomatisasi kehadiran tingkat lanjut berbasis AI. Memanfaatkan arsitektur FaceNet 3D untuk deteksi ekspresi kebal spoofing terintegrasi dengan validasi Geofencing GPS ganda.
                </p>
            </div>

            {/* Navigasi Utama (Responsive Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-5xl z-10 relative">
                
                {/* Registrasi */}
                <Link href="/register_wajah" className="block sm:col-span-1">
                    <div className="group h-full bg-slate-800/60 border border-slate-700 hover:border-blue-500/50 rounded-3xl p-6 text-left transition-all duration-300 hover:bg-slate-800/90 hover:-translate-y-2 cursor-pointer backdrop-blur-sm shadow-xl">
                        <div className="inline-flex p-4 bg-blue-500/10 rounded-2xl mb-6 group-hover:bg-blue-500/20 group-hover:scale-110 transition-all duration-300">
                            <UserPlus className="w-8 h-8 text-blue-400" />
                        </div>
                        <h2 className="text-white font-bold text-xl mb-2 group-hover:text-blue-400 transition-colors">Daftar Wajah 3D</h2>
                        <p className="text-slate-400 text-sm leading-relaxed mb-6">Daftarkan array struktur wajah 478 titik (Depan, Kiri, Kanan) ke database biometrik aman.</p>
                        <div className="flex items-center text-blue-400 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                            Registrasi Siswa <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                    </div>
                </Link>

                {/* Absensi Utama */}
                <Link href="/absen" className="block sm:col-span-1 md:col-span-1 md:-mt-6">
                    <div className="group h-full bg-gradient-to-br from-blue-600/20 to-cyan-600/10 border border-blue-500/40 hover:border-cyan-400/70 rounded-3xl p-6 text-left transition-all duration-300 hover:-translate-y-2 cursor-pointer backdrop-blur-sm shadow-xl">
                        <div className="flex justify-between items-start mb-6">
                            <div className="inline-flex p-4 bg-blue-500/20 rounded-2xl group-hover:bg-blue-500/30 group-hover:scale-110 transition-all duration-300 shadow-inner">
                                <Scan className="w-8 h-8 text-cyan-300 drop-shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
                            </div>
                            <span className="inline-flex animate-pulse text-[10px] uppercase font-bold tracking-wider bg-blue-500/20 text-cyan-300 px-3 py-1 rounded-full border border-blue-500/30">
                                UTAMA
                            </span>
                        </div>
                        <h2 className="text-white font-bold text-xl md:text-2xl mb-2 group-hover:text-cyan-300 transition-colors">Masuk Platform</h2>
                        <p className="text-slate-400 text-sm leading-relaxed mb-6">Portal presensi harian otomatis dengan kalkulator Cosine Similarity untuk akurasi instan ±50ms.</p>
                        <div className="flex items-center text-cyan-300 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                            Pindai Wajah Sekarang <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                    </div>
                </Link>

                {/* Dashboard Admin */}
                <Link href="/admin" className="block sm:col-span-2 md:col-span-1">
                    <div className="group h-full bg-slate-800/60 border border-slate-700 hover:border-purple-500/50 rounded-3xl p-6 text-left transition-all duration-300 hover:bg-slate-800/90 hover:-translate-y-2 cursor-pointer backdrop-blur-sm shadow-xl">
                        <div className="inline-flex p-4 bg-purple-500/10 rounded-2xl mb-6 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all duration-300">
                            <LayoutDashboard className="w-8 h-8 text-purple-400" />
                        </div>
                        <h2 className="text-white font-bold text-xl mb-2 group-hover:text-purple-400 transition-colors">Rekap Data</h2>
                        <p className="text-slate-400 text-sm leading-relaxed mb-6">Pantau log absensi harian, keterlambatan, statistik geofencing, dan analisis laporan bulanan.</p>
                        <div className="flex items-center text-purple-400 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                            Akses Dashboard <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                    </div>
                </Link>

            </div>

            {/* Footer Geometris Pattern */}
            <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-blue-900/10 to-transparent pointer-events-none" />
            <div className="mt-20 flex flex-wrap justify-center gap-x-8 gap-y-4 text-slate-500 text-xs md:text-sm font-medium z-10 w-full text-center tracking-wide pb-8">
                <span className="hover:text-slate-300 transition-colors">Mediapipe Vector Analytics</span>
                <span className="hidden sm:inline">·</span>
                <span className="hover:text-slate-300 transition-colors">Next.js Edge Acceleration</span>
                <span className="hidden sm:inline">·</span>
                <span className="hover:text-slate-300 transition-colors">Prisma 5.x RDBMS</span>
                <span className="hidden md:inline">·</span>
                <span className="hover:text-slate-300 transition-colors">Geospatial Mapping</span>
            </div>
        </div>
    );
}
