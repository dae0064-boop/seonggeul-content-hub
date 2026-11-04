#!/usr/bin/env python3
"""맛집 사진 준비 (클라우드 Claude 가 대화로 받은 사진을 저장소에 넣을 때 쓴다 — 2026-11-04 사용자).

    python3 scripts/matjip-photos.py <저장 폴더> <사진1> [<사진2>[@x0,y0,x1,y1[;x0,y0,x1,y1]]] ...

- 넘긴 순서대로 01.jpg, 02.jpg … 로 저장한다 (= 원고 [사진 1], [사진 2] …). 1번은 대표사진(메뉴 또는 입구 간판).
- `@` 뒤는 모자이크할 칸이다. 사진 너비·높이에 대한 비율(0~1)로 왼쪽 위·오른쪽 아래. 실제 사람의 얼굴과 차 번호판만 작게 칠한다 (2026-11-04 사용자 — 가장 약하게, 그림·사진·TV 속 사람은 안 칠함).
  칸은 Claude 가 사진을 눈으로 보고 정한다 — 저장한 뒤 다시 열어 사람이 남지 않았는지 꼭 확인한다.
- 긴 변 1600px 로 줄이고, 사진 정보(EXIF — 찍은 곳 GPS 포함)는 지운다. 저장소는 공개다.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for old in out.glob('*.jpg'):
    old.unlink()
for i, arg in enumerate(sys.argv[2:], 1):
    src, _, boxes = arg.partition('@')
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    im.thumbnail((1600, 1600))
    w, h = im.size
    for b in filter(None, boxes.split(';')):
        x0, y0, x1, y1 = (float(v) for v in b.split(','))
        box = (int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))
        part = im.crop(box)
        cell = max(5, min(part.size) // 6)  # 가장 약한 모자이크 — 얼굴만 살짝 (2026-11-04 사용자). 칸은 얼굴·번호판에만 작게
        small = part.resize((max(1, part.width // cell), max(1, part.height // cell)), Image.BILINEAR)
        im.paste(small.resize(part.size, Image.NEAREST), box)
    dst = out / f'{i:02d}.jpg'
    im.save(dst, 'JPEG', quality=85)  # exif 를 넘기지 않으므로 사진 정보가 빠진다
    print(dst, im.size, f'모자이크 {len([b for b in boxes.split(";") if b])}곳')
