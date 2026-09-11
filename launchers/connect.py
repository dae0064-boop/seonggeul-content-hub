#!/usr/bin/env python3
"""ClaudeWorkspace 연결 스크립트.

이 파일은 Google Drive 의 ClaudeWorkspace 폴더 안에 들어 있다.
새 컴퓨터에서 이 파일 하나만 실행하면 연결이 끝난다. git clone 이 필요 없다.

    python connect.py

하는 일:
  1. Drive 에 동기화 도구가 이미 있으면 그대로 쓴다.
  2. 없으면 GitHub 에서 받아 .workspace/bin/ 에 넣는다.
  3. bootstrap 을 실행해 이 컴퓨터를 워크스페이스에 연결한다.

한 번 연결되면 도구가 Drive 에 남으므로, 다음 컴퓨터는 인터넷 없이도
(Drive 동기화만 되면) 연결할 수 있다.

    python connect.py --update    최신 도구로 갱신한 뒤 연결
    python connect.py --no-hooks  자동 동기화 훅 없이 연결
"""

from __future__ import annotations

import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = "dae0064-boop/seonggeul-content-hub"
BRANCH = "claude/beautiful-maxwell-bjdkgb"

HERE = Path(__file__).resolve().parent
BIN = HERE / ".workspace" / "bin"

# 저장소 경로 -> Drive 안에 놓을 위치.
# memory/CLAUDE.md 는 .workspace/memory/ 에 둔다. bootstrap 이 그 자리를
# 기준 메모리 템플릿으로 읽어 공유 메모리에 심는다.
FILES = {
    "scripts/workspace.py": BIN / "workspace.py",
    "scripts/ws_hooks.py": BIN / "ws_hooks.py",
    "memory/CLAUDE.md": HERE / ".workspace" / "memory" / "CLAUDE.md",
}


def download_tools() -> bool:
    """GitHub 에서 도구와 기준 메모리를 받아 Drive 안에 넣는다."""
    for repo_path, dst in FILES.items():
        url = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{repo_path}"
        print(f"  받는 중: {repo_path}")
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                if resp.status != 200:
                    print(f"  [!] {repo_path} 내려받기 실패 (HTTP {resp.status})")
                    return False
                data = resp.read()
        except urllib.error.URLError as exc:
            print(f"  [!] {repo_path} 내려받기 실패: {exc.reason}")
            return False
        except OSError as exc:
            print(f"  [!] {repo_path} 내려받기 실패: {exc}")
            return False
        # 줄바꿈은 그대로 둔다. Python 은 LF/CRLF 를 모두 읽는다.
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
    return True


def explain_offline() -> None:
    print(
        "\n도구를 받아오지 못했습니다. 둘 중 하나입니다.\n\n"
        "  1) 인터넷이 막혀 있다\n"
        "     - 회사 네트워크가 github.com 을 막는 경우가 있습니다.\n"
        "     - 다른 컴퓨터(집 등)에서 먼저 connect.py 를 실행해 두면,\n"
        "       도구가 Drive 로 동기화되어 여기서도 인터넷 없이 연결됩니다.\n\n"
        "  2) Drive 동기화가 아직 안 끝났다\n"
        "     - 트레이의 Drive 아이콘이 '최신 상태'가 될 때까지 기다린 뒤\n"
        "       다시 실행하세요.\n"
    )


def main() -> int:
    args = [a for a in sys.argv[1:]]
    update = "--update" in args
    passthrough = [a for a in args if a != "--update"]

    print("=" * 48)
    print("  ClaudeWorkspace - 이 컴퓨터를 연결합니다")
    print("=" * 48)
    print(f"\n워크스페이스: {HERE}\n")

    tool = BIN / "workspace.py"

    if update or not tool.is_file():
        if tool.is_file():
            print("도구를 최신 버전으로 갱신합니다.")
        else:
            print("도구가 없어 GitHub 에서 받아옵니다.")
        if not download_tools():
            if tool.is_file():
                print("\n  기존 도구로 계속 진행합니다.")
            else:
                explain_offline()
                return 1
    else:
        print("Drive 에 있는 도구를 사용합니다.")

    print()
    sys.path.insert(0, str(BIN))
    try:
        import workspace  # noqa: PLC0415
    except ImportError as exc:
        print(f"[!] 도구를 불러오지 못했습니다: {exc}")
        return 1

    return workspace.main(["bootstrap", *passthrough])


if __name__ == "__main__":
    sys.exit(main())
