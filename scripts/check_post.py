#!/usr/bin/env python3
"""성글벙글 블로그 원고 기계 검수기.

규칙 중 사람이 판단할 것과 기계가 셀 수 있는 것을 분리한다.
이 스크립트는 세는 것만 한다. 글이 좋은지는 판단하지 않는다.

    python3 check_post.py 원고.md

원고는 앞머리에 다음 정보를 둔다(--- 사이).

    ---
    제목: 암치료비 보장범위, 진단비만으로 충분할까요?
    메인키워드: 암치료비
    서브키워드: 암진단비, 항암치료, 호르몬치료
    타겟: 10년 전 암보험에 가입하고 갱신을 앞둔 40대 후반
    목적: 내 증권의 암치료비 지급조건을 직접 확인하게 만든다
    ---

종료코드: 0 통과 / 1 경고만 / 2 오류 있음
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 규칙 [4] 광고 심의 - 확정적 표현
# ---------------------------------------------------------------------------

# 문맥과 무관하게 걸러야 하는 것
HARD_BANNED = ["100%", "손실 없음", "손실없음", "공짜", "단언컨대"]

# 최상급. 다만 '가장 먼저'처럼 순서를 뜻하는 용법이 있어 문맥을 본다.
SUPERLATIVES = ["최고", "최저", "제일", "가장"]
SUPERLATIVE_OK_AFTER = ["먼저", "많이", "가까운", "중요한 건", "큰 문제는"]

# '무조건'은 부정과 함께 쓰이면 오히려 규칙을 지키는 문장이 된다.
#   "무조건 좋은 건 아니에요"  -> 정상
#   "무조건 받을 수 있습니다"  -> 위반
NEGATION_NEAR = r"(아니|않|없|말고|보다는|같지만|일까요|할까요|거나)"

# '보장'은 보험 글의 일상어다. 단정 서술로 쓰일 때만 문제가 된다.
GUARANTEE_ASSERTION = re.compile(
    r"보장(합니다|해\s*드립니다|해드립니다|해\s*줍니다|해줍니다|됩니다만|은\s*확실)"
)

# 규칙 [4] 이미지/본문 통화 표기
CURRENCY = ["₩", "$", "＄"]

# 규칙 [5] 2차 가공 출처 - 인용 금지
SECONDARY_SOURCE_HINTS = [
    "blog.naver.com", "m.blog.naver.com", "tistory.com", "brunch.co.kr",
    "cafe.naver.com", "post.naver.com", "news.naver.com", "n.news.naver.com",
    "namu.wiki", "wikipedia.org", "velog.io", "medium.com",
]

# 규칙 [3] 필수 해시태그
REQUIRED_TAGS = ["#설계사한다", "#한다블로그"]

MIN_CHARS = 2000
MIN_MAIN_KEYWORD = 10
MIN_SUB_KEYWORD = 5
TARGET_TAGS = 15
QA_MIN, QA_MAX = 3, 5

# 네이버 발행 규격
TITLE_MIN, TITLE_MAX = 20, 30      # 제목 공백 포함
LINE_MAX = 25                      # 모바일 한 줄
IMG_MIN, IMG_MAX = 8, 10           # 이미지 장수

# 원고에서 쓰는 표시. 네이버 에디터에 붙일 때 무엇을 적용할지 나타낸다.
MARKUP = {
    "소제목": re.compile(r"^\[소제목\]\s*(.+)$", re.MULTILINE),   # 인용구 4번
    "노랑": re.compile(r"\[노랑\](.+?)\[/노랑\]", re.DOTALL),      # 핵심 정보
    "빨강": re.compile(r"\[빨강\](.+?)\[/빨강\]", re.DOTALL),      # 주의·예외
    "이미지": re.compile(r"^\[이미지:\s*(.+?)\]$", re.MULTILINE),
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.passes: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def ok(self, msg: str) -> None:
        self.passes.append(msg)


def parse_front_matter(text: str) -> tuple[dict, str]:
    """--- 로 감싼 앞머리를 읽는다. 없으면 빈 정보로 본문만 돌려준다."""
    if not text.lstrip().startswith("---"):
        return {}, text
    body = text.lstrip()
    end = body.find("\n---", 3)
    if end == -1:
        return {}, text
    head = body[3:end]
    rest = body[end + 4:]
    meta: dict[str, str] = {}
    for line in head.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    return meta, rest


def split_keywords(value: str) -> list[str]:
    return [k.strip() for k in re.split(r"[,·/]", value) if k.strip()]


def context_of(text: str, idx: int, width: int = 40) -> str:
    lo, hi = max(0, idx - width), min(len(text), idx + width)
    return text[lo:hi].replace("\n", " ").strip()


# ---------------------------------------------------------------------------
# 개별 검사
# ---------------------------------------------------------------------------

def check_length(body: str, rep: Report) -> None:
    # 해시태그 줄과 출처 목록은 본문 분량으로 치지 않는다.
    prose = re.sub(r"^#\S+.*$", "", body, flags=re.MULTILINE)
    prose = re.sub(r"https?://\S+", "", prose)
    n = len(prose)
    if n >= MIN_CHARS:
        rep.ok(f"분량 {n:,}자 (기준 {MIN_CHARS:,}자)")
    else:
        rep.error(f"분량 부족: {n:,}자. {MIN_CHARS - n:,}자 더 필요합니다.")


def check_keywords(body: str, meta: dict, rep: Report) -> None:
    main = meta.get("메인키워드", "").strip()
    if not main:
        rep.error("앞머리에 메인키워드가 없습니다.")
    else:
        c = body.count(main)
        if c >= MIN_MAIN_KEYWORD:
            rep.ok(f"메인키워드 '{main}' {c}회 (기준 {MIN_MAIN_KEYWORD}회)")
        else:
            rep.error(f"메인키워드 '{main}' {c}회 — {MIN_MAIN_KEYWORD - c}회 더 필요합니다.")

    subs = split_keywords(meta.get("서브키워드", ""))
    if not subs:
        rep.warn("서브키워드가 없습니다.")
    for s in subs:
        c = body.count(s)
        if c >= MIN_SUB_KEYWORD:
            rep.ok(f"서브키워드 '{s}' {c}회")
        else:
            rep.error(f"서브키워드 '{s}' {c}회 — {MIN_SUB_KEYWORD - c}회 더 필요합니다.")


def check_banned(body: str, rep: Report) -> None:
    for word in HARD_BANNED:
        for m in re.finditer(re.escape(word), body):
            rep.error(f"금지 표현 '{word}' — …{context_of(body, m.start())}…")

    for word in SUPERLATIVES:
        for m in re.finditer(re.escape(word), body):
            after = body[m.end():m.end() + 12]
            if any(after.lstrip().startswith(ok) for ok in SUPERLATIVE_OK_AFTER):
                continue
            rep.warn(f"최상급 '{word}' 확인 필요 — …{context_of(body, m.start())}…")

    for m in re.finditer("무조건", body):
        window = body[m.end():m.end() + 30]
        if re.search(NEGATION_NEAR, window):
            continue  # "무조건 좋은 건 아니에요" 류는 규칙을 지키는 문장이다
        rep.error(f"'무조건' 단정 — …{context_of(body, m.start())}…")

    for m in GUARANTEE_ASSERTION.finditer(body):
        rep.error(f"'보장' 단정 서술 — …{context_of(body, m.start())}…")

    for sym in CURRENCY:
        if sym in body:
            rep.warn(f"통화기호 '{sym}' 사용 — 숫자·서류 표기로 바꾸세요.")


def check_daily_premium(body: str, rep: Report) -> None:
    """일 단위 보험료 단독 강조 금지. 가입금액·연령·납입기간 병기를 확인한다."""
    for m in re.finditer(r"(하루|1일|일)\s*[\d,]+\s*원", body):
        near = context_of(body, m.start(), 120)
        has_context = any(k in near for k in ("가입금액", "세", "납입", "만기", "기준"))
        if not has_context:
            rep.error(f"일 단위 보험료 단독 강조 — …{near}… (가입금액·연령·납입기간 병기 필요)")


def check_sources(body: str, rep: Report) -> None:
    urls = re.findall(r"https?://[^\s)\]]+", body)
    if not urls:
        rep.error("출처 URL이 없습니다. 수치·제도는 1차 원문 링크가 필요합니다.")
        return
    rep.ok(f"출처 링크 {len(urls)}개")
    for u in urls:
        for bad in SECONDARY_SOURCE_HINTS:
            if bad in u:
                rep.error(f"2차 가공 출처로 보입니다: {u}")
                break
    if not re.search(r"\d{4}[.\-년]\s?\d{1,2}", body):
        rep.warn("출처 발표일로 보이는 날짜가 없습니다. 기관·제목·발표일·링크를 함께 적으세요.")


def check_tags(body: str, rep: Report) -> None:
    tags = re.findall(r"#[^\s#]+", body)
    uniq = list(dict.fromkeys(tags))
    for req in REQUIRED_TAGS:
        if req not in uniq:
            rep.error(f"필수 해시태그 누락: {req}")
    extra = [t for t in uniq if t not in REQUIRED_TAGS]
    if not tags:
        rep.error("해시태그가 없습니다.")
    elif len(extra) < TARGET_TAGS:
        rep.warn(f"내용 맞춤 해시태그 {len(extra)}개 — {TARGET_TAGS}개 권장")
    else:
        rep.ok(f"해시태그 {len(uniq)}개 (필수 포함)")


def check_title(meta: dict, rep: Report) -> None:
    title = meta.get("제목", "").strip()
    main = meta.get("메인키워드", "").strip()
    if not title:
        rep.error("앞머리에 제목이 없습니다.")
        return
    if main and not title.startswith(main):
        rep.error(f"제목이 메인키워드로 시작하지 않습니다. 현재: '{title.split()[0]}' / 기대: '{main}'")
    else:
        rep.ok(f"제목 첫 어절이 메인키워드입니다")

    n = len(title)
    if TITLE_MIN <= n <= TITLE_MAX:
        rep.ok(f"제목 {n}자 (기준 {TITLE_MIN}~{TITLE_MAX}자): {title}")
    else:
        rep.error(f"제목 {n}자 — 기준 {TITLE_MIN}~{TITLE_MAX}자를 벗어납니다: {title}")


def check_naver_format(body: str, rep: Report) -> None:
    """모바일 가독성과 네이버 에디터 표시를 확인한다."""
    # 표시 마크업과 출처/해시태그 줄은 길이 검사에서 뺀다.
    long_lines = []
    for i, raw in enumerate(body.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith(("#", "-", "[이미지:", "http")):
            continue
        plain = re.sub(r"\[/?(소제목|노랑|빨강)\]", "", line).strip()
        if len(plain) > LINE_MAX:
            long_lines.append((i, len(plain), plain[:34]))
    if long_lines:
        rep.warn(f"한 줄 {LINE_MAX}자 초과 {len(long_lines)}곳 — 모바일에서 어색하게 끊깁니다.")
        for ln, n, preview in long_lines[:5]:
            rep.warn(f"    {ln}행 {n}자: {preview}…")
    else:
        rep.ok(f"모든 줄이 {LINE_MAX}자 이내입니다.")

    subs = MARKUP["소제목"].findall(body)
    rep.ok(f"소제목 {len(subs)}개 (네이버 인용구 4번으로 적용)") if subs \
        else rep.warn("소제목 표시가 없습니다. [소제목] 으로 표시하세요.")

    yellow = MARKUP["노랑"].findall(body)
    red = MARKUP["빨강"].findall(body)
    if yellow:
        rep.ok(f"핵심 정보(연노랑 배경) {len(yellow)}곳")
    if red:
        rep.ok(f"주의·예외(빨간 글씨) {len(red)}곳")

    # 같은 문구에 두 색을 겹쳐 쓰면 안 된다
    for seg in yellow:
        if "[빨강]" in seg:
            rep.error(f"한 문구에 두 색이 겹쳤습니다: …{seg[:30]}…")
    for seg in red:
        if "[노랑]" in seg:
            rep.error(f"한 문구에 두 색이 겹쳤습니다: …{seg[:30]}…")

    imgs = MARKUP["이미지"].findall(body)
    if IMG_MIN <= len(imgs) <= IMG_MAX:
        rep.ok(f"이미지 {len(imgs)}장 (기준 {IMG_MIN}~{IMG_MAX}장)")
    else:
        rep.error(f"이미지 {len(imgs)}장 — 기준 {IMG_MIN}~{IMG_MAX}장")

    # 이미지가 글 끝에 몰려 있으면 안 된다
    lines = body.splitlines()
    positions = [i for i, l in enumerate(lines) if l.strip().startswith("[이미지:")]
    if positions and lines:
        tail = len(lines) * 0.75
        if all(p > tail for p in positions):
            rep.error("이미지가 글 끝에 몰려 있습니다. 관련 문단 사이에 배치하세요.")


def check_verification_flags(body: str, rep: Report) -> None:
    """확인 안 된 사실이 남아 있으면 발행을 막는다."""
    pending = re.findall(r"\[확인필요[^\]]*\]", body)
    if pending:
        rep.error(f"미확인 표시 {len(pending)}곳이 남아 있습니다. 1차 출처로 확인한 뒤 지우세요.")
        for p in pending[:5]:
            rep.error(f"    {p}")


def check_structure(body: str, meta: dict, rep: Report) -> None:
    for field in ("타겟", "목적"):
        if not meta.get(field):
            rep.error(f"앞머리에 {field}이(가) 없습니다. 쓰기 전에 확정해야 합니다.")

    questions = re.findall(r"^[^\n]*\?\s*$", body, flags=re.MULTILINE)
    if QA_MIN <= len(questions) <= QA_MAX + 4:
        rep.ok(f"질문형 문장 {len(questions)}개 (Q&A {QA_MIN}~{QA_MAX}개 기준)")
    elif len(questions) < QA_MIN:
        rep.warn(f"질문형 문장이 {len(questions)}개뿐입니다. Q&A를 {QA_MIN}~{QA_MAX}개 넣으세요.")

    cta_hints = ["확인해보세요", "확인해 보세요", "살펴보세요", "확인해보는", "점검"]
    if not any(h in body for h in cta_hints):
        rep.error("점검형 CTA가 보이지 않습니다. 판매가 아니라 '확인해보세요'로 끝내야 합니다.")
    else:
        rep.ok("점검형 CTA 있음")


# ---------------------------------------------------------------------------

def render(rep: Report, path: Path) -> int:
    print(f"\n검수 대상: {path}")
    print("=" * 60)

    if rep.passes:
        print("\n[통과]")
        for m in rep.passes:
            print(f"  o {m}")
    if rep.warnings:
        print("\n[확인 필요]")
        for m in rep.warnings:
            print(f"  ? {m}")
    if rep.errors:
        print("\n[고쳐야 함]")
        for m in rep.errors:
            print(f"  X {m}")

    print("\n" + "=" * 60)
    if rep.errors:
        print(f"오류 {len(rep.errors)}건, 확인 필요 {len(rep.warnings)}건 — 발행 전 수정하세요.")
        return 2
    if rep.warnings:
        print(f"오류 없음. 확인 필요 {len(rep.warnings)}건 — 사람이 판단하세요.")
        return 1
    print("기계 검수 통과. 이제 발행 전 10문항을 직접 확인하세요.")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="성글벙글 블로그 원고 기계 검수")
    ap.add_argument("path", help="검수할 원고 (.md)")
    args = ap.parse_args(argv)

    path = Path(args.path).expanduser()
    if not path.is_file():
        print(f"파일이 없습니다: {path}", file=sys.stderr)
        return 2

    text = path.read_text(encoding="utf-8")
    meta, body = parse_front_matter(text)

    rep = Report()
    check_title(meta, rep)
    check_structure(body, meta, rep)
    check_length(body, rep)
    check_keywords(body, meta, rep)
    check_banned(body, rep)
    check_daily_premium(body, rep)
    check_sources(body, rep)
    check_tags(body, rep)
    check_naver_format(body, rep)
    check_verification_flags(body, rep)

    return render(rep, path)


if __name__ == "__main__":
    sys.exit(main())
