#!/usr/bin/env python3
"""
스레드 보험글 배너 — 편마다 준법심의필번호·유효기간을 넣은 사진을 만든다 (2026-10-26 사용자 지시).

  python3 scripts/threads/banner.py <goms-approved.tsv>            새로 승인된 편만 만든다
  python3 scripts/threads/banner.py <goms-approved.tsv> --force    전부 다시

- 바탕: content/threads/insurance/banners/base.jpg (사용자 배너, 맨 아래 줄이 자리표시 "제26-00-0000호(2026.00.00~2027.00.00)")
- 결과: content/threads/insurance/banners/thread-<N>.jpg — 스레드 API 가 공개 주소로만 사진을 받아 가서 저장소(공개)에 둔다
  (같은 날 사용자 승인. 배너는 어차피 스레드에 공개로 올라가는 사진이다).
- tsv 한 줄: 번호<TAB>제26-10-0209호<TAB>2026-10-06<TAB>2027-10-05<TAB>적격<TAB>읽은 날 (goms-ad.mjs --approved 가 적는다)
- 만든 배너의 글 줄은 banners/made.tsv 에 남긴다. 표의 번호·기간이 바뀌면 그 편 배너를 다시 만든다.
- 심의결과가 "적격" 인 편만 만든다. 맨 아래 줄만 바탕색으로 덮고 같은 글꼴(Pretendard Bold 14.8)로 다시 쓴다.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'content/threads/insurance/banners'
FONT = Path(__file__).resolve().parent / 'fonts/Pretendard-Bold.otf'
# base.jpg(801x252) 맨 아래 줄 자리 — 2026-10-26 원본에서 잰 값
BOX = (228, 203, 742, 225)
LEFT, TOP = 232, 208
BG, INK = (250, 247, 238), (53, 34, 20)


def line(no, start, end):
    d = lambda s: s.replace('-', '.')
    return f'글로벌금융판매 준법감시인 심의필 {no}({d(start)}~{d(end)})'


def make(no, start, end, out):
    im = Image.open(DIR / 'base.jpg').convert('RGB')
    f = ImageFont.truetype(str(FONT), 14.8)
    text = line(no, start, end)
    draw = ImageDraw.Draw(im)
    draw.rectangle(BOX, fill=BG)
    b, h = f.getbbox(text), f.getbbox('글')
    if LEFT + b[2] - b[0] > BOX[2]:
        raise SystemExit(f'글자가 칸보다 길어요: {text}')
    draw.text((LEFT - b[0], TOP - h[1]), text, font=f, fill=INK)
    im.save(out, quality=95)


def rows(tsv):
    for raw in Path(tsv).read_text(encoding='utf-8-sig').splitlines():
        c = raw.split('\t')
        if len(c) >= 5 and c[0].strip().isdigit():
            yield int(c[0]), c[1].strip(), c[2].strip(), c[3].strip(), c[4].strip()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    force = '--force' in sys.argv
    index = DIR / 'made.tsv'
    done = {}
    if index.exists():
        for raw in index.read_text(encoding='utf-8').splitlines():
            n, _, t = raw.partition('\t')
            if n.isdigit():
                done[int(n)] = t
    made = 0
    for n, no, start, end, result in rows(sys.argv[1]):
        out = DIR / f'thread-{n}.jpg'
        if result != '적격':
            print(f'건너뜀: 스레드 {n}편 (심의결과 {result or "없음"})')
            continue
        text = line(no, start, end)
        if out.exists() and done.get(n) == text and not force:
            continue
        make(no, start, end, out)
        done[n] = text
        made += 1
        print(f'만듦: {out.relative_to(ROOT)} — {text}')
    index.write_text(''.join(f'{n}\t{t}\n' for n, t in sorted(done.items())), encoding='utf-8')
    print(f'배너 {made}장 새로 만듦')


if __name__ == '__main__':
    main()
