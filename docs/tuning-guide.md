# Tuning Guide - Accurate Counting 4 Sisi

Panduan ini fokus ke tuning agar hasil counting unik lebih stabil sesuai kondisi lapangan.

## 1) Parameter Utama

### A. Inferensi Model

- `conf` (confidence threshold model)
- `iou` (NMS IoU threshold model)
- `imgsz` (image size inferensi)

### B. Deduplikasi 4 Sisi

- `autoMergeMin`
- `ambiguousMin`

Kedua parameter dedup bisa diatur dari menu konfigurasi.

### C. Tracking Video

- `trackConf` / minimum confidence tracker
- `nmsIou` / NMS IoU internal tracker
- `maxDistPct` / jarak centroid maksimal antar frame
- `maxAge` / umur track tanpa update
- `minHits` / minimal kemunculan sebelum dihitung unik

## 2) Aturan Penting

- `ambiguousMin` **harus selalu lebih kecil** dari `autoMergeMin`.
- Jika dua nilai terlalu dekat, terlalu banyak pasangan masuk auto-merge atau review tanpa separasi yang sehat.

## 3) Default yang Direkomendasikan

- `autoMergeMin = 0.82`
- `ambiguousMin = 0.68`

Default ini konservatif untuk menekan overcount.

## 4) Gejala dan Cara Menyesuaikan

### Kasus A: Overcount tinggi (buah sama dihitung dua kali)

Ubah:
- naikkan `autoMergeMin` bertahap (`+0.01` sampai `+0.03`)
- naikkan `ambiguousMin` bertahap (`+0.01` sampai `+0.03`)
- bila perlu, naikkan `conf` inferensi sedikit

Efek:
- auto-merge jadi lebih ketat,
- lebih banyak kasus masuk review manual.

### Kasus B: Undercount tinggi (buah berbeda malah digabung)

Ubah:
- turunkan `autoMergeMin` bertahap (`-0.01` sampai `-0.03`)
- turunkan `ambiguousMin` sedikit (`-0.01` sampai `-0.02`)
- bila perlu, turunkan `conf` sedikit agar kandidat kecil tetap terdeteksi

Efek:
- merge lebih toleran,
- risiko overcount harus tetap dipantau.

### Kasus C: Terlalu banyak pasangan ambigu

Ubah:
- turunkan `ambiguousMin` sedikit agar kasus borderline langsung menjadi separate,
- atau naikkan `autoMergeMin` jika ingin mempertahankan konservatif anti-overcount.

## 5) Protokol Tuning yang Disarankan

1. Siapkan set validasi kecil (mis. 20 pohon, masing-masing 4 sisi, ground truth count).
2. Jalankan baseline dengan default.
3. Catat:
   - error overcount total,
   - error undercount total,
   - jumlah review ambigu per pohon.
4. Ubah 1 parameter saja per iterasi.
5. Re-run dan bandingkan metrik.
6. Simpan konfigurasi terbaik per kondisi kebun/kamera.

Untuk mode video, gunakan set validasi terpisah berbasis klip video dan ukur:
1. error overcount,
2. error undercount,
3. stabilitas track (ID switch / kehilangan track),
4. waktu proses per video.

## 6) Praktik Capture untuk Meningkatkan Akurasi

- jaga jarak kamera antar sisi konsisten,
- rotasi sekitar 90 derajat per sisi,
- hindari blur berat,
- minimalkan perubahan exposure ekstrem antar sisi,
- usahakan area kanopi objek tetap masuk frame.

## 7) Checklist Diagnostik Cepat

Jika hasil aneh:
- pastikan urutan sisi benar (Depan/Kanan/Belakang/Kiri),
- cek API key valid dan inferensi sukses di keempat sisi,
- cek jumlah deteksi mentah per sisi (terlalu rendah = masalah inferensi/capture),
- cek apakah ambiguous review diselesaikan dengan benar,
- cek `Ringkasan Kelas` untuk melihat apakah komposisi kelas masuk akal.

## 8) Strategi Operasional

- Untuk fase awal produksi:
  - prioritaskan anti-overcount (konservatif),
  - wajibkan review ambigu.
- Untuk throughput tinggi:
  - kalibrasi threshold agar review ambigu tidak terlalu banyak,
  - tetap audit sampel harian untuk mencegah drift kualitas.

## 9) Memilih Mode yang Tepat

- Pakai `4 sisi` jika tujuan utama adalah hitung akurat per pohon.
- Pakai `video` jika tujuan utama adalah throughput dan pemindaian area.

Prinsip akurasi:
- mode 4 sisi cenderung lebih presisi untuk satu pohon (multi-view terarah),
- mode video cenderung lebih efisien untuk alur panjang, tapi sensitif pada gerak kamera dan occlusion.

## 10) Standar Output ke User

Agar user tidak bingung, interpretasi hasil di UI diseragamkan:
- fokus ke jumlah unik,
- tampilkan konteks deteksi mentah,
- tampilkan confidence rata-rata,
- tampilkan kelas dengan warna konsisten antar mode.
