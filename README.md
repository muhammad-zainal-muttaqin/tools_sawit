# SawitAI — Tools Koreksi Dataset Sawit

Aplikasi web **offline** (vanilla JS, tanpa backend, tanpa build step) untuk:

1. **Koreksi anotasi** dataset YOLO tandan sawit (B1–B4) per gambar.
2. **Deduplikasi lintas-sisi** antar foto pohon yang sama (Sisi 1 … Sisi N, bersebelahan).
3. **Hitung tandan unik** per pohon dan **ekspor JSON output** sesuai spesifikasi.

Bekerja sepenuhnya di browser dari folder dataset lokal yang sudah berisi gambar + label `.txt` YOLO. Tidak ada panggilan API, tidak ada inferensi model di app — model hanya dipakai sebelumnya untuk menghasilkan label awal.

## Dokumentasi

- [Arsitektur dan flow lengkap](docs/architecture.md)
- [Panduan tuning skor deduplikasi](docs/tuning-guide.md)

## Alur Kerja

```
Muat Folder
  ↓
Konfigurasi Project (tanggal, varietas, folder output)
  ↓
Tab 1: Koreksi Anotasi    → edit bbox per sisi (draw / move / resize / delete / change class)
  ↓
Tab 2: Deduplikasi        → tautkan bbox lintas sisi bersebelahan (manual + saran otomatis)
  ↓
Tab 3: Hasil              → hitung tandan unik + simpan JSON output
  ↓
Auto-save saat pindah pohon atau tekan "Hitung"
```

## Format Dataset

```
{root}/images/{split}/{STEM}_{N}.jpg
{root}/labels/{split}/{STEM}_{N}.txt
```

- `STEM` = nama pohon (mis. `DAMIMAS_A21B_0003`).
- `_{N}` = nomor sisi (1-based). Dataset umumnya 4 atau 8 sisi; penamaan di UI selalu "Sisi 1 … Sisi N" tanpa arah mata angin (sesuai masukan dosen — pohon tidak punya depan/belakang dan protokol capture tidak selalu align ke arah real).
- Format label = YOLO (`class cx cy w h` ternormalisasi).

Class map (`js/yolo-io.js`): `0=B1, 1=B2, 2=B3, 3=B4` (skema internal app menggunakan 1-indexed `B1..B4`).

## Output JSON

Per-pohon, disimpan ke folder output sebagai `{tree_id}__{tree_name}.json`. Tree ID di-generate otomatis: `YYYYMMDD-VARIETAS-NNN` (mis. `20260416-DAMIMAS-001`).

Isi (lihat `js/output-schema.js`):

- `tree_id`, `tree_name`, `split`, `metadata`
- `images` — per sisi: filename, ukuran, dan anotasi dengan koordinat YOLO **dan** pixel
- `bunches` — tandan unik hasil clustering, dengan referensi balik ke `side + box_index`
- `summary` — total unik, total mentah, dedup count, breakdown per kelas dan per sisi

Penyimpanan via **File System Access API** (Chrome / Edge). Browser lain otomatis fallback ke download manual.

## Resume Sesi

- Tombol **Muat Sesi**: pilih file output JSON yang sudah disimpan untuk melanjutkan kerja pada satu pohon.
- Atau pilih ulang folder output saat memuat dataset → app mendeteksi pohon mana yang sudah disimpan dan menandainya.

## Deduplikasi Lintas-Sisi

Hanya **sisi bersebelahan** yang dibandingkan (Sisi 1↔Sisi 2, Sisi 2↔Sisi 3, …, Sisi N↔Sisi 1). Sisi berlawanan tidak dibandingkan karena perspektifnya terlalu berbeda — tandan yang terlihat di Sisi 1 tidak mungkin juga muncul di Sisi 3 dengan rotasi 90° antar sisi.

User dapat:
- **Jalankan Saran** (`R`) → algoritma mengusulkan pasangan lintas sisi.
- Klik bbox kiri → klik bbox kanan → **tautkan manual**.
- Toggle **Saran** (`S`) untuk menyembunyikan overlay saran di kanvas & panel.

Panel saran menampilkan skor total (0–100%) **dan** breakdown per sinyal (seam / vert / size / cls) sebagai badge kecil — warna hijau ≥ 0.75, kuning 0.50–0.75, merah < 0.50. Ini memudahkan user memahami alasan skor dan memutuskan Terima/Tolak.

### Algoritma Saran (Tahap 1 + 2 aktif)

Implementasi di `js/dedup-utils.js::suggestPairs()`:

**1. Hard gate berdasarkan "seam band".** Hanya separuh gambar yang dekat ke garis bagi antara dua sisi yang ikut dipertimbangkan. Untuk pasangan Sisi A–Sisi B (A kiri, B kanan dari perspektif pohon):

- Sisi A hanya bbox dengan pusat `cx_A ≤ seamBandFraction` (dekat tepi kiri gambar A).
- Sisi B hanya bbox dengan pusat `cx_B ≥ 1 − seamBandFraction` (dekat tepi kanan gambar B).

Default `seamBandFraction = 0.50`. Bbox yang berada di separuh jauh gambar secara fisik tidak mungkin juga tertangkap di gambar sebelahnya → langsung di-discard tanpa scoring. Ini menghilangkan sumber utama false positive di versi sebelumnya.

**2. Hard gate berdasarkan rasio ukuran.** Pair dibuang jika `min(areaA, areaB) / max(areaA, areaB) < sizeRatioMin` (default 0.30). Tandan yang sama antar dua foto boleh beda ukuran, tapi tidak beda 3× lipat.

**3. Skoring.**

```
score = (0.45·seam + 0.35·vert + 0.20·size) · classMult
```

| Sinyal | Bobot | Keterangan |
|---|---|---|
| `seam` | 45% | Rata-rata dari dua seam-proximity kontinu (tiap sisi: 1 di tepi, 0 di batas band). |
| `vert` | 35% | Kecocokan centroid Y; 1 kalau sama, 0 kalau beda > `vertTol` (default 0.20 × tinggi). |
| `size` | 20% | Kombinasi kemiripan luas (0.6) + aspect ratio (0.4). |
| `classMult` | pengali | 1.0 jika class sama, 0.85 jika ±1 grade, 0.5 jika jauh. |

Kelas dipindah dari sinyal aditif menjadi **pengali penalti**: label noise (mis. sisi A diberi B3, sisi B diberi B2 oleh model awal) tidak menonaktifkan match, tapi degrades kepercayaan cukup untuk menjatuhkannya di bawah ambang bila sinyal geometri juga lemah.

**4. Mutual best pair.** Setelah scoring, pair `(A, B)` hanya dipertahankan jika `A` paling cocok dengan `B` **dan** `B` paling cocok dengan `A`. Versi sebelumnya memakai greedy assignment berdasar skor tertinggi — itu memungkinkan satu bbox memonopoli banyak kandidat. Mutual best mengenforce symmetry.

**5. Kategorisasi.** `score ≥ autoMin (0.75)` → `auto`; `candidateMin (0.50) ≤ score < autoMin` → `candidate`; sisanya discard.

Lihat [docs/tuning-guide.md](docs/tuning-guide.md) untuk panduan menyesuaikan parameter ini ke kondisi capture.

### Roadmap Perbaikan Algoritma Dedup

Algoritma dibangun bertahap supaya tiap perubahan bisa diukur terpisah. Status saat ini: **Tahap 1–3 selesai, Tahap 4 belum**.

| Tahap | Fokus | Status |
|---|---|---|
| 1 | Hard gate `seamBandFraction` + mutual best assignment | ✅ implemented |
| 2 | Re-balance skoring: `seam` kontinu, class sebagai pengali, hard size-ratio gate | ✅ implemented |
| 3 | QoL UI: toggle sembunyikan saran (`S`) + breakdown signal per saran | ✅ implemented |
| 4 | Advanced (opsional) | ⏳ pending |

**Tahap 4 (advanced, belum dikerjakan)** — hanya jika Tahap 1–3 masih kurang akurat setelah diuji lapangan:

- **Normalisasi vertikal berbasis trunk axis.** Estimasi garis batang dari distribusi vertikal bbox di masing-masing sisi, lalu normalisasi `cy` relatif ke garis tersebut. Menangani kasus foto miring atau pohon yang tidak tegak sempurna.
- **Threshold dinamis berbasis density.** Ambang `autoMin`/`candidateMin` disesuaikan otomatis per pohon berdasar jumlah kandidat; pohon dengan banyak tandan butuh ambang lebih ketat supaya tidak over-link.
- **Validation harness.** Script evaluasi precision/recall vs ground truth (dataset kecil ber-anotasi confirmed link) untuk mengukur kualitas objektif sebelum menaikkan ke default.
- **Pembobotan adaptif.** Bobot `seam/vert/size` di-tune otomatis berdasarkan variansi per dataset (mis. dataset dengan capture inkonsisten butuh `seam` lebih tinggi).

Masing-masing item di Tahap 4 bisa diimplementasikan independen tanpa merombak Tahap 1–3.

### Parameter Default (`suggestPairs` opts)

| Parameter | Default | Keterangan |
|---|---|---|
| `autoMin` | `0.75` | Batas bawah kategori `auto` |
| `candidateMin` | `0.50` | Batas bawah kategori `candidate` |
| `seamBandFraction` | `0.50` | Fraksi lebar gambar (dari seam) yang memenuhi hard gate |
| `vertTol` | `0.20` | Fraksi tinggi gambar yang ditoleransi untuk perbedaan centroid Y |
| `sizeRatioMin` | `0.30` | Hard gate rasio luas minimum |
| `mutualBest` | `true` | Jika `false`, fallback ke greedy sort-by-score |

## Menjalankan Lokal

```bash
python -m http.server 5500
# buka http://localhost:5500
```

Static file server apa pun bisa dipakai. Tidak perlu install dependency.

## Kompatibilitas Browser

- **Chrome / Edge** (rekomendasi): full support, output langsung tertulis ke folder pilihan.
- **Firefox / Safari**: editor dan dedup berjalan normal, tetapi penyimpanan output jatuh ke download manual (File System Access API tidak tersedia).
- Pemilihan folder dataset memerlukan dukungan `webkitdirectory`.

