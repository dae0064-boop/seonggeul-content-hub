#!/usr/bin/env python3
"""작성 현황 추적기.

주제 풀(data/topics.json)과 진행 상태(data/progress.json)를 관리하고
TRACKER.md 를 렌더링한다.

상태값
  todo : 미완료 (빨강)
  wip  : 작성중 (노랑)
  done : 완료   (초록)
"""
import argparse
import json
import os
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPICS = os.path.join(ROOT, "data", "topics.json")
PROGRESS = os.path.join(ROOT, "data", "progress.json")
TRACKER = os.path.join(ROOT, "TRACKER.md")

KST = timezone(timedelta(hours=9))
CHANNELS = ["blog", "tistory", "cardnews"]
CHANNEL_KR = {"blog": "블로그", "tistory": "티스토리", "cardnews": "카드뉴스"}

# 미완료(빨강) / 작성중(노랑) / 완료(초록)
BADGE = {
    "todo": ("🟥", "[ ]", "미완료"),
    "wip": ("🟨", "[~]", "작성중"),
    "done": ("🟩", "[x]", "완료"),
}
ORDER = {"todo": 0, "wip": 1, "done": 2}


def today_kst():
    return datetime.now(KST).strftime("%Y-%m-%d")


def now_kst():
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")


def load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save(path, data):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def load_progress():
    return load(PROGRESS, {"entries": []})


def used_ids(progress):
    """이미 배정된 주제 id 집합. 중복 배정 방지의 단일 근거."""
    return {e["topic_id"] for e in progress["entries"]}


def find_entry(progress, date, channel):
    for e in progress["entries"]:
        if e["date"] == date and e["channel"] == channel:
            return e
    return None


def cmd_assign(args):
    """해당 날짜에 채널별로 아직 쓰지 않은 주제를 하나씩 배정한다."""
    topics = load(TOPICS, {})
    progress = load_progress()
    date = args.date or today_kst()
    used = used_ids(progress)
    assigned = []

    for channel in CHANNELS:
        existing = find_entry(progress, date, channel)
        if existing:
            assigned.append(existing)
            continue
        nxt = next((t for t in topics[channel] if t["id"] not in used), None)
        if nxt is None:
            print(f"[경고] {channel} 주제 풀이 소진되었습니다. data/topics.json 에 주제를 추가하세요.")
            continue
        entry = {
            "date": date,
            "channel": channel,
            "topic_id": nxt["id"],
            "title": nxt["title"],
            "keywords": nxt.get("keywords", []),
            "status": "todo",
            "file": f"content/{date}/{channel}-{nxt['id']}.md",
            "updated_at": now_kst(),
        }
        progress["entries"].append(entry)
        used.add(nxt["id"])
        assigned.append(entry)

    save(PROGRESS, progress)
    print(json.dumps(assigned, ensure_ascii=False, indent=2))


def cmd_set(args):
    progress = load_progress()
    date = args.date or today_kst()
    entry = find_entry(progress, date, args.channel)
    if entry is None:
        raise SystemExit(f"{date} / {args.channel} 배정 기록이 없습니다. 먼저 assign 을 실행하세요.")
    entry["status"] = args.status
    entry["updated_at"] = now_kst()
    save(PROGRESS, progress)
    print(f"{date} {args.channel} -> {args.status}")


def cmd_render(args):
    topics = load(TOPICS, {})
    progress = load_progress()
    entries = sorted(progress["entries"], key=lambda e: (e["date"], CHANNELS.index(e["channel"])), reverse=True)

    counts = {s: sum(1 for e in progress["entries"] if e["status"] == s) for s in BADGE}
    total_pool = sum(len(topics[c]) for c in CHANNELS)
    remaining = total_pool - len(used_ids(progress))

    lines = []
    lines.append("# 📋 콘텐츠 작성 현황")
    lines.append("")
    lines.append(f"> 분야: **건강·생활정보** · 마지막 갱신: **{now_kst()}**")
    lines.append("")
    lines.append("## 상태 범례")
    lines.append("")
    lines.append("| 표시 | 체크박스 | 의미 |")
    lines.append("|:---:|:---:|---|")
    for key in ["todo", "wip", "done"]:
        emoji, box, label = BADGE[key]
        lines.append(f"| {emoji} | `{box}` | **{label}** |")
    lines.append("")
    lines.append("## 요약")
    lines.append("")
    lines.append("| 🟥 미완료 | 🟨 작성중 | 🟩 완료 | 남은 주제 |")
    lines.append("|:---:|:---:|:---:|:---:|")
    lines.append(f"| {counts['todo']} | {counts['wip']} | {counts['done']} | {remaining} / {total_pool} |")
    lines.append("")

    lines.append("## 일자별 현황")
    lines.append("")
    current_date = None
    for e in entries:
        if e["date"] != current_date:
            current_date = e["date"]
            lines.append("")
            lines.append(f"### 📅 {current_date}")
            lines.append("")
        emoji, box, label = BADGE[e["status"]]
        link = f"[{e['title']}]({e['file']})" if e["status"] == "done" else e["title"]
        lines.append(f"- {box} {emoji} **{CHANNEL_KR[e['channel']]}** · `{e['topic_id']}` — {link} _( {label} )_")
    lines.append("")

    lines.append("## 남은 주제 풀 (미배정)")
    lines.append("")
    for channel in CHANNELS:
        used = used_ids(progress)
        left = [t for t in topics[channel] if t["id"] not in used]
        lines.append(f"<details><summary><b>{CHANNEL_KR[channel]}</b> — {len(left)}개 남음</summary>")
        lines.append("")
        for t in left:
            lines.append(f"- [ ] 🟥 `{t['id']}` {t['title']}")
        lines.append("")
        lines.append("</details>")
        lines.append("")

    with open(TRACKER, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(f"TRACKER.md 갱신 완료 (미완료 {counts['todo']} / 작성중 {counts['wip']} / 완료 {counts['done']})")


def cmd_today(args):
    progress = load_progress()
    date = args.date or today_kst()
    rows = [e for e in progress["entries"] if e["date"] == date]
    print(json.dumps(rows, ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="콘텐츠 작성 현황 추적기")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("assign", help="날짜별 주제 배정 (중복 없음)")
    a.add_argument("--date")
    a.set_defaults(func=cmd_assign)

    s = sub.add_parser("set", help="상태 변경")
    s.add_argument("--date")
    s.add_argument("--channel", required=True, choices=CHANNELS)
    s.add_argument("--status", required=True, choices=list(BADGE))
    s.set_defaults(func=cmd_set)

    r = sub.add_parser("render", help="TRACKER.md 렌더링")
    r.set_defaults(func=cmd_render)

    t = sub.add_parser("today", help="오늘 배정 조회")
    t.add_argument("--date")
    t.set_defaults(func=cmd_today)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
