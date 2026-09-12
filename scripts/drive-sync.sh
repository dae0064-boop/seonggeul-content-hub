#!/usr/bin/env bash
#
# 성글벙글 콘텐츠 허브 <-> Google Drive 동기화
#
#   scripts/drive-sync.sh path     로컬 드라이브 폴더 경로만 출력
#   scripts/drive-sync.sh pull     드라이브 -> 저장소 (세션 시작 시)
#   scripts/drive-sync.sh push     저장소 -> 드라이브 (세션 종료 시)
#   scripts/drive-sync.sh status   현재 연결 상태 진단
#
# 드라이브 데스크톱 앱이 없는 환경(예: 원격 컨테이너)에서는 조용히 건너뛰고
# 종료 코드 0을 반환한다. 훅에서 호출되므로 절대 세션을 막지 않는다.

set -uo pipefail

# 드라이브에 있는 기준(루트) 폴더 이름
DRIVE_FOLDER_NAME="성글벙글 원소스 멀티콘텐츠 자동화 구현"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$REPO_DIR/.drive-sync.log"

# 저장소 디렉터리 -> 드라이브 하위 폴더 매핑
PAIRS="
standards:00_기준문서
work:01_작업
schedule:02_발행일정표
memory:09_메모리
"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE"; }
say() { printf '%s\n' "$*" >&2; }

# ---------------------------------------------------------------- 경로 탐지

drive_roots() {
  # Google Drive 데스크톱이 마운트한 "내 드라이브" 후보 경로들
  local letter
  ls -d "$HOME"/Library/CloudStorage/GoogleDrive-*/"My Drive" 2>/dev/null
  ls -d "$HOME"/Library/CloudStorage/GoogleDrive-*/"내 드라이브" 2>/dev/null
  printf '%s\n' \
    "$HOME/Google Drive/My Drive" \
    "$HOME/Google Drive/내 드라이브" \
    "$HOME/Google Drive" \
    "$HOME/GoogleDrive" \
    "$HOME/google-drive"
  for letter in g h i j k l m n o p q r s t u v w x y z e f d c; do
    printf '%s\n' \
      "/$letter/My Drive" "/$letter/내 드라이브" \
      "/mnt/$letter/My Drive" "/mnt/$letter/내 드라이브"
  done
}

resolve_drive_dir() {
  # 1) 환경변수 우선
  if [ -n "${HUB_DRIVE_DIR:-}" ] && [ -d "$HUB_DRIVE_DIR" ]; then
    printf '%s\n' "$HUB_DRIVE_DIR"; return 0
  fi
  # 2) 머신별 로컬 설정 파일 (.drive-local, git 추적 제외)
  if [ -f "$REPO_DIR/.drive-local" ]; then
    # shellcheck disable=SC1091
    . "$REPO_DIR/.drive-local"
    if [ -n "${HUB_DRIVE_DIR:-}" ] && [ -d "$HUB_DRIVE_DIR" ]; then
      printf '%s\n' "$HUB_DRIVE_DIR"; return 0
    fi
  fi
  # 3) 자동 탐지
  local root candidate
  while IFS= read -r root; do
    [ -n "$root" ] || continue
    [ -d "$root" ] || continue
    candidate="$root/$DRIVE_FOLDER_NAME"
    if [ -d "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done <<EOF
$(drive_roots)
EOF
  return 1
}

# ---------------------------------------------------------------- 복사

mirror() {
  local src="$1" dst="$2"
  [ -d "$src" ] || return 0
  mkdir -p "$dst" 2>/dev/null || return 0
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --update \
      --exclude '.git/' --exclude '.DS_Store' --exclude 'desktop.ini' \
      --exclude '.gitkeep' --exclude 'Icon?' \
      "$src"/ "$dst"/ 2>>"$LOG_FILE"
  else
    cp -Ru "$src"/. "$dst"/ 2>>"$LOG_FILE" || cp -R "$src"/. "$dst"/ 2>>"$LOG_FILE"
  fi
}

copy_newer() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return 0
  mkdir -p "$(dirname "$dst")" 2>/dev/null || return 0
  if [ ! -f "$dst" ] || [ "$src" -nt "$dst" ]; then
    cp "$src" "$dst" 2>>"$LOG_FILE"
  fi
}

# 이 컴퓨터를 식별하는 이름 (메모리 파일 충돌 방지용)
machine_id() {
  local h
  h="$(hostname 2>/dev/null || echo unknown)"
  printf '%s\n' "${h%%.*}"
}

# ---------------------------------------------------------------- 명령

cmd_path() { resolve_drive_dir; }

cmd_status() {
  local dir
  if dir="$(resolve_drive_dir)"; then
    say "드라이브 폴더: $dir"
    say "저장소:        $REPO_DIR"
    local pair repo_sub drive_sub
    for pair in $PAIRS; do
      repo_sub="${pair%%:*}"; drive_sub="${pair##*:}"
      say "  $repo_sub/ <-> $drive_sub/  $([ -d "$dir/$drive_sub" ] && echo 연결됨 || echo '드라이브에 없음')"
    done
  else
    say "Google Drive 데스크톱 폴더를 찾지 못했습니다."
    say "이 컴퓨터에서는 git 동기화만 사용됩니다."
    say "경로를 직접 지정하려면 저장소 루트에 .drive-local 파일을 만들고"
    say "  HUB_DRIVE_DIR=\"/경로/내 드라이브/$DRIVE_FOLDER_NAME\""
    say "를 적어 주세요."
    return 1
  fi
}

cmd_pull() {
  local dir pair repo_sub drive_sub
  dir="$(resolve_drive_dir)" || { log "pull 건너뜀 (드라이브 폴더 없음)"; exit 0; }
  for pair in $PAIRS; do
    repo_sub="${pair%%:*}"; drive_sub="${pair##*:}"
    mirror "$dir/$drive_sub" "$REPO_DIR/$repo_sub"
  done
  copy_newer "$dir/09_메모리/CLAUDE.md" "$REPO_DIR/CLAUDE.md"
  log "pull 완료 <- $dir"
}

cmd_push() {
  local dir pair repo_sub drive_sub mid
  dir="$(resolve_drive_dir)" || { log "push 건너뜀 (드라이브 폴더 없음)"; exit 0; }
  mid="$(machine_id)"
  for pair in $PAIRS; do
    repo_sub="${pair%%:*}"; drive_sub="${pair##*:}"
    mirror "$REPO_DIR/$repo_sub" "$dir/$drive_sub"
  done
  # 프로젝트 메모리 본체
  copy_newer "$REPO_DIR/CLAUDE.md" "$dir/09_메모리/CLAUDE.md"
  # 사용자 전역 메모리 (컴퓨터별로 따로 보관)
  copy_newer "$HOME/.claude/CLAUDE.md" "$dir/09_메모리/_user/$mid-CLAUDE.md"
  log "push 완료 -> $dir"
}

case "${1:-status}" in
  path)   cmd_path ;;
  pull)   cmd_pull ;;
  push)   cmd_push ;;
  status) cmd_status ;;
  *) say "사용법: $0 {pull|push|status|path}"; exit 2 ;;
esac
