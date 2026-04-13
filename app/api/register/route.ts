import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFaceDescriptor, compareFaceDescriptors } from "@/lib/faceDescriptor";

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

        // Ekstrak dan Normalisasi 3 descriptor wajah
        const descDepan = getFaceDescriptor(faceEmbeddings[0]);
        const descKiri = getFaceDescriptor(faceEmbeddings[1]);
        const descKanan = getFaceDescriptor(faceEmbeddings[2]);

        if (!descDepan.length || !descKiri.length || !descKanan.length) {
            return NextResponse.json(
                { success: false, message: "Kalkulasi geometri gagal. Pastikan wajah terlihat jelas tanpa halangan tebal." },
                { status: 400 }
            );
        }

        // Gabungkan ke master JSON Array
        const combinedDesc = [descDepan, descKiri, descKanan];

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
                let maxSimilarity = 0;

                // Memastikan data di DB adalah Array of Descriptors (untuk kompatibilitas ke belakang)
                if (dbEmbeds.length > 0 && Array.isArray(dbEmbeds[0])) {
                    // Cek silang setiap sudut wajah di DB dengan 3 sudut wajah pendaftar
                    for (const dbDesc of dbEmbeds) {
                        for (const newDesc of combinedDesc) {
                            const skor = compareFaceDescriptors(dbDesc, newDesc);
                            if (skor > maxSimilarity) maxSimilarity = skor;
                        }
                    }
                }

                // Threshold Cosine Similarity ketat: >= 0.94 (Karena titik sudah dibobot dan kebal fluktuasi)
                if (maxSimilarity >= 0.94) {
                    return NextResponse.json(
                        { 
                            success: false, 
                            message: `Wajah ini terdeteksi sebagai ${siswaDb.nama} (NIS: ${siswaDb.nis}) dengan skor Biometrik ${(maxSimilarity * 100).toFixed(1)}%!` 
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