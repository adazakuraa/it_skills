#!/usr/bin/env python3
"""data/story/<回>.json の「問題の中身」を data/q/*.json の summary に取り込む。

  python3 -I apb/tools/story.py
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
n = 0
for f in sorted((DATA / "story").glob("*.json")):
    for qid, v in json.loads(f.read_text()).items():
        p = DATA / "q" / f"{qid}.json"
        d = json.loads(p.read_text())
        if v.get("scene"):
            d["summary"]["scene"] = v["scene"]
        d["summary"]["story"] = v["story"]
        p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
        n += 1
print(n, "stories merged")
