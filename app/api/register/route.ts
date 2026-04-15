import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { compareEuclideanDistance } from "@/lib/faceDescriptor";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { nama, nis, faceEmbeddings } = body;

        // Validasi input dasar untuk Multi-Sample Array
        if (!nama || !nis || !faceEmbeddings || !Array.isArray(faceEmbeddings) || faceEmbeddings.length < 3) {
            return NextResponse.json(
                { success: false, message: "Data tidak lengkap. Harap selesaikan 3 sesi foto (Depan, Kiri, Kanan)." },
                { status: 400 }
            );
        }

        // 2. Validasi panjang 128D FaceNet (memastikan dikirim dari client valid)
        if (faceEmbeddings[0].length !== 128 || faceEmbeddings[1].length !== 128 || faceEmbeddings[2].length !== 128) {
            return NextResponse.json(
                { success: false, message: "Kalkulasi geometri gagal. Pastikan wajah terlihat penuh ke arah kamera." },
                { status: 400 }
            );
        }

        // Gabungkan ke master JSON Array
        const combinedDesc = faceEmbeddings; // array dari tiga Float32Arrays 128D

        // 1. Cek apakah NIS sudah terdaftar
        const existingSiswa = await prisma.siswa.findUnique({
            where: { nis: nis }
        });

        if (existingSiswa) {
            return NextResponse.json(
                { success: false, message: `Gagal! NIS ${nis} sudah terdaftar atas nama ${existingSiswa.nama}.` },
                { status: 400 }
            );
        }

        // 2. Anti-Spoofing: Cek apakah wajah yang sama sudah terdaftar (Cross Validasi 3 Sudut)
        const allSiswa = await prisma.siswa.findMany({
            select: { nama: true, nis: true, faceEmbedding: true }
        });

        for (const siswaDb of allSiswa) {
            if (siswaDb.faceEmbedding && Array.isArray(siswaDb.faceEmbedding)) {
                let dbEmbeds = siswaDb.faceEmbedding as any[];
                let minDistance = 999;

                // Memastikan data di DB adalah Array of Descriptors
                if (dbEmbeds.length > 0) {
                    for (const dbDesc of dbEmbeds) {
                        for (const newDesc of combinedDesc) {
                            const jarak = compareEuclideanDistance(dbDesc, newDesc);
                            if (jarak < minDistance) minDistance = jarak;
                        }
                    }
                }

                // Threshold 0.40: ketat, mencegah false positive saat pendaftaran
                if (minDistance <= 0.40) {
                    return NextResponse.json(
                        { 
                            success: false, 
                            message: `Wajah ini terdeteksi sebagai ${siswaDb.nama} (NIS: ${siswaDb.nis}) dengan skor Jarak Biometrik ${minDistance.toFixed(3)}!` 
                        },
                        { status: 400 }
                    );
                }
            }
        }

        // 3. Jika aman, simpan seluruh 3 Descriptor ke database
        const siswaBaru = await prisma.siswa.create({
            data: {
                nama: nama,
                nis: nis,
                faceEmbedding: combinedDesc, // Disimpan sebagai JSON
            },
        });

        return NextResponse.json({
            success: true,
            message: "Siswa berhasil didaftarkan dengan pengenalan 3D presisi tinggi!",
            data: {
                nama: siswaBaru.nama,
                nis: siswaBaru.nis
            }
        });

    } catch (error: any) {
        console.error("Error API Register:", error);
        return NextResponse.json(
            { success: false, message: `Terjadi kesalahan server: ${error.message}` },
            { status: 500 }
        );
    }
}