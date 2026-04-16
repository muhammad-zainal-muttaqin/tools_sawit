# Tuning Guide — Skor Deduplikasi Lintas-Sisi

Panduan singkat untuk menyetel parameter scoring di `js/dedup-utils.js` agar saran tautan lintas sisi sesuai kondisi capture lapangan.

## 1) Parameter

Parameter `suggestPairs(...)`:

| Param | Default | Keterangan |
|---|---|---|
| `autoMin` | 0.75 | Skor ≥ ambang ini → kategori `auto` (saran kuat) |
| `candidateMin` | 0.50 | Skor ≥ ambang ini → kategori `candidate` (saran lemah) |
| `edgeDecay` | 0.30 | Fraksi lebar gambar di mana sinyal edge proximity meluruh ke 0 |
| `vertTol` | 0.20 | Fraksi tinggi gambar yang ditoleransi sebagai perbedaan centroid Y |

Bobot sinyal (saat ini hard-coded):

```
score = 0.40 × edge + 0.35 × vert + 0.15 × class + 0.10 × size
```

## 2) Aturan Penting

- `candidateMin` **harus selalu lebih kecil** dari `autoMin`.
- Kalau dua nilai terlalu dekat, hampir semua saran masuk auto-merge tanpa zona "candidate" — user kehilangan ruang untuk approve/tolak nuansa.

## 3) Default yang Direkomendasikan

`autoMin = 0.75`, `candidateMin = 0.50`. Konservatif untuk anti-overcount; user tetap bisa menambahkan link manual untuk kasus skor rendah.

## 4) Gejala dan Cara Menyesuaikan

### Kasus A — Banyak saran auto yang sebenarnya bukan tandan sama

- Naikkan `autoMin` (`+0.02` sampai `+0.05`).
- Pastikan `vertTol` tidak terlalu longgar (tandan beda tinggi seharusnya tidak match).

### Kasus B — Tandan yang jelas-jelas sama tidak muncul sebagai saran

- Turunkan `candidateMin` (`-0.05` sampai `-0.10`) supaya borderline ikut tampil sebagai saran.
- Cek `edgeDecay` — kalau objek yang seharusnya match jauh dari tepi gambar, perbesar `edgeDecay` (mis. 0.40) sehingga sinyal edge tidak buru-buru meluruh ke 0.

### Kasus C — Class mismatch sering jadi blocker

Class similarity hanya bobot 15%. Kalau klasifikasi label sering keliru ±1 grade (mis. B2 vs B3 di sisi berbeda), sinyal class-nya sudah memberi 0.6, dampak ke total skor moderat. Kalau perlu lebih toleran, edit bobot di `dedup-utils.js`.

### Kasus D — Geometry capture tidak konsisten (jarak/zoom berubah antar sisi)

- `size` similarity (10%) akan menurun. Kompensasi dengan `edgeDecay` lebih besar dan `vertTol` sedikit longgar.
- Jangka panjang: standardisasi protokol capture.

## 5) Protokol Tuning

1. Siapkan validation set kecil (mis. 20 pohon dengan ground truth jumlah tandan unik).
2. Jalankan baseline default, catat:
   - jumlah tandan unik vs ground truth (over/under),
   - berapa saran auto yang user tolak,
   - berapa link manual yang user tambahkan (= recall miss algoritma).
3. Ubah satu parameter per iterasi.
4. Re-run, bandingkan metrik di atas.
5. Simpan konfigurasi terbaik per kondisi kebun/kamera.

## 6) Praktik Capture untuk Meningkatkan Akurasi

- Rotasi konsisten ≈ 90° antar sisi (Depan → Kanan → Belakang → Kiri).
- Jaga jarak kamera ke pohon kira-kira sama di tiap sisi.
- Hindari blur berat dan exposure ekstrem.
- Pastikan tandan di tepi pohon masuk ke frame dua sisi yang berdekatan (itu yang bikin algoritma bisa match-nya).

## 7) Checklist Diagnostik Cepat

Jika hasil terlihat aneh:

- Cek urutan sisi (`Depan/Kanan/Belakang/Kiri` = `_1/_2/_3/_4`).
- Cek jumlah bbox per sisi sebelum dedup — anomali ekstrem biasanya berasal dari label awal yang buruk, bukan dari scoring.
- Pastikan koreksi anotasi (Tab 1) sudah selesai sebelum jalankan saran dedup. Bbox baru / hapus / ubah kelas tidak akan ter-refleksi sampai user me-rerun saran (`R`).
- Cek pasangan yang user tolak dan link manual yang ditambahkan — pola berulang menunjukkan parameter mana yang perlu diubah.

## 8) Catatan

App ini **tidak** lagi melakukan inferensi YOLO atau tracking video. Parameter terkait `conf`, `iou`, `imgsz`, `trackConf`, `maxAge`, dsb. yang ada di versi sebelumnya sudah dihapus. Untuk mengubah label awal, lakukan inferensi di luar app (mis. CLI Ultralytics) lalu muat folder dataset hasilnya ke app ini untuk koreksi & dedup.
