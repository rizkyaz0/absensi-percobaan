import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tanggalParam = searchParams.get("tanggal");

        let targetDate: Date;
        if (tanggalParam) {
            targetDate = new Date(tanggalParam);
        } else {
            targetDate = new Date();
        }

        const mulai = new Date(targetDate);
        mulai.setHours(0, 0, 0, 0);
        const selesai = new Date(targetDate);
        selesai.setHours(23, 59, 59, 999);

        const absensiHariIni = await prisma.absensi.findMany({
            where: {
                waktu: { gte: mulai, lte: selesai }
            },
            include: {
                siswa: {
                    select: { nama: true, nis: true }
                }
            },
            orderBy: { waktu: "asc" }
        });

        // Hitung ringkasan
        const totalSiswa = await prisma.siswa.count();
        const hadir = absensiHariIni.filter(a => a.status === "HADIR").length;
        const telat = absensiHariIni.filter(a => a.status === "TELAT").length;
        const tidakHadir = totalSiswa - hadir - telat;

        return NextResponse.json({
            success: true,
            data: absensiHariIni,
            ringkasan: {
                total: totalSiswa,
                hadir,
                telat,
                tidakHadir
            },
            tanggal: targetDate.toISOString().split("T")[0]
        });

    } catch (error: any) {
        console.error("Error API Admin Absensi:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
