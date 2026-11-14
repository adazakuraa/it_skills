#!/usr/bin/env python3
"""data/pages.json と data/q/*.json から一覧用の data/catalog.json を作る。

  python3 -I apb/tools/catalog.py
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def main():
    pages = json.loads((DATA / "pages.json").read_text()) if (DATA / "pages.json").exists() else {}
    aims = json.loads((DATA / "aims.json").read_text()) if (DATA / "aims.json").exists() else {}
    ids = set(pages) | set(aims) | {p.stem for p in (DATA / "q").glob("*.json")}
    cat = []
    for qid in sorted(ids):
        exam, no = qid.split("-q")
        item = {"id": qid, "exam": exam, "no": int(no), "title": "", "tags": [], "pages": pages.get(qid, []),
                "aim": aims.get(qid, "")}
        f = DATA / "q" / f"{qid}.json"
        if f.exists():
            c = json.loads(f.read_text())
            item["title"] = c.get("title", "")
            item["tags"] = c.get("tags", [])
            if c.get("answers"):
                item["ready"] = True
        cat.append(item)
    (DATA / "catalog.json").write_text(json.dumps(cat, ensure_ascii=False, separators=(",", ":")))
    print(len(cat), "questions;", sum(1 for c in cat if c.get("ready")), "with answers")


if __name__ == "__main__":
    main()
