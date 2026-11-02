#!/usr/bin/env python3
"""인스타 카드뉴스 → GOMS 심의용 Word (편마다 하나).

    python3 scripts/instagram/word-cards.py [content/instagram/sets/<날짜>.json] [--out <폴더>]

render-cards.mjs 로 만든 카드 7장을 차례로 넣고, 그 아래 인스타 본문 글(caption)과 해시태그를 넣는다.
파일 이름: 「인스타 카드뉴스 N편.docx」. Word 는 저장소에 커밋하지 않는다(.gitignore).
"""
import glob, json, os, sys
from docx import Document
from docx.shared import Cm, Pt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
args = sys.argv[1:]
out = args[args.index('--out') + 1] if '--out' in args else ''
sets = [a for a in args if a.endswith('.json')]
set_file = sets[0] if sets else sorted(glob.glob(os.path.join(ROOT, 'content/instagram/sets/*.json')))[-1]
day = os.path.splitext(os.path.basename(set_file))[0]
out = out or os.path.join(ROOT, 'content/instagram/word', day)
os.makedirs(out, exist_ok=True)
data = json.load(open(set_file, encoding='utf-8'))

for p in data['posts']:
    img_dir = os.path.join(ROOT, 'content/instagram/images', day, f"{p['no']}-{p['slug']}")
    imgs = sorted(glob.glob(os.path.join(img_dir, '*.png')))
    if len(imgs) < 7:
        sys.exit(f"{p['no']}편: 카드 그림이 7장이 아니에요 ({len(imgs)}장) — 먼저 render-cards.mjs 를 돌려 주세요")
    doc = Document()
    st = doc.styles['Normal']; st.font.size = Pt(11)
    doc.add_paragraph(f"인스타그램 카드뉴스 {p['no']}편 (카드 {len(imgs)}장 + 본문)").runs[0].bold = True
    for i, f in enumerate(imgs, 1):
        doc.add_paragraph(f"[카드 {i}/{len(imgs)}]")
        doc.add_picture(f, width=Cm(13))
    doc.add_paragraph('')
    doc.add_paragraph('[게시물 본문]').runs[0].bold = True
    for line in p['caption']:
        doc.add_paragraph(line)
    doc.add_paragraph(' '.join('#' + t for t in p['tags']))
    path = os.path.join(out, f"인스타 카드뉴스 {p['no']}편.docx")
    doc.save(path)
    print('✅', os.path.relpath(path, ROOT))
