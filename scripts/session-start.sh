#!/usr/bin/env bash
#
# 새 Claude 대화가 열릴 때 저절로 도는 준비 (SessionStart 훅, 2026-10-05 사용자 요청 —
# "클로드를 실행하면 바로 작업이 진행되게").
#
#   1. GitHub main 의 최신 내용을 받아 지금 브랜치에 합친다 (고친 파일이 없을 때만, 충돌이 나면 되돌린다)
#   2. node_modules 가 없으면 npm install
#   3. docs/STATUS.md 앞부분을 Claude 에게 보여 준다 (훅 stdout 이 대화 맥락으로 들어간다)
#
# 훅에서 호출되므로 절대 세션을 막지 않는다 — 무엇이 실패해도 종료 코드 0.

set -uo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 0

note=""
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  if timeout 60 git fetch -q origin main 2>/dev/null; then
    branch="$(git branch --show-current 2>/dev/null)"
    # 변환으로 다시 만들어지는 생성물은 버려도 된다 (sync.cmd 와 같은 기준)
    git checkout -q -- 'content/posts/*.json' 'content/tistory/*.json' 'content/tistory/*.html' 2>/dev/null
    if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
      note="고친 파일이 있어 main 을 합치지 않았습니다 (git status 확인)."
    elif git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
      note="이미 main 최신 상태입니다 (브랜치 $branch)."
    elif git merge -q --no-edit origin/main >/dev/null 2>&1; then
      note="main 최신 내용을 합쳤습니다 (브랜치 $branch, main $(git rev-parse --short origin/main))."
    else
      git merge --abort >/dev/null 2>&1
      note="main 을 합치다 충돌이 나서 되돌렸습니다 — 직접 합쳐야 합니다."
    fi
  else
    note="GitHub 에서 받아오지 못했습니다 (인터넷 확인). 지금 PC 의 내용으로 시작합니다."
  fi
fi

if [ ! -d node_modules ] && command -v npm >/dev/null 2>&1; then
  timeout 300 npm install --no-audit --no-fund >/dev/null 2>&1 && note="$note npm install 완료."
fi

echo "## 세션 시작 자동 준비"
echo "$note"
echo
echo "사용자가 짧게(예: \"시작\", \"이어서\", \"진행해줘\") 말하면 아래 STATUS 의 남은 일·오늘 할 일을 묻지 말고 바로 이어서 한다."
echo "결과만 짧게 알린다 (CLAUDE.md '최종 목표', '사용자에게 PC 작업을 안내할 때')."
echo
echo "### docs/STATUS.md 앞부분"
head -n 60 docs/STATUS.md 2>/dev/null
exit 0
