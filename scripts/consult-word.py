#!/usr/bin/env python3
"""상담형 글 심의 초안(.md)을 GOMS 에 올릴 Word(.docx)로 바꾼다.

    python3 scripts/consult-word.py content/consult/상담형-3-*.md   (여러 개 가능)

- 앞머리(--- … ---)의 title 은 제목(Heading 1), `인용구(소제목) …` 줄은 Heading 2, 나머지 줄은 그대로 한 문단씩.
- 앞머리의 다른 줄(심의용·사용자 확인 메모)은 Word 에 넣지 않는다.
- 같은 이름의 .docx 를 옆에 만든다 (있으면 덮어쓴다).
"""
import re
import sys
from pathlib import Path

import docx


def convert(md_path: Path) -> Path:
    text = md_path.read_text(encoding='utf-8')
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m:
        raise SystemExit(f'{md_path}: 앞머리(---)가 없어요')
    head, body = m.group(1), text[m.end():]
    title = next((l.split(':', 1)[1].strip() for l in head.splitlines() if l.startswith('title:')), md_path.stem)

    doc = docx.Document()
    doc.add_heading(title, level=1)
    lines = body.strip('\n').split('\n')
    for line in lines:
        if line.startswith('인용구(소제목)'):
            doc.add_heading(line[len('인용구(소제목)'):].strip(), level=2)
        else:
            doc.add_paragraph(line)
    out = md_path.with_suffix('.docx')
    doc.save(out)
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for p in sys.argv[1:]:
        print('만듦:', convert(Path(p)))
