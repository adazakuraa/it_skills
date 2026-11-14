#!/usr/bin/env python3
"""IPA 応用情報 午後(科目B) PDF → 問ごとのページ画像 + テキスト抽出。

使い方:
  python3 -I apb/tools/build.py <PDFを置いたディレクトリ> <テキスト出力先>

- 問題冊子 (*_ap_pm_qs.pdf) を問ごとに分割し、余白を詰めたページ画像を
  apb/img/<examId>/q<NN>-<p>.webp に保存する
- 問題冊子・解答例・採点講評のテキストを <テキスト出力先> に書き出す
  (要約・解説を書くための作業用。リポジトリには含めない)
- apb/data/pages.json に「問ID → 画像パス一覧」を書き出す
"""
import json
import re
import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]  # apb/
IMG = ROOT / "img"
DATA = ROOT / "data"

NAME_RE = re.compile(r"(\d{4})([hr]\d{2})([hao])_ap_pm_(qs|ans|cmnt)\.pdf$", re.I)
SEASON = {"h": "春期", "a": "秋期", "o": "10月"}
START_RE = re.compile(r"^\s*問\s*([1-9]|1[01])\s*[　 ]*(次の|[^\d\s])")
TARGET_W = 1400  # 画像の横幅(px)。拡大表示しても文字が潰れない程度


def exam_id(m):
    era = m.group(2).lower()
    return f"{era}{m.group(3).lower()}"  # 例: r05a, h30h, r02o


def exam_label(m):
    era = m.group(2).lower()
    num = int(era[1:])
    if era[0] == "h":
        name = f"平成{num}年度"
    else:
        name = "令和元年度" if num == 1 else f"令和{num}年度"
    return f"{name} {SEASON[m.group(3).lower()]}"


def page_texts(pdf):
    out = []
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        out.append(tp.get_text_range())
    return out


def split_questions(texts):
    """各ページの先頭付近にある「問N 次の…」を探して、問ごとのページ範囲を返す。"""
    starts = {}
    for i, t in enumerate(texts):
        head = "\n".join(t.splitlines()[:6])
        for line in head.splitlines():
            m = START_RE.match(line)
            if m:
                n = int(m.group(1))
                if n not in starts:
                    starts[n] = i
                break
    ranges = {}
    nums = sorted(starts)
    for k, n in enumerate(nums):
        a = starts[n]
        b = starts[nums[k + 1]] if k + 1 < len(nums) else len(texts)
        pages = [p for p in range(a, b) if is_content(texts[p])]
        ranges[n] = pages
    return ranges


def is_content(t):
    s = re.sub(r"\s+", "", t)
    if len(s) < 40:
        return False
    for ng in ("メモ用紙", "このページは白紙", "〔問題一覧〕", "試験時間", "注意事項"):
        if ng in s and len(s) < 1500:
            return False
    return True


def render(pdf, idx, dest):
    page = pdf[idx]
    scale = TARGET_W / page.get_width() * 1.15
    img = page.render(scale=scale).to_pil().convert("L")
    # 余白をトリミング(薄いグレーまで白とみなす)
    inv = ImageOps.invert(img).point(lambda v: 255 if v > 30 else 0)
    box = inv.getbbox()
    if box:
        pad = 24
        l, t, r, b = box
        img = img.crop((max(0, l - pad), max(0, t - pad),
                        min(img.width, r + pad), min(img.height, b + pad)))
    if img.width > TARGET_W:
        h = round(img.height * TARGET_W / img.width)
        img = img.resize((TARGET_W, h), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=70, method=6)
    return img.width, img.height


def main():
    src = Path(sys.argv[1])
    txt_out = Path(sys.argv[2])
    txt_out.mkdir(parents=True, exist_ok=True)
    pages_json = DATA / "pages.json"
    pages_map = json.loads(pages_json.read_text()) if pages_json.exists() else {}
    exams_json = DATA / "exams.json"
    exams = {e["id"]: e for e in json.loads(exams_json.read_text())} if exams_json.exists() else {}

    for pdf_path in sorted(src.rglob("*.pdf")):
        m = NAME_RE.search(pdf_path.name)
        if not m:
            print("skip (名前が規則外):", pdf_path.name)
            continue
        eid, kind = exam_id(m), m.group(4).lower()
        exams[eid] = {"id": eid, "label": exam_label(m), "year": int(m.group(1)),
                      "order": int(m.group(1)) * 10 + {"h": 1, "o": 2, "a": 3}[m.group(3).lower()]}
        pdf = pdfium.PdfDocument(str(pdf_path))
        texts = page_texts(pdf)
        (txt_out / f"{eid}_{kind}.txt").write_text(
            "".join(f"\n\n===== PAGE {i + 1} =====\n{t}" for i, t in enumerate(texts)))
        if kind != "qs":
            continue
        ranges = split_questions(texts)
        print(eid, {n: [p + 1 for p in ps] for n, ps in ranges.items()})
        for n, ps in ranges.items():
            qid = f"{eid}-q{n:02d}"
            files = []
            for k, p in enumerate(ps, 1):
                rel = f"img/{eid}/q{n:02d}-{k}.webp"
                w, h = render(pdf, p, ROOT / rel)
                files.append({"src": rel, "w": w, "h": h})
            pages_map[qid] = files
            (txt_out / f"{qid}.txt").write_text(
                "".join(f"\n\n----- p{k} -----\n{texts[p]}" for k, p in enumerate(ps, 1)))

    pages_json.write_text(json.dumps(pages_map, ensure_ascii=False, indent=1))
    exams_json.write_text(json.dumps(sorted(exams.values(), key=lambda e: -e["order"]),
                                     ensure_ascii=False, indent=1))
    print("done:", len(pages_map), "questions")


if __name__ == "__main__":
    main()
