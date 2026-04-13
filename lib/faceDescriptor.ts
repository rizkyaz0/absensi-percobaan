/**
 * lib/faceDescriptor.ts
 * 
 * Algoritma Cosine Similarity + Centering & Scaling Normalization
 * Pendekatan paling robust berstandar ilmiah.
 */

interface Landmark {
    x: number;
    y: number;
    z: number;
}

/** Hitung jarak 3D */
const dist3D = (a: Landmark, b: Landmark): number =>
    Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));

/**
 * Normalisasi Centering (Fokus hidung) & Scaling (Lebar pupil)
 * dan memberikan bobot (Weight) pada setiap titik.
 */
export function getFaceDescriptor(lm: Landmark[]): number[] {
    if (!lm || lm.length < 478) return [];

    // 1. Centering (Pusat di ujung hidung [titik 1])
    const cx = lm[1].x;
    const cy = lm[1].y;
    const cz = lm[1].z;

    // 2. Scaling (Jarak antar sudut mata bagian dalam sebagai skala universal)
    const distEye = Math.sqrt(
        Math.pow(lm[133].x - lm[362].x, 2) +
        Math.pow(lm[133].y - lm[362].y, 2) +
        Math.pow(lm[133].z - lm[362].z, 2)
    );
    const scale = distEye > 0.0001 ? distEye : 1;

    // 3. Weighted Extraction
    const descriptor: number[] = [];
    
    // Titik Mata & Pangkal Hidung (Sangat Statis & Unik) -> Bobot Tinggi
    const highWeight = new Set([
        // Mata Kiri
        33, 133, 159, 145, 153, 144, 163, 7, 
        // Mata Kanan
        263, 362, 386, 374, 380, 373, 390, 249,
        // Hidung & Dahi Statis
        1, 2, 94, 168, 197, 195, 5, 4,
        70, 63, 105, 66, 107, 336, 296, 334, 293, 300
    ]);
    
    // Titik Mulut, Bibir, Pipi, Rahang Terbawah (Dinamis / Ikut Ekspresi) -> Bobot Rendah
    const lowWeight = new Set([
        0, 17, 13, 14, 61, 291, 39, 269, 18, 58, 288,
        152, 148, 176, 150, 136, 172, 58, 132, 93, 234, 454,
        37, 267, 84, 314, 17, 405, 181
    ]);

    for (let i = 0; i < lm.length; i++) {
        // Normalisasi 3D Point
        const nx = (lm[i].x - cx) / scale;
        const ny = (lm[i].y - cy) / scale;
        const nz = (lm[i].z - cz) / scale;
        
        let w = 1.0; // Normal weight
        if (highWeight.has(i)) w = 2.0; // 2x Bobot untuk tulang keras
        else if (lowWeight.has(i)) w = 0.2; // Turunkan bobot bibir biar kebal senyum
        
        descriptor.push(nx * w, ny * w, nz * w);
    }
    
    return descriptor;
}

/**
 * Bandingkan 2 face descriptor menggunakan Cosine Similarity
 * Mengembalikan skor kemiripan presisi tinggi (0.0 - 1.0)
 */
export function compareFaceDescriptors(desc1: number[], desc2: number[]): number {
    if (!desc1 || !desc2 || desc1.length === 0 || desc1.length !== desc2.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < desc1.length; i++) {
        dotProduct += desc1[i] * desc2[i];
        normA += desc1[i] * desc1[i];
        normB += desc2[i] * desc2[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}


