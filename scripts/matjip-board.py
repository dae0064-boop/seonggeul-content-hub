#!/usr/bin/env python3
"""맛집 후기 원고 → 네이버 붙여넣기 화면(아티팩트용 HTML) 만들기.

    python3 scripts/matjip-board.py <원고.md> <사진 폴더> <출력.html>

사진 폴더의 jpg/png 를 이름 순서대로 [사진 1]~[사진 N] 에 붙인다 (모자이크를 마친 사진).
사진은 HTML 안에 넣으므로 출력 파일은 저장소 밖(스크래치 폴더)에 둔다 — 저장소는 공개다.
서식 규칙은 CLAUDE.md "모바일 가독 포맷"·publish-naver.mjs 와 같다:
빨강 #ff0010 · 파랑 #0078cb · 노란배경 #fff8b2, 셋 다 굵게. 소제목은 인용구 4번(라인&따옴표).
"""
import base64, io, json, re, sys
from pathlib import Path
from PIL import Image

md, photo_dir, out = map(Path, sys.argv[1:4])
src = md.read_text(encoding='utf-8')
_, fm, body = src.split('---', 2)
meta = dict(re.findall(r'^(\w+):\s*(.*)$', fm, re.M))
body = re.sub(r'<!--.*?-->', '', body, flags=re.S).strip()

photos = []
for f in sorted(p for p in photo_dir.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png')):
    im = Image.open(f).convert('RGB')
    im.thumbnail((1280, 1280))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=84)
    photos.append({'name': f.stem, 'src': 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()})

data = {'title': meta.get('title', ''), 'shop': meta.get('shop', ''), 'address': meta.get('address', ''),
        'tags': meta.get('tags', ''), 'body': body, 'photos': photos}
tpl = (Path(__file__).with_name('matjip-board.html')).read_text(encoding='utf-8')
tpl = tpl.replace('<title>맛집 원고 붙여넣기</title>', f"<title>{data['shop'] or '맛집'} 원고 붙여넣기</title>")
html = tpl.replace('/*DATA*/null', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
out.write_text(html, encoding='utf-8')
print(out, f'{len(html)//1024}KB', f'사진 {len(photos)}장')
