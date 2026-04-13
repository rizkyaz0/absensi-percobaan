"use client";
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Users, CheckCheck, Clock, AlertCircle, RefreshCw, Search, MapPin } from "lucide-react";

interface AbsensiData {
    id: string;
    waktu: string;
    latitude: number;
    longitude: number;
    status: "HADIR" | "TELAT" | "IZIN" | "SAKIT";
    siswa: { nama: string; nis: string };
}

interface Ringkasan {
    total: number;
    hadir: number;
    telat: number;
    tidakHadir: number;
}

export default function AdminPage() {
    const [data, setData] = useState<AbsensiData[]>([]);
    const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
    const [loading, setLoading] = useState(true);
    const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
    const [cari, setCari] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/absensi?tanggal=${tanggal}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
                setRingkasan(json.ringkasan);
            }
        } catch (err) {
            console.error("Gagal mengambil data absensi");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [tanggal]);

    const dataFiltered = data.filter(
        (item) =>
            item.siswa.nama.toLowerCase().includes(cari.toLowerCase()) ||
            item.siswa.nis.includes(cari)
    );

    const statusBadge = (status: string) => {
        switch (status) {
            case "HADIR":
                return <Badge className="bg-green-600/20 text-green-300 border border-green-600/50 hover:bg-green-600/30">HADIR</Badge>;
            case "TELAT":
                return <Badge className="bg-yellow-600/20 text-yellow-300 border border-yellow-600/50 hover:bg-yellow-600/30">TELAT</Badge>;
            case "IZIN":
                return <Badge className="bg-blue-600/20 text-blue-300 border border-blue-600/50 hover:bg-blue-600/30">IZIN</Badge>;
            case "SAKIT":
                return <Badge className="bg-red-600/20 text-red-300 border border-red-600/50 hover:bg-red-600/30">SAKIT</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-4 md:p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white">Dashboard Admin</h1>
                <p className="text-slate-400 mt-1">Rekap Kehadiran Siswa</p>
            </div>

            {/* Kartu Ringkasan */}
            {ringkasan && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-md transition-all duration-300">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10">
                                    <Users className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs">Total Siswa</p>
                                    <p className="text-white text-2xl font-bold">{ringkasan.total}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-800/60 border-slate-700 backdrop-blur-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-green-500/10">
                                    <CheckCheck className="w-5 h-5 text-green-400" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs">Hadir</p>
                                    <p className="text-green-300 text-2xl font-bold">{ringkasan.hadir}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-800/60 border-slate-700 backdrop-blur-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-yellow-500/10">
                                    <Clock className="w-5 h-5 text-yellow-400" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs">Telat</p>
                                    <p className="text-yellow-300 text-2xl font-bold">{ringkasan.telat}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-800/60 border-slate-700 backdrop-blur-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-red-500/10">
                                    <AlertCircle className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs">Tidak Hadir</p>
                                    <p className="text-red-300 text-2xl font-bold">{ringkasan.tidakHadir}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tabel */}
            <Card className="bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-lg overflow-hidden">
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                        <CardTitle className="text-white text-xl">Data Kehadiran</CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Cari nama / NIS..."
                                    value={cari}
                                    onChange={(e) => setCari(e.target.value)}
                                    className="pl-9 bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-400 w-48 rounded-xl"
                                />
                            </div>
                            <Input
                                type="date"
                                value={tanggal}
                                onChange={(e) => setTanggal(e.target.value)}
                                className="bg-slate-900/50 border-slate-600/50 text-white w-40 rounded-xl"
                            />
                            <Button
                                size="icon"
                                variant="outline"
                                className="border-slate-600/50 text-slate-300 hover:bg-slate-700 rounded-xl"
                                onClick={fetchData}
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-12 text-slate-400">
                            <RefreshCw className="animate-spin w-6 h-6" />
                        </div>
                    ) : dataFiltered.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                            <p>Tidak ada data absensi{cari ? ` untuk "${cari}"` : ""} pada tanggal ini.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-700 hover:bg-transparent">
                                        <TableHead className="text-slate-400">No</TableHead>
                                        <TableHead className="text-slate-400">Nama</TableHead>
                                        <TableHead className="text-slate-400">NIS</TableHead>
                                        <TableHead className="text-slate-400">Waktu</TableHead>
                                        <TableHead className="text-slate-400">Status</TableHead>
                                        <TableHead className="text-slate-400">Lokasi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dataFiltered.map((item, idx) => (
                                        <TableRow key={item.id} className="border-slate-700 hover:bg-slate-700/30 transition-colors">
                                            <TableCell className="text-slate-400">{idx + 1}</TableCell>
                                            <TableCell className="text-white font-medium">{item.siswa.nama}</TableCell>
                                            <TableCell className="text-slate-300 font-mono text-sm">{item.siswa.nis}</TableCell>
                                            <TableCell className="text-slate-300">
                                                {new Date(item.waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                            </TableCell>
                                            <TableCell>{statusBadge(item.status)}</TableCell>
                                            <TableCell>
                                                <a
                                                    href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs transition-colors"
                                                >
                                                    <MapPin className="w-3 h-3" />
                                                    {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                                                </a>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Navigasi */}
            <div className="mt-6 flex gap-4 justify-center">
                <a href="/" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← Beranda</a>
                <a href="/absen" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">→ Halaman Absen</a>
            </div>
        </div>
    );
}
