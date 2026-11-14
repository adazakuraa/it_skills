#!/usr/bin/env python3
"""配信用にまとめる。
- 問ごとのページ画像を縦に連結して img/stack/<問ID>.webp にする（ページ境界は data/stacks.json）
- 解説(data/q/*.json)とテキスト版問題文(data/text/*.txt)を data/bundle.json にまとめる

  python3 -I apb/tools/pack.py && python3 -I apb/tools/catalog.py
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
W, GAP, MAXH = 1400, 24, 16000


def main():
    pages = json.loads((DATA / "pages.json").read_text())
    stacks = {}
    out = ROOT / "img" / "stack"
    out.mkdir(parents=True, exist_ok=True)
    for qid, ps in sorted(pages.items()):
        ims = [Image.open(ROOT / p["src"]).convert("L") for p in ps]
        ims = [im.resize((W, round(im.height * W / im.width))) if im.width > W else im for im in ims]
        h = sum(im.height for im in ims) + GAP * (len(ims) - 1)
        canvas = Image.new("L", (W, h), 255)
        y, cuts = 0, []
        for im in ims:
            cuts.append(y)
            canvas.paste(im, ((W - im.width) // 2, y))
            y += im.height + GAP
        if h > MAXH:
            r = MAXH / h
            canvas = canvas.resize((round(W * r), MAXH))
            cuts = [round(c * r) for c in cuts]
        canvas.save(out / f"{qid}.webp", "WEBP", quality=70, method=6)
        stacks[qid] = {"src": f"img/stack/{qid}.webp", "w": canvas.width, "h": canvas.height, "cuts": cuts}
    (DATA / "stacks.json").write_text(json.dumps(stacks, ensure_ascii=False, separators=(",", ":")))
    bundle = {"content": {}, "text": {}}
    for f in sorted((DATA / "q").glob("*.json")):
        bundle["content"][f.stem] = json.loads(f.read_text())
    for f in sorted((DATA / "text").glob("*.txt")):
        bundle["text"][f.stem] = f.read_text()
    (DATA / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")))
    print(len(stacks), "stacks;", len(bundle["content"]), "contents")


if __name__ == "__main__":
    main()
