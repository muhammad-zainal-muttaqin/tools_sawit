# SawitAI - Accurate Counting (4-Side Multi-Photo)

Dokumen ini merangkum stack, fitur, dan cara kerja sistem counting akurat pada app frontend SawitAI.

## 1) Tujuan Sistem

Model backend (Ultralytics endpoint) pada dasarnya melakukan:
- deteksi objek (bounding box),
- klasifikasi objek,
- confidence per deteksi.

Kebutuhan bisnis di app ini lebih tinggi: hitung **jumlah tandan unik** dari 4 foto satu pohon tanpa overcount/duplicate.

Karena itu, logika counting unik ada di **frontend layer** (session + dedup + review ambigu).

## 2) Arsitektur Ringkas

### Backend
- Endpoint inferensi model YOLO (predict per gambar).
- Output: deteksi per gambar (class/name, confidence, bbox).

### Frontend
- UI upload + wizard 4 sisi.
- Batch inferensi berurutan ke backend.
- Deduplikasi lintas sisi (adjacent-only).
- Review ambigu oleh user.
- Agregasi cluster unik + summary hasil.

## 3) Stack & File Utama

- `index.html`
  - struktur UI mode single + mode 4 sisi,
  - panel review ambigu,
  - panel hasil counting.
- `css/style.css`
  - layout responsive, styling mode switch, wizard 4 sisi, review panel.
- `js/api.js`
  - komunikasi ke endpoint inferensi,
  - helper `predictBatchSequential(...)`.
- `js/session.js`
  - state session counting 1 pohon (4 sisi).
- `js/deduper.js`
  - algoritma dedup lintas foto.
- `js/tree-mode.js`
  - orkestrasi flow mode 4 sisi dari upload sampai final result.
- `js/app.js`
  - pengaturan global + persistence konfigurasi (termasuk threshold dedup 4 sisi).

## 4) Flow End-to-End (User -> Hasil)

1. User pilih mode `Hitung 1 Pohon (4 Foto)`.
2. User upload 4 sisi (Depan, Kanan, Belakang, Kiri).
3. Frontend kirim file secara sequential ke backend inferensi.
4. Backend balikan deteksi per sisi.
5. Frontend normalisasi deteksi + hitung fitur kemiripan.
6. Frontend buat kandidat pasangan antar sisi bersebelahan saja.
7. Frontend scoring tiap kandidat -> auto merge / ambiguous / separate.
8. Kandidat ambiguous ditampilkan di panel review untuk keputusan user.
9. Keputusan merge digabung via union-find jadi cluster tandan unik.
10. UI tampilkan:
   - total tandan unik,
   - total deteksi mentah,
   - jumlah merge,
   - ringkasan per sisi,
   - daftar cluster.

## 5) Aturan Deduplikasi (Akurat & Konservatif)

### Pairing hanya sisi bersebelahan

Sistem **hanya** membandingkan:
- Depan <-> Kanan
- Kanan <-> Belakang
- Belakang <-> Kiri
- Kiri <-> Depan

Tidak membandingkan langsung sisi berlawanan:
- Depan <-> Belakang
- Kanan <-> Kiri

Ini mengurangi false match dari perspektif yang terlalu jauh berbeda.

### Skor kemiripan kandidat

Skor gabungan dari:
- `dHash` visual similarity,
- `HSV histogram` similarity,
- `geometry similarity` (area/aspect),
- `edge prior` (posisi relatif terhadap tepi frame).

### Keputusan threshold

- `score >= autoMergeMin`: auto merge
- `ambiguousMin <= score < autoMergeMin`: masuk review user
- `score < ambiguousMin`: dianggap objek berbeda

Default (bisa diubah di menu konfigurasi):
- `autoMergeMin = 0.82`
- `ambiguousMin = 0.68`

## 6) Review Ambigu (Human-in-the-loop)

Review ambigu sekarang memakai:
- **full-frame image** per sisi,
- highlight bounding box kandidat,
- box lain tetap ditampilkan lebih redup untuk konteks.

Alasan: manusia lebih akurat menilai objek sama/beda jika melihat konteks luas, bukan crop sangat dekat.

## 7) Konfigurasi yang Tersimpan

Disimpan di `localStorage`:
- inferensi model: `conf`, `iou`, `imgsz`
- tracker video (mode video)
- dedup 4 sisi:
  - `autoMergeMin`
  - `ambiguousMin`

Key dedup 4 sisi: `sawitai_tree_count`

## 8) Kenapa Pendekatan Ini Meningkatkan Akurasi

- Backend fokus pada deteksi/classification per frame (stabil).
- Frontend menambah layer identitas lintas foto (dedup).
- Adjacent-side policy menekan false pair.
- Threshold konservatif menekan overcount.
- Review ambigu memberi kontrol akhir untuk kasus yang model belum pasti.

## 9) Batasan Saat Ini

- Identitas objek masih berbasis heuristik visual/geometri (bukan ReID model khusus).
- Akurasi sangat dipengaruhi kualitas pengambilan foto (sudut, jarak, blur, pencahayaan).
- Tidak ada global optimization lintas semua sisi sekaligus (masih pairwise + union).

## 10) Tuning Praktis

Jika hasil sering overcount:
- naikkan `autoMergeMin` sedikit (mis. +0.02),
- naikkan `ambiguousMin` sedikit agar lebih banyak masuk review.

Jika hasil sering undercount:
- turunkan `autoMergeMin` sedikit (mis. -0.02),
- turunkan `ambiguousMin` sedikit.

Jaga rule:
- `ambiguousMin` harus selalu < `autoMergeMin`.

## 11) Menjalankan Lokal

Contoh:

```powershell
cd C:\Users\User\Desktop\App-Sawit
C:\Python314\python.exe -m http.server 5500
```

Buka:
- `http://localhost:5500`

