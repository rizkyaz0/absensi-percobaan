/**
 * lib/faceDescriptor.ts
 * 
 * Algoritma Geometric Ratio Descriptor
 * Berbasis perbandingan jarak antar landmark, bukan koordinat mentah.
 * Sistem ini jauh lebih diskriminatif antar individu karena rasio jarak
 * tidak terpengaruh ekspresi, rotasi kepala, atau jarak ke kamera.
 */

interface Landmark {
    x: number;
    y: number;
    z: number;
}

/**
 * lib/faceDescriptor.ts
 * 
 * Modul Evaluasi Deep Learning 128-D FaceNet (via face-api.js)
 * Sangat presisi (Akreditasi Biometrik). Jangkauan mutlak (Euclidean Distance).
 */

/**
 * Bandingkan 2 face descriptor 128D (Float32Array) menggunakan Euclidean Distance.
 * Threshold yang diakui FaceNet adalah < 0.45 (Kembar identik / Orang yang sama)
 * @param desc1 Vector Float Array A
 * @param desc2 Vector Float Array B 
 * @returns Jarak (semakin mendekati 0.0, semakin 100% sama)
 */
export function compareEuclideanDistance(desc1: any[] | Float32Array | object, desc2: any[] | Float32Array | object): number {
    // Pastikan array terdeteksi karena hasil simpanan database berformat objek JSON.
    const arr1 = Object.values(desc1);
    const arr2 = Object.values(desc2);

    if (!arr1 || !arr2 || arr1.length !== 128 || arr2.length !== 128) return 1.0;

    let distance = 0;
    for (let i = 0; i < 128; i++) {
        distance += Math.pow((arr1[i] as number) - (arr2[i] as number), 2);
    }
    
    return Math.sqrt(distance);
}

