import re
import sys
from pathlib import Path

SPEC = {
    "common": {2: [2, 1, 1], 4: [1, 1, 1, 3, 2], 6: [3], 11: [3], 12: [2, 2]},
    "w01": {2: [1, 1, 1], 3: [1, 3, 3]},
    "w02": {2: [3], 3: [1, 3], 4: [2, 3, 1], 5: [3, 1], 6: [3, 1], 7: [3, 1]},
    "w03": {3: [2, 1, 1], 4: [2, 1, 4, 1], 5: [2, 3]},
    "w04": {3: [1, 2, 2]},
    "w05": {1: [3], 2: [1, 1, 1, 2], 4: [2, 1, 3], 5: [1, 3], 7: [1, 3, 3], 8: [2, 2]},
    "w06": {1: [2, 1, 1], 2: [2, 1, 1, 1, 2, 3], 3: [2, 2], 4: [2, 2], 5: [2, 2], 7: [2, 1], 10: [3, 2]},
    "w07": {1: [2, 1, 1], 3: [2, 1, 1, 2, 3], 4: [2, 2], 5: [3, 1], 6: [4], 7: [3], 8: [2, 1], 11: [3, 2, 2], 12: [4, 1]},
    "w08": {1: [2, 1, 1], 3: [1, 1, 2, 2, 2], 4: [1, 1, 2, 1, 3, 1], 5: [1, 3, 2, 3, 2], 6: [1, 2], 7: [4, 2], 8: [3],
            10: [1, 1, 1], 11: [1, 1, 1], 13: [4, 1], 14: [3, 1]},
    "w09": {1: [2, 1, 1], 2: [3, 1], 4: [2, 1, 2, 1, 1, 3, 1, 3], 5: [2, 2], 6: [4], 7: [3], 8: [2, 1], 11: [5, 3]},
    "w10": {1: [2, 1, 1], 3: [1, 1, 1, 2, 2], 4: [1, 2, 1, 1, 3, 1, 3], 5: [1, 2], 6: [2, 1], 7: [3], 11: [1, 1, 1, 2],
            12: [1, 2, 1], 14: [1, 2, 1, 3], 16: [1, 1, 1, 1, 1, 2], 17: [1, 2, 3], 18: [3, 3, 1]},
    "w11": {1: [2, 1, 1], 3: [2, 1], 4: [2, 1, 1, 2, 3], 5: [2, 2], 6: [3], 7: [3], 8: [2, 1], 12: [3, 1]},
    "w12": {2: [2, 1, 2, 1, 1, 3, 1, 3], 3: [4], 4: [3], 6: [3, 2], 8: [3, 1], 11: [5, 2]},
    "w13": {3: [1, 1, 2, 2, 2], 4: [2, 1, 3, 2], 5: [2, 2], 7: [4, 2], 8: [1, 1, 1, 1], 11: [4, 1, 1]},
    "w14": {1: [2, 2], 3: [3, 2], 4: [2, 2, 1], 5: [2, 1], 8: [2, 1]},
}

root = Path(__file__).resolve().parent.parent / "content" / "modules"
for name, cells in SPEC.items():
    path = root / f"{name}.txt"
    parts = re.split(r"(?m)^(?=@@cell |@@output)", path.read_text())
    idx = 0
    for k, part in enumerate(parts):
        if not part.startswith("@@cell "):
            continue
        idx += 1
        if idx not in cells:
            continue
        head, _, body = part.partition("\n")
        lines = [l for l in body.split("\n") if l.strip()]
        sizes = cells[idx]
        if sum(sizes) != len(lines):
            sys.exit(f"{name} cell {idx}: spec {sum(sizes)} lines, file has {len(lines)}")
        out, pos = [], 0
        for g, n in enumerate(sizes):
            if g:
                out.append("")
            out.extend(lines[pos:pos + n])
            pos += n
        parts[k] = head + "\n" + "\n".join(out) + "\n"
    path.write_text("".join(parts))
print("regrouped", sum(len(v) for v in SPEC.values()), "cells")
