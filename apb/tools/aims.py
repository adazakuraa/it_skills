#!/usr/bin/env python3
"""解答例PDFのテキスト(<txt>/<examId>_ans.txt)から各問の「出題趣旨」を抜き出し data/aims.json に保存する。

  python3 -I apb/tools/aims.py <build.py のテキスト出力先>
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def main():
    src = Path(sys.argv[1])
    out = json.loads((DATA / "aims.json").read_text()) if (DATA / "aims.json").exists() else {}
    for f in sorted(src.glob("*_ans.txt")):
        eid = f.name.split("_")[0]
        t = unicodedata.normalize("NFKC", f.read_text())
        t = re.sub(r"=+ PAGE \d+ =+|\d+/\d+|©\d+ 独立行政法人情報処理推進機構", "", t)
        parts = re.split(r"\n\s*問\s*(\d+)\s*\n\s*出題趣旨\s*\n", t)
        for i in range(1, len(parts) - 1, 2):
            n = int(parts[i])
            body = parts[i + 1].split("設問")[0]
            body = re.sub(r"\s*\n\s*", "", body).strip()
            out[f"{eid}-q{n:02d}"] = body
    (DATA / "aims.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
    print(len(out), "aims")


if __name__ == "__main__":
    main()
