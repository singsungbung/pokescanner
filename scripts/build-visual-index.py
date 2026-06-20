from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


EXPECTED_COUNT = 92
CARD_ID_PREFIX = "JP-M1S"


def projection_runs(projection: np.ndarray, threshold: float, min_len: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, value in enumerate(projection):
        if value > threshold:
            if start is None:
                start = i
        elif start is not None:
            if i - start >= min_len:
                runs.append((start, i))
            start = None
    if start is not None and len(projection) - start >= min_len:
        runs.append((start, len(projection)))
    return runs


def card_cells(image: Image.Image) -> list[tuple[int, int, int, int]]:
    rgb = image.convert("RGB")
    arr = np.asarray(rgb)
    mask = np.any(arr < 235, axis=2)
    h, w = mask.shape
    cols = projection_runs(mask.sum(axis=0), h * 0.02, 70)
    rows = projection_runs(mask.sum(axis=1), w * 0.02, 70)

    cells: list[tuple[int, int, int, int]] = []
    for y1, y2 in rows:
        for x1, x2 in cols:
            cell = mask[y1:y2, x1:x2]
            if cell.size == 0 or float(cell.mean()) < 0.18:
                continue
            cells.append((x1, y1, x2, y2))
    return cells


def crop_card(image: Image.Image, cell: tuple[int, int, int, int]) -> Image.Image:
    x1, y1, x2, y2 = cell
    crop = image.crop((x1, y1, x2, y2)).convert("RGB")
    arr = np.asarray(crop)
    mask = np.any(arr < 235, axis=2)
    ys, xs = np.where(mask)
    if len(xs) and len(ys):
        pad = 3
        left = max(0, int(xs.min()) - pad)
        top = max(0, int(ys.min()) - pad)
        right = min(crop.width, int(xs.max()) + 1 + pad)
        bottom = min(crop.height, int(ys.max()) + 1 + pad)
        crop = crop.crop((left, top, right, bottom))
    return crop


def average_hash(image: Image.Image, size: int = 8) -> str:
    sample = image.resize((size, size), Image.Resampling.BILINEAR).convert("RGB")
    arr = np.asarray(sample, dtype=np.float32)
    gray = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
    avg = float(gray.mean())
    return "".join("1" if value >= avg else "0" for value in gray.flatten())


def art_crop(card: Image.Image) -> Image.Image:
    w, h = card.size
    x = round(w * 0.09)
    y = round(h * 0.13)
    width = round(w * 0.82)
    height = round(h * 0.38)
    return card.crop((x, y, min(w, x + width), min(h, y + height)))


def color_grid(image: Image.Image, grid: int = 4) -> list[int]:
    sample = image.resize((grid, grid), Image.Resampling.BILINEAR).convert("RGB")
    return np.asarray(sample, dtype=np.uint8).reshape(-1, 3).flatten().astype(int).tolist()


def features_for_card(card: Image.Image) -> dict[str, object]:
    return {
        "hash": average_hash(card, 8),
        "art_hash": average_hash(art_crop(card), 8),
        "color": color_grid(card, 4),
    }


def default_sheet_paths() -> list[Path]:
    temp = Path(tempfile.gettempdir())
    files = sorted(
        temp.glob("codex-clipboard-*.png"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    # The six attached M1S sheets are the most recent large clipboard images.
    sheets = []
    for path in files:
        try:
            with Image.open(path) as image:
                w, h = image.size
            if w >= 1200 and h >= 1200:
                sheets.append(path)
        except Exception:
            continue
        if len(sheets) == 6:
            break
    return list(reversed(sheets))


def build_index(sheet_paths: list[Path]) -> list[dict[str, object]]:
    cards: list[Image.Image] = []
    for sheet_path in sheet_paths:
        with Image.open(sheet_path).convert("RGB") as sheet:
            cells = card_cells(sheet)
            for cell in cells:
                cards.append(crop_card(sheet, cell))

    if len(cards) != EXPECTED_COUNT:
        raise RuntimeError(f"Expected {EXPECTED_COUNT} cards, detected {len(cards)}")

    index = []
    for i, card in enumerate(cards, start=1):
        item = {
            "card_id": f"{CARD_ID_PREFIX}-{i:03d}",
            **features_for_card(card),
        }
        index.append(item)
    return index


def write_visual_index(index: list[dict[str, object]], output: Path) -> None:
    body = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    text = (
        "// Generated visual feature index for JP / M1S.\n"
        "// Source card sheet images are local-only and are not stored in this repository.\n"
        "(function () {\n"
        f"  window.MONPRICE_VISUAL_INDEX = {body};\n"
        "})();\n"
    )
    output.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build M1S visual-index.js from local card sheet images.")
    parser.add_argument("sheets", nargs="*", type=Path, help="Sheet PNG files in card order.")
    parser.add_argument("--out", type=Path, default=Path("data/visual-index.js"))
    args = parser.parse_args()

    sheet_paths = args.sheets or default_sheet_paths()
    if len(sheet_paths) != 6:
        raise RuntimeError(f"Expected 6 sheet images, got {len(sheet_paths)}")
    index = build_index(sheet_paths)
    write_visual_index(index, args.out)
    print(f"Wrote {len(index)} visual entries to {args.out}")


if __name__ == "__main__":
    main()
