# SawitAI

Frontend app untuk inferensi deteksi tandan sawit + counting unik lintas 4 foto (1 pohon, 4 sisi).

## Dokumentasi

- Arsitektur dan flow lengkap: `docs/architecture.md`
- Panduan tuning akurasi counting: `docs/tuning-guide.md`

## Ringkasan Alur

```mermaid
flowchart LR
  A[Upload 4 Sisi] --> B[Predict Sequential ke Backend YOLO]
  B --> C[Deteksi per Sisi]
  C --> D[Dedup Adjacent Side Only]
  D --> E{Score}
  E -->|>= autoMergeMin| F[Auto Merge]
  E -->|antara threshold| G[Review Ambigu User]
  E -->|< ambiguousMin| H[Separate]
  F --> I[Union-Find Clustering]
  G --> I
  H --> I
  I --> J[Final Unique Count + Summary]
```

## Menjalankan Lokal

```powershell
cd C:\Users\Zainal\Desktop\App-Sawit
C:\Python314\python.exe -m http.server 5500
```

Buka `http://localhost:5500`.
