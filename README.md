# PalmAnnotate

PalmAnnotate is an offline browser app for correcting YOLO oil-palm bunch annotations, linking duplicate detections across adjacent tree views, and exporting one canonical JSON file per tree.

The app is designed for the SawitMVC dataset and writes schema `version: 4` output only.

## Features

- Load a local dataset folder containing `images/` and `labels/`.
- Correct bounding boxes per side: draw, move, resize, delete, and change class.
- Link duplicate bunch detections across adjacent sides.
- Resolve class mismatches before saving confirmed output.
- Export corrected YOLO labels, session backup JSON, CSV summaries, identity JSON, and SawitMVC output JSON.
- Resume from previously saved output JSON files.

## Output Schema

New exports use the English SawitMVC schema:

```json
{
  "version": 4,
  "tree_id": "DAMIMAS_A21B_0001",
  "tree_name": "DAMIMAS_A21B_0001",
  "split": "train",
  "metadata": {
    "variety": "DAMIMAS",
    "generated_at": "2026-05-16T00:00:00.000Z"
  },
  "images": {
    "side_1": {
      "filename": "DAMIMAS_A21B_0001_1.jpg",
      "label_file": "DAMIMAS_A21B_0001_1.txt",
      "side_index": 0,
      "side_label": "Side 1",
      "width": 1280,
      "height": 720,
      "bbox_count": 3,
      "annotations": []
    }
  },
  "bunches": [],
  "_confirmedLinks": [],
  "summary": {
    "total_unique_bunches": 0,
    "total_detections": 0,
    "duplicates_linked": 0,
    "by_class": {"B1": 0, "B2": 0, "B3": 0, "B4": 0, "other": 0},
    "by_side": {"side_1": 0}
  }
}
```

Legacy output files can be loaded for convenience, but PalmAnnotate never writes Indonesian keys in new exports.

## Dataset Layout

Expected input:

```text
dataset-root/
  images/{split}/{TREE_NAME}_{N}.jpg
  labels/{split}/{TREE_NAME}_{N}.txt
```

Optional resume/output folders:

```text
dataset-root/Output JSON/{TREE_NAME}.json
dataset-root/Output TXT/{split}/{ORIGINAL_LABEL_FILENAME}.txt
```

`N` is the 1-based side number used by the original dataset filenames. PalmAnnotate preserves original JSON and label filenames when saving corrected output.

## Run Locally

Any static file server works:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

Chrome or Edge is recommended because the File System Access API can write JSON and corrected labels directly to selected folders. Other browsers fall back to downloads.

Auto-save on tree navigation only runs for changed trees and requires a writable output JSON folder. It never silently downloads files.

## Documentation

- [User Manual](docs/manual.md)
- [Architecture](docs/architecture.md)
- [Deduplication Tuning Guide](docs/tuning-guide.md)

## License

MIT. See [LICENSE.txt](LICENSE.txt).
