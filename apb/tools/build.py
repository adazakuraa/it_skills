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
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]  # apb/
IMG = ROOT / "img"
DATA = ROOT / "data"

NAME_RE = re.compile(r"(\d{4})([hr]\d{2})([hao])_ap_pm_(qs|ans|cmnt)\.pdf$", re.I)
SEASON = {"h": "春期", "a": "秋期", "o": "10月"}
START_RE = re.compile(r"^\s*[問間門閑]\s*([1-9]|1[01])\s+\S.{0,80}?(次の記述|設問に答え|読んで)")
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


def ocr_page(pdf_path, i):
    """テキストを持たないページ(IPAの問題冊子は画像のみ)をtesseractで読み取る。"""
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["pdftoppm", "-f", str(i + 1), "-l", str(i + 1), "-r", "300", "-gray",
                        "-png", "-singlefile", str(pdf_path), f"{d}/p"], check=True)
        try:
            r = subprocess.run(["tesseract", f"{d}/p.png", "-", "-l", "jpn", "--psm", "6"],
                               capture_output=True, text=True, timeout=45,
                               env={**os.environ, "OMP_THREAD_LIMIT": "1"})
            return r.stdout
        except subprocess.TimeoutExpired:
            return ""


def page_texts(pdf, pdf_path, cache):
    out = [pdf[i].get_textpage().get_text_range() for i in range(len(pdf))]
    if sum(len(t.strip()) for t in out) > 200 * len(out) / 10:
        return out
    if cache.exists():
        return json.loads(cache.read_text())
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
        out = list(ex.map(lambda i: ocr_page(pdf_path, i), range(len(pdf))))
    cache.write_text(json.dumps(out, ensure_ascii=False))
    return out


HEAD_RE = re.compile(r"^\s*[問間門閑]\s*[0-9Il|]{1,2}\s*\S.{0,60}?(に関する|次の記述|読んで)")
SELECT_RE = re.compile(r"囲んで解答して|4\s*問を選択|問\s*2\s*[~〜ー-]")


def split_questions(texts):
    """各ページの先頭数行から「問N …に関する次の記述を読んで」を探して問ごとのページ範囲を返す。
    OCRで番号が化けることがあるので、見つかった開始ページを順番に問1〜問11へ割り当てる。"""
    cands = []
    for i, t in enumerate(texts):
        lines = [l for l in t.splitlines() if l.strip()][:3]
        joined = [lines[j] + "".join(lines[j + 1:j + 2]) for j in range(len(lines))]
        if any(HEAD_RE.match(l) for l in joined):
            cands.append(i)
        elif i > 3 and any(SELECT_RE.search(l) for l in lines[:2]) and not any("[問題一" in l for l in lines):
            cands.append(i)  # 「次の問2〜問11については4問を選択し…」で始まる問2のページ
    cands = sorted(set(cands))
    if len(cands) != 11:
        print("  !! 開始ページ候補が11個ではありません:", [c + 1 for c in cands])
    ranges = {}
    for k, a in enumerate(cands[:11]):
        b = cands[k + 1] if k + 1 < len(cands) else len(texts)
        ranges[k + 1] = [p for p in range(a, b) if is_content(texts[p])]
    return ranges


def is_content(t):
    s = re.sub(r"\s+", "", t)
    if len(s) < 40:
        return False
    for ng in ("メモ用紙", "メモ用", "モ用紙", "このページは白紙", "問題一覧", "試験時間", "注意事項", "退室可能時間"):
        if ng in s[:40] or (ng in s and len(s) < 300):
            return False
    return True


def render(pdf, idx, dest):
    page = pdf[idx]
    scale = TARGET_W / page.get_width() * 1.15
    img = page.render(scale=scale).to_pil().convert("L")
    # スキャン時に端にできる黒い帯を白で塗りつぶしてから、余白をトリミングする
    inv = ImageOps.invert(img).point(lambda v: 255 if v > 30 else 0)
    w, h = inv.size
    cols = inv.resize((w, 1), Image.BOX).load()
    rows = inv.resize((1, h), Image.BOX).load()
    l = 0
    while l < w // 10 and cols[l, 0] > 100:
        l += 1
    r = w
    while r > w - w // 10 and cols[r - 1, 0] > 100:
        r -= 1
    t = 0
    while t < h // 10 and rows[0, t] > 100:
        t += 1
    b = h
    while b > h - h // 10 and rows[0, b - 1] > 100:
        b -= 1
    # 帯の内側に残る薄い縁も避けるため数px余分に削る
    m = 6
    inv = inv.crop((l + (m if l else 0), t + (m if t else 0), r - (m if r < w else 0), b - (m if b < h else 0)))
    img = img.crop((l + (m if l else 0), t + (m if t else 0), r - (m if r < w else 0), b - (m if b < h else 0)))
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
        texts = page_texts(pdf, pdf_path, txt_out / f"{eid}_{kind}.ocr.json")
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
