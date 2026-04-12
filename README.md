# SawitAI

Frontend app untuk deteksi tandan sawit dari endpoint Ultralytics (YOLO) dengan dua mode counting:
- `Deteksi File Tunggal` (gambar/video),
- `Hitung 1 Pohon (4 Foto)` untuk deduplikasi lintas sisi (Depan, Kanan, Belakang, Kiri).

## Dokumentasi

- [Arsitektur dan flow lengkap](docs/architecture.md)
- [Panduan tuning akurasi counting](docs/tuning-guide.md)

## Update Terbaru

- Mode 4 sisi sekarang menampilkan `Ringkasan Kelas` (bukan hanya ringkasan per sisi).
- Tabel `Cluster Tandan Unik` sekarang menampilkan `kelas dominan` per cluster.
- Warna kelas diselaraskan antar mode 4 sisi dan mode video agar tidak membingungkan user.
- Review ambigu menggunakan full-frame (bukan crop) agar keputusan manusia lebih kontekstual.
- Dedup 4 sisi tetap memakai kebijakan `adjacent-side only` untuk menekan false match ekstrem.
- Ditambahkan konfigurasi sidebar `Deduplikasi Bounding Box (Semua Mode)` untuk mengurangi box ganda overlap/geser tipis.

## Ringkasan Flow 4 Sisi

```mermaid
flowchart LR
  A[Upload 4 Sisi] --> B[Predict Sequential ke Backend YOLO]
  B --> C[Deteksi per Sisi]
  C --> C1{Postprocess BBox Dedup Aktif?}
  C1 -->|Ya| C2[Class-aware NMS + Containment]
  C1 -->|Tidak| D[Dedup Adjacent Side Only]
  C2 --> D
  D --> E{Score}
  E -->|>= autoMergeMin| F[Auto Merge]
  E -->|antara threshold| G[Review Ambigu User]
  E -->|< ambiguousMin| H[Separate]
  F --> I[Union-Find Clustering]
  G --> I
  H --> I
  I --> J[Unique Count + Ringkasan Kelas + Cluster]
```

## Ringkasan Flow File Tunggal

```mermaid
flowchart LR
  A[Upload File Tunggal] --> B{Jenis File}
  B -->|Gambar| C[Predict ke Backend YOLO]
  B -->|Video| D[Ekstrak Frame]
  D --> E[Predict per Frame ke Backend YOLO]
  C --> F[Deteksi Mentah]
  E --> F
  F --> G{Postprocess BBox Dedup Aktif?}
  G -->|Ya| H[Class-aware NMS + Containment]
  G -->|Tidak| I[Gunakan Deteksi Mentah]
  H --> J{Mode Video?}
  I --> J
  J -->|Ya| K[Tracking Antar Frame]
  J -->|Tidak| L[Render Hasil Gambar]
  K --> M[Render Hasil Video + Statistik]
```

## Standard Output (User-Facing)

Mode 4 sisi:
- `Tandan Unik`
- `Deteksi Mentah`
- `Merge Deduplikasi`
- `Ringkasan Kelas` (`kelas`, `tandan unik`, `deteksi mentah`, `avg confidence`)
- `Cluster Tandan Unik` (`cluster`, `kelas`, `jumlah anggota`, `sisi terlibat`, `avg confidence`)

Mode video:
- `Tandan Unik` (berdasarkan tracking)
- `Frame Diproses`
- `Avg Confidence`
- tabel deteksi frame dengan `kelas` + warna konsisten

## Konfigurasi Baru (Sidebar)

Bagian `Deduplikasi Bounding Box (Semua Mode)` berlaku untuk:
- `Deteksi File Tunggal` (gambar/video),
- `Hitung 1 Pohon (4 Foto)`.

Parameter:
- `Aktifkan deduplikasi box setelah inferensi`
- `Post NMS IoU` (default `0.45`)
- `Containment Threshold` (default `0.82`)

Semua disimpan di `localStorage` key `sawitai_postprocess`.

## Menjalankan Lokal

```bash
python -m http.server 5500
```

Buka `http://localhost:5500`.
