# Tuning Guide — Skor Deduplikasi Lintas-Sisi

Panduan singkat untuk menyetel parameter scoring di `js/dedup-utils.js` agar saran tautan lintas sisi sesuai kondisi capture lapangan.

> Algoritma sudah menerapkan Tahap 1–3 (hard gate seam band, size ratio gate, class sebagai pengali, mutual best pair, UI toggle saran, breakdown sinyal per saran). Detail di [README.md](../README.md#algoritma-saran-tahap-1--2-aktif).

## 1) Parameter

Parameter `suggestPairs(bboxesA, imgA, bboxesB, imgB, opts)`:

| Param | Default | Keterangan |
|---|---|---|
| `autoMin` | `0.75` | Skor ≥ ambang ini → kategori `auto` (saran kuat) |
| `candidateMin` | `0.50` | Skor ≥ ambang ini → kategori `candidate` (saran lemah) |
| `seamBandFraction` | `0.50` | Hard gate: hanya bbox yang pusatnya berada dalam separuh gambar dekat seam yang dipertimbangkan |
| `vertTol` | `0.20` | Fraksi tinggi gambar yang ditoleransi sebagai perbedaan centroid Y |
| `sizeRatioMin` | `0.30` | Hard gate rasio luas minimum `min(areaA,areaB)/max` |
| `mutualBest` | `true` | Jika `false`, fallback ke greedy sort-by-score (legacy) |

Skoring (bobot hard-coded):

```
score = (0.45 × seam + 0.35 × vert + 0.20 × size) × classMult
```

`classMult`:

- sama class → `1.0`
- beda ±1 grade → `0.85`
- lainnya → `0.5`

## 2) Aturan Penting

- `candidateMin` **harus** lebih kecil dari `autoMin`. Kalau terlalu dekat, hampir semua saran jadi auto-merge — user kehilangan ruang approve/tolak.
- `seamBandFraction` tidak boleh > `1.0`. Nilai 0.50 = separuh gambar. Nilai > 0.60 cenderung mengembalikan banyak false positive (mengalahkan tujuan gate).
- Hard gate menolak pair lebih awal dari scoring. Kalau tandan yang jelas sama tidak pernah muncul di saran, cek dulu apakah pusatnya tertahan di `seamBandFraction` atau `sizeRatioMin`.

## 3) Default yang Direkomendasikan

`autoMin = 0.75`, `candidateMin = 0.50`, `seamBandFraction = 0.50`, `sizeRatioMin = 0.30`. Konservatif — user tetap bisa menambahkan link manual untuk borderline.

## 4) Gejala dan Cara Menyesuaikan

### Kasus A — Banyak saran auto yang sebenarnya bukan tandan sama

- Naikkan `autoMin` (`+0.02` sampai `+0.05`).
- Turunkan `seamBandFraction` (mis. `0.45`) supaya hanya bbox yang benar-benar mepet seam yang dipertimbangkan.
- Cek `vertTol` — tandan beda tinggi seharusnya tidak match; kalau terlalu longgar, kecilkan (`0.15`).

### Kasus B — Tandan yang jelas-jelas sama tidak muncul sebagai saran

- Turunkan `candidateMin` (`-0.05` sampai `-0.10`) supaya borderline ikut tampil.
- Naikkan `seamBandFraction` pelan-pelan (mis. `0.55`) jika bbox target agak jauh dari seam (lensa wide, framing longgar).
- Longgarkan `sizeRatioMin` ke `0.25` jika ada perbedaan zoom antar sisi.
- Cek panel saran setelah rerun — breakdown sinyal (seam/vert/size/cls) menunjukkan sinyal mana yang mematikan skor.

### Kasus C — Class mismatch sering jadi blocker

`classMult` sudah dibuat lebih toleran (min `0.5`, tidak pernah 0). Kalau label awal memang sering keliru kelas ±1, sinyal class memberi pengali `0.85` — dampaknya ringan. Kalau perlu lebih toleran lagi, edit `_classMultiplier()` di `dedup-utils.js`.

### Kasus D — Geometry capture tidak konsisten (jarak/zoom berubah antar sisi)

- `size` similarity (20%) + `sizeRatioMin` (hard gate) akan menjatuhkan banyak pair. Longgarkan `sizeRatioMin` ke `0.20` kalau kamera memang sering berubah zoom.
- Jangka panjang: standardisasi protokol capture lebih efektif daripada tuning.

### Kasus E — Satu bbox dominan "merampok" banyak match

Harusnya sudah tertangani oleh mutual best assignment. Jika masih terjadi, pastikan `mutualBest: true`. Pair yang lolos mutual berarti memang kedua bbox saling menganggap pasangan terbaik.

## 5) Protokol Tuning

1. Siapkan validation set kecil (mis. 20 pohon dengan ground truth jumlah tandan unik dan pasangan yang benar).
2. Jalankan baseline default. Catat per pohon:
   - jumlah tandan unik vs ground truth (over/under),
   - jumlah saran auto yang user tolak,
   - jumlah link manual yang user tambahkan (= recall miss algoritma).
3. Ubah **satu parameter** per iterasi. Jangan tuning dua knob sekaligus — efeknya susah dipisahkan.
4. Re-run `Jalankan Saran` (`R`) dan bandingkan metrik.
5. Simpan konfigurasi terbaik per kondisi kebun/kamera.

## 6) Praktik Capture untuk Meningkatkan Akurasi

- Rotasi konsisten ≈ 360°/N antar sisi (mis. 90° untuk 4 sisi, 45° untuk 8 sisi).
- Jaga jarak kamera ke pohon kira-kira sama di tiap sisi.
- Hindari blur berat dan exposure ekstrem.
- Pastikan tandan di tepi pohon masuk ke frame dua sisi yang berdekatan — itu basis agar algoritma punya dua observasi bbox yang mepet seam di masing-masing foto.

## 7) Checklist Diagnostik Cepat

Jika hasil terlihat aneh:

- Cek urutan sisi (`_1` = Sisi 1, `_2` = Sisi 2, …) sesuai dengan urutan rotasi fisik.
- Cek jumlah bbox per sisi sebelum dedup — anomali ekstrem biasanya dari label awal yang buruk, bukan dari scoring.
- Pastikan koreksi anotasi (Tab 1) sudah selesai sebelum jalankan saran. Bbox baru / hapus / ubah kelas tidak ter-refleksi sampai user rerun saran (`R`).
- Toggle **Saran** (`S`) untuk melihat gambar tanpa overlay — kadang distraksi saran menyembunyikan pattern visual yang jelas.
- Breakdown sinyal per saran menunjukkan **alasan** skor: skor rendah karena `seam` kecil berarti bbox jauh dari seam; karena `vert` kecil berarti beda tinggi; karena `cls` 0.5 berarti class mismatch.
- Cek pasangan yang user tolak dan link manual yang ditambahkan — pola berulang menunjukkan parameter mana yang perlu diubah.

## 8) Catatan

App ini **tidak** melakukan inferensi YOLO atau tracking video. Parameter terkait `conf`, `iou`, `imgsz`, `trackConf`, `maxAge`, dsb. yang ada di versi sebelumnya sudah dihapus. Untuk mengubah label awal, lakukan inferensi di luar app (mis. CLI Ultralytics) lalu muat folder dataset hasilnya ke app ini untuk koreksi & dedup.
