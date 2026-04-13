import prisma from "../lib/prisma";

async function seedLokasiSekolah() {
    try {
        const existing = await prisma.lokasiSekolah.findFirst();
        if (existing) {
            console.log("✓ Lokasi sekolah sudah ada di database:", existing);
            return;
        }
        const lokasi = await prisma.lokasiSekolah.create({
            data: {
                nama: "Gerbang Utama Sekolah",
                latitudeSekolah: -6.553109504330063,
                longitudeSekolah: 107.76100057351579,
                radiusMeter: 50,
            },
        });
        console.log("✅ Berhasil menambahkan lokasi sekolah:", lokasi);
    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

seedLokasiSekolah();
