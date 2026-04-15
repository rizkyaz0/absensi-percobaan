import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { compareEuclideanDistance } from "@/lib/faceDescriptor";

/** Haversine Formula: Hitung jarak (meter) antara 2 koordinat GPS */
function hitungJarak(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { faceEmbedding, latitude, longitude } = body;

        if (!faceEmbedding || !Array.isArray(faceEmbedding)) {
            return NextResponse.json({ success: false, message: "Data wajah tidak valid." }, { status: 400 });
        }
        if (latitude === undefined || longitude === undefined) {
            return NextResponse.json({ success: false, message: "Data lokasi GPS tidak ditemukan." }, { status: 400 });
        }

        // 1. Cek Geofencing
        const lokasiSekolah = await prisma.lokasiSekolah.findFirst();
        if (!lokasiSekolah) {
            const LAT_SEKOLAH = -6.553109504330063;
            const LON_SEKOLAH = 107.76100057351579;
            const RADIUS_METER = 50;

            const jarakMeter = hitungJarak(latitude, longitude, LAT_SEKOLAH, LON_SEKOLAH);
            if (jarakMeter > RADIUS_METER) {
                return NextResponse.json({
                    success: false,
                    message: `Anda berada ${Math.round(jarakMeter)} meter dari sekolah. Absensi hanya bisa dalam radius ${RADIUS_METER} meter.`,
                    jarak: Math.round(jarakMeter)
                }, { status: 403 });
            }
        } else {
            const jarakMeter = hitungJarak(latitude, longitude, lokasiSekolah.latitudeSekolah, lokasiSekolah.longitudeSekolah);
            if (jarakMeter > lokasiSekolah.radiusMeter) {
                return NextResponse.json({
                    success: false,
                    message: `Anda berada ${Math.round(jarakMeter)} meter dari ${lokasiSekolah.nama}. Absensi hanya bisa dalam radius ${lokasiSekolah.radiusMeter} meter.`,
                    jarak: Math.round(jarakMeter)
                }, { status: 403 });
            }
        }

        // 2. Validasi input array face-api 128D (langsung dari sisi Client)
        const descBaru = faceEmbedding;
        if (descBaru.length !== 128) {
            return NextResponse.json({ success: false, message: "Kesalahan Array Biometrik. Pastikan kamera Face-API mendeteksi wajah dengan jelas." }, { status: 400 });
        }

        // 3. Cocokkan dengan Master Multi-Sample Array di database
        const allSiswa = await prisma.siswa.findMany({
            select: { id: true, nama: true, nis: true, faceEmbedding: true }
        });

        let siswaCocok: { id: string; nama: string; nis: string } | null = null;
        let jarakTerbaik = 999; // Semakin kecil semakin identik

        for (const siswaDb of allSiswa) {
            if (siswaDb.faceEmbedding && Array.isArray(siswaDb.faceEmbedding)) {
                let dbEmbeds = siswaDb.faceEmbedding as any[];
                let minDistanceLokal = 999;

                if (dbEmbeds.length > 0) {
                    // dbEmbeds seharusnya berisi 3 vektor 128D
                    for (const dbDesc of dbEmbeds) {
                        const jarak = compareEuclideanDistance(dbDesc, descBaru);
                        if (jarak < minDistanceLokal) minDistanceLokal = jarak;
                    }
                }

                if (minDistanceLokal < jarakTerbaik) {
                    jarakTerbaik = minDistanceLokal;
                    // Threshold 0.40: ketat, akurasi tinggi, sesuai standar FaceNet
                    if (minDistanceLokal <= 0.40) {
                        siswaCocok = { id: siswaDb.id, nama: siswaDb.nama, nis: siswaDb.nis };
                    }
                }
            }
        }

        if (!siswaCocok) {
            return NextResponse.json({
                success: false,
                message: `Wajah tidak dikenali. Jarak biometrik terdekat: ${jarakTerbaik.toFixed(3)} (batas: ≤0.40).`,
                skor: jarakTerbaik // Menggunakan jarak untuk display
            }, { status: 404 });
        }

        // 4. Cek sudah absen hari ini?
        const hari_ini_mulai = new Date();
        hari_ini_mulai.setHours(0, 0, 0, 0);
        const hari_ini_selesai = new Date();
        hari_ini_selesai.setHours(23, 59, 59, 999);

        const sudahAbsen = await prisma.absensi.findFirst({
            where: {
                siswaId: siswaCocok.id,
                waktu: { gte: hari_ini_mulai, lte: hari_ini_selesai }
            }
        });

        if (sudahAbsen) {
            return NextResponse.json({
                success: false,
                message: `${siswaCocok.nama} sudah absen hari ini pada ${new Date(sudahAbsen.waktu).toLocaleTimeString('id-ID')}.`,
            }, { status: 409 });
        }

        // 5. Tentukan status
        const jam_sekarang = new Date();
        const jam = jam_sekarang.getHours();
        const menit = jam_sekarang.getMinutes();
        const status: "HADIR" | "TELAT" = (jam > 7 || (jam === 7 && menit >= 30)) ? "TELAT" : "HADIR";

        const absenBaru = await prisma.absensi.create({
            data: {
                siswaId: siswaCocok.id,
                latitude: latitude,
                longitude: longitude,
                status: status,
            }
        });

        return NextResponse.json({
            success: true,
            message: `Absensi berhasil! Selamat datang, ${siswaCocok.nama}!`,
            data: {
                nama: siswaCocok.nama,
                nis: siswaCocok.nis,
                status: status,
                waktu: absenBaru.waktu,
                skor: `Distance: ${jarakTerbaik.toFixed(3)}`
            }
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, message: `Server Error: ${error.message}` }, { status: 500 });
    }
}
