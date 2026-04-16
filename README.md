# SawitAI — Tools Koreksi Dataset Sawit

Aplikasi web **offline** (vanilla JS, tanpa backend, tanpa build step) untuk:

1. **Koreksi anotasi** dataset YOLO tandan sawit (B1–B4) per gambar.
2. **Deduplikasi lintas-sisi** antar foto pohon yang sama (Depan / Kanan / Belakang / Kiri).
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
- `_{N}` = nomor sisi (1-based; 4 sisi standar = Depan/Kanan/Belakang/Kiri).
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

Hanya **sisi bersebelahan** yang dibandingkan (Depan↔Kanan, Kanan↔Belakang, Belakang↔Kiri, Kiri↔Depan). Sisi berlawanan (Depan↔Belakang, Kanan↔Kiri) tidak dibandingkan karena perspektifnya terlalu berbeda.

Skor pasangan (`js/dedup-utils.js`):

| Sinyal | Bobot |
|---|---|
| Edge proximity (kedekatan ke tepi gambar di sisi yang dibagi) | 40% |
| Vertical alignment (centroid Y mirip) | 35% |
| Class similarity | 15% |
| Size + aspect similarity | 10% |

Threshold default: `auto ≥ 0.75`, `candidate 0.50–0.75`, `discard < 0.50`.

User dapat menerima/tolak saran, atau menautkan bbox secara manual klik-kiri → klik-kanan → konfirmasi.

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
