#!/usr/bin/env python3
"""
스레드 보험글 배너 — 편마다 준법심의필번호·유효기간을 넣은 사진을 만든다 (2026-10-26 사용자 지시).

  python3 scripts/threads/banner.py <goms-approved.tsv>            새로 승인된 편만 만든다
  python3 scripts/threads/banner.py <goms-approved.tsv> --force    전부 다시

- 디자인: 2026-11-03 새 배너 (banner-styles.mjs d-warm + art-d-warm.jpg). base.jpg 는 자리표시(제26-00-0000호) 판 — Word 틀(word-template.docx)과 같은 그림
- 결과: content/threads/insurance/banners/thread-<N>.jpg — 스레드 API 가 공개 주소로만 사진을 받아 가서 저장소(공개)에 둔다
  (같은 날 사용자 승인. 배너는 어차피 스레드에 공개로 올라가는 사진이다).
- tsv 한 줄: 번호<TAB>제26-10-0209호<TAB>2026-10-06<TAB>2027-10-05<TAB>적격<TAB>읽은 날 (goms-ad.mjs --approved 가 적는다)
- 만든 배너의 글 줄은 banners/made.tsv 에 남긴다. 표의 번호·기간이 바뀌면 그 편 배너를 다시 만든다.
- 심의결과가 "적격" 인 편만 만든다. made.tsv 에 디자인 이름을 같이 적어, 디자인이 바뀌면 다시 만든다.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'content/threads/insurance/banners'
# 2026-11-03 사용자: 새 배너(크림·복숭아 GPT 배경 + 왼쪽 '친근한 설계사')로 바꿈 — 앞으로 심의 올릴 때·받았을 때 모두 이 배너.
#   그림은 scripts/threads/banner-styles.mjs 의 d-warm 디자인으로 그리고, 배경은 저장소의 art-d-warm.jpg 를 쓴다 (GPT 다시 안 부름, 비용 0).
#   크롬(PC) 또는 playwright 크로미움(클라우드)으로 그린다. 옛 배너(base.jpg 맨 아래 줄 덮어쓰기)는 git 기록에.
DESIGN = 'd-warm'
ART = DIR / 'art-d-warm.jpg'


def line(no, start, end):
    d = lambda s: s.replace('-', '.')
    return f'글로벌금융판매 준법감시인 심의필 {no}({d(start)}~{d(end)})'


def make(no, start, end, out):
    r = subprocess.run(['node', str(ROOT / 'scripts/threads/banner-styles.mjs'), '--only', DESIGN, '--art-file', str(ART),
                        '--no', no, '--from', start, '--to', end, '--file', str(out)], capture_output=True, text=True)
    if r.returncode != 0 or not Path(out).exists():
        raise SystemExit(f'배너를 못 그렸어요 ({no}): {(r.stderr or r.stdout).strip()[-400:]}')


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
        text = f'{line(no, start, end)} [{DESIGN}]'
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
