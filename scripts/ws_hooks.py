"""ClaudeWorkspace 훅 설치기.

사용자가 자신의 컴퓨터에서 bootstrap 을 실행할 때, 그 컴퓨터의
Claude Code 설정(settings.json)에 자동 동기화 훅을 넣어 준다.

  SessionStart -> workspace.py pull   (작업 시작 시 Drive 의 최신 메모리를 받아옴)
  Stop         -> workspace.py push   (작업 종료 시 메모리를 Drive 에 백업)

이 파일은 workspace.py 에서 import 해서 쓴다. 단독 실행은 하지 않는다.
"""

from __future__ import annotations

import json
import platform
from pathlib import Path

HOOK_MARKER = "claude-workspace-sync"


def hook_command(workspace: Path, action: str) -> str:
    """훅에서 실행할 명령 문자열. 마커 주석으로 재설치 시 식별한다."""
    script = workspace / ".workspace" / "bin" / "workspace.py"
    py = "python" if platform.system() == "Windows" else "python3"
    return f'{py} "{script}" {action} --quiet --soft-fail  # {HOOK_MARKER}'


def _strip_our_hooks(entries: list) -> list:
    """이전에 우리가 넣은 훅만 제거하고 사용자의 다른 훅은 보존한다."""
    kept = []
    for entry in entries:
        if not isinstance(entry, dict):
            kept.append(entry)
            continue
        inner = entry.get("hooks")
        if not isinstance(inner, list):
            kept.append(entry)
            continue
        remaining = [h for h in inner if HOOK_MARKER not in str(h.get("command", ""))]
        if remaining:
            kept.append(dict(entry, hooks=remaining))
        elif not inner:
            kept.append(entry)
        # 우리 훅만 들어있던 항목은 통째로 버린다
    return kept


def install(settings_file: Path, workspace: Path) -> tuple[bool, str]:
    """settings.json 에 훅을 병합한다. (성공여부, 메시지) 를 돌려준다.

    기존 설정과 사용자가 직접 넣은 훅은 건드리지 않는다.
    같은 훅이 이미 있으면 교체하므로 여러 번 실행해도 안전하다.
    """
    data: dict = {}
    if settings_file.is_file():
        raw = settings_file.read_text(encoding="utf-8")
        if raw.strip():
            try:
                data = json.loads(raw)
            except ValueError as exc:
                return False, f"{settings_file} 가 올바른 JSON 이 아닙니다 ({exc}). 훅 설치를 건너뜁니다."
        # 덮어쓰기 전에 원본을 남겨 둔다
        backup = settings_file.with_name(settings_file.name + ".before-workspace")
        if not backup.exists():
            backup.write_text(raw, encoding="utf-8")

    if not isinstance(data, dict):
        return False, f"{settings_file} 의 최상위가 객체가 아닙니다. 훅 설치를 건너뜁니다."

    hooks = data.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        return False, "settings.json 의 hooks 항목이 객체가 아닙니다. 훅 설치를 건너뜁니다."

    for event, action in (("SessionStart", "pull"), ("Stop", "push")):
        entries = hooks.get(event)
        entries = entries if isinstance(entries, list) else []
        entries = _strip_our_hooks(entries)
        entries.append({
            "hooks": [{"type": "command", "command": hook_command(workspace, action)}]
        })
        hooks[event] = entries

    settings_file.parent.mkdir(parents=True, exist_ok=True)
    tmp = settings_file.with_name(settings_file.name + ".ws-tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(settings_file)
    return True, f"훅 설치됨: SessionStart=pull, Stop=push ({settings_file})"


def uninstall(settings_file: Path) -> tuple[bool, str]:
    """우리가 넣은 훅만 제거한다."""
    if not settings_file.is_file():
        return True, "settings.json 이 없습니다. 제거할 훅이 없습니다."
    try:
        data = json.loads(settings_file.read_text(encoding="utf-8") or "{}")
    except ValueError as exc:
        return False, f"{settings_file} 파싱 실패: {exc}"

    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        return True, "설치된 훅이 없습니다."

    for event in ("SessionStart", "Stop"):
        entries = hooks.get(event)
        if isinstance(entries, list):
            cleaned = _strip_our_hooks(entries)
            if cleaned:
                hooks[event] = cleaned
            else:
                hooks.pop(event, None)

    settings_file.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return True, "ClaudeWorkspace 훅을 제거했습니다."
