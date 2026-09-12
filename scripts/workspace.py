#!/usr/bin/env python3
"""ClaudeWorkspace - Google Drive 기반 다중 컴퓨터 작업/메모리 동기화.

집, 회사, 노트북 어디서 열어도 같은 작업 폴더와 같은 Claude 메모리를 쓰기 위한 도구.
Windows / macOS / Linux 공용. Python 3.8+ 외 의존성 없음.

사용법:
    python3 workspace.py bootstrap    # 이 컴퓨터를 워크스페이스에 연결
    python3 workspace.py sync         # 메모리 pull 후 push
    python3 workspace.py status       # 현재 상태 확인
    python3 workspace.py doctor       # 문제 진단
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE_NAME = "ClaudeWorkspace"
POINTER_FILE = Path.home() / ".claude-workspace.json"
CLAUDE_HOME = Path(os.environ.get("CLAUDE_CONFIG_DIR") or (Path.home() / ".claude"))
HOOK_MARKER = "claude-workspace-sync"
CACHE_ROOT = Path.home() / ".claude-ws-cache"

# ---------------------------------------------------------------------------
# 동기화 대상 정의
# ---------------------------------------------------------------------------

# 모든 컴퓨터가 동일하게 공유하는 메모리. pull 시 로컬로 복원된다.
SHARED_ITEMS = [
    ("CLAUDE.md", "file"),        # 전역 메모리 (가장 중요)
    ("settings.json", "file"),    # 공유 설정
    ("commands", "dir"),          # 커스텀 슬래시 커맨드
    ("agents", "dir"),            # 서브에이전트 정의
    ("skills", "dir"),            # 스킬
    ("plugins/config.json", "file"),
]

# 컴퓨터별로 따로 보관하는 기록. 백업만 하고 다른 컴퓨터로 복원하지 않는다.
MACHINE_ITEMS = [
    ("projects", "dir"),          # 세션 기록 (대화 히스토리)
    ("todos", "dir"),
    ("history.jsonl", "file"),
]

# 절대 Drive에 올리지 않는 것. 자격증명 유출 방지.
NEVER_SYNC = {
    ".credentials.json",
    "credentials.json",
    ".env",
    "statsig",
    "shell-snapshots",
}

SECRET_KEY_RE = re.compile(
    r"(token|secret|credential|password|passwd|api[_-]?key|authorization|oauth|refresh|access[_-]?key)",
    re.IGNORECASE,
)

# Drive에 두면 안 되는 무거운/충돌나는 디렉터리
HEAVY_DIRS = [
    "node_modules", ".venv", "venv", "__pycache__", ".next", ".nuxt",
    "target", "build", "dist", ".gradle", ".tox", ".pytest_cache",
    ".mypy_cache", ".turbo", ".parcel-cache", "vendor/bundle",
]


def log(msg: str, quiet: bool = False) -> None:
    if not quiet:
        print(msg, flush=True)


def warn(msg: str) -> None:
    print(f"  ! {msg}", file=sys.stderr, flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sanitize(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "-", name).strip("-._")


def machine_id() -> str:
    """이 컴퓨터를 식별하는 안정적인 이름.

    한글 PC 이름을 그대로 치환하면 모든 글자가 '-' 가 되어 컴퓨터끼리
    구별되지 않는다(예: '데스크탑' -> '----'). 그러면 두 대가 같은 상태
    파일을 덮어써 동기화 기록이 뭉개진다. ASCII 로 온전히 표현되지 않는
    이름에는 원래 이름의 해시를 붙여 반드시 서로 달라지게 한다.
    """
    raw = (os.environ.get("CLAUDE_WORKSPACE_MACHINE")
           or socket.gethostname().split(".")[0]
           or "unknown")
    safe = _sanitize(raw)
    if safe != raw:
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8]
        safe = f"{safe}-{digest}" if safe else f"pc-{digest}"
    return safe[:60]


def legacy_machine_id() -> str:
    """예전 방식으로 만들던 이름. 상태 파일을 옮겨오기 위해서만 쓴다."""
    raw = (os.environ.get("CLAUDE_WORKSPACE_MACHINE")
           or socket.gethostname().split(".")[0]
           or "unknown")
    return re.sub(r"[^A-Za-z0-9._-]", "_", raw)


# ---------------------------------------------------------------------------
# Google Drive 루트 탐지
# ---------------------------------------------------------------------------

# Google Drive Desktop 이 만드는 "내 드라이브" 폴더의 언어별 이름
MY_DRIVE_NAMES = ["My Drive", "내 드라이브", "マイドライブ", "Mi unidad", "Mon Drive"]


def _candidate_drive_roots() -> list[Path]:
    """OS 별로 Google Drive 마운트 위치 후보를 만든다."""
    home = Path.home()
    system = platform.system()
    out: list[Path] = []

    if system == "Windows":
        # Drive Desktop 은 보통 가상 드라이브 문자(기본 G:)로 마운트된다.
        for letter in "GHIJKLMNOPQRSTUVWXYZDEF":
            out.append(Path(f"{letter}:\\"))
        out.append(home)
        out.append(home / "Google Drive")
    elif system == "Darwin":
        cloud = home / "Library" / "CloudStorage"
        if cloud.is_dir():
            try:
                for entry in sorted(cloud.iterdir()):
                    if entry.name.startswith("GoogleDrive-"):
                        out.append(entry)
            except OSError:
                pass
        out.append(home / "Google Drive")
    else:
        # Linux 에는 공식 클라이언트가 없다. rclone / insync 마운트를 찾는다.
        for name in ("GoogleDrive", "google-drive", "gdrive", "Google Drive", "Insync"):
            out.append(home / name)
        out.append(Path("/mnt") / "gdrive")
        out.append(Path("/media") / os.environ.get("USER", "") / "GoogleDrive")

    return out


def find_drive_root() -> Path | None:
    """'내 드라이브'에 해당하는 디렉터리를 찾는다. 없으면 None."""
    override = os.environ.get("CLAUDE_DRIVE_ROOT")
    if override:
        p = Path(override).expanduser()
        return p if p.is_dir() else None

    for base in _candidate_drive_roots():
        try:
            if not base.is_dir():
                continue
        except OSError:
            continue
        # base 자체가 이미 내 드라이브인 경우
        if base.name in MY_DRIVE_NAMES:
            return base
        for name in MY_DRIVE_NAMES:
            cand = base / name
            try:
                if cand.is_dir():
                    return cand
            except OSError:
                continue
    return None


def find_workspace(explicit: str | None = None) -> Path | None:
    """워크스페이스 루트를 찾는다: 인자 > 환경변수 > 포인터 파일 > Drive 탐지."""
    if explicit:
        p = Path(explicit).expanduser()
        return p if p.is_dir() else None

    env = os.environ.get("CLAUDE_WORKSPACE")
    if env:
        p = Path(env).expanduser()
        if p.is_dir():
            return p

    if POINTER_FILE.is_file():
        try:
            data = json.loads(POINTER_FILE.read_text(encoding="utf-8"))
            p = Path(data["workspace"]).expanduser()
            if p.is_dir():
                return p
        except (OSError, ValueError, KeyError):
            pass

    drive = find_drive_root()
    if drive:
        ws = drive / WORKSPACE_NAME
        if ws.is_dir():
            return ws
    return None


def require_workspace(args) -> Path:
    ws = find_workspace(getattr(args, "workspace", None))
    if ws is None:
        # 훅에서 돌 때는 조용히 물러난다. Drive 가 없는 컴퓨터에서
        # 세션을 열 때마다 오류를 띄우면 방해만 된다.
        if getattr(args, "soft_fail", False):
            sys.exit(0)
        print(
            "워크스페이스를 찾지 못했습니다.\n"
            "  - Google Drive for Desktop 이 실행 중인지 확인하세요.\n"
            "  - 처음이라면: python3 workspace.py bootstrap\n"
            "  - 경로를 직접 지정하려면: CLAUDE_DRIVE_ROOT 환경변수를 설정하세요.",
            file=sys.stderr,
        )
        sys.exit(2)
    return ws


# ---------------------------------------------------------------------------
# 해시 / 상태 저장
# ---------------------------------------------------------------------------

def file_hash(path: Path) -> str | None:
    try:
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except (OSError, ValueError):
        return None


def state_path(ws: Path) -> Path:
    return ws / ".workspace" / "state" / f"{machine_id()}.json"


def load_state(ws: Path) -> dict:
    p = state_path(ws)
    if not p.is_file():
        # 예전 이름(한글이 뭉개진 형태)으로 남은 기록이 있으면 이어받는다.
        legacy = ws / ".workspace" / "state" / f"{legacy_machine_id()}.json"
        if legacy.is_file() and legacy != p:
            try:
                p.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(legacy, p)
                warn(f"이전 기록을 새 이름으로 옮겼습니다: {legacy.name} -> {p.name}")
            except OSError:
                pass
    if p.is_file():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            warn(f"상태 파일을 읽지 못해 새로 만듭니다: {p}")
    return {"baseline": {}, "last_push": None, "last_pull": None}


def save_state(ws: Path, state: dict) -> None:
    p = state_path(ws)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


def is_excluded(rel: str) -> bool:
    parts = Path(rel).parts
    for part in parts:
        if part in NEVER_SYNC:
            return True
        if part.endswith(".lock") or part.endswith(".tmp"):
            return True
    return False


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".ws-tmp")
    shutil.copy2(src, tmp)
    tmp.replace(dst)


def save_conflict(ws: Path, rel: str, src: Path, side: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = ws / "memory" / ".conflicts" / machine_id() / f"{stamp}-{side}" / rel
    copy_file(src, dst)
    return dst


def enumerate_files(root: Path, rel_prefix: str) -> set[str]:
    """root 아래 모든 파일을 rel_prefix 기준 상대경로로 모은다."""
    out: set[str] = set()
    if not root.is_dir():
        return out
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in NEVER_SYNC and d != ".conflicts"]
        for fn in filenames:
            full = Path(dirpath) / fn
            try:
                rel = full.relative_to(root).as_posix()
            except ValueError:
                continue
            combined = f"{rel_prefix}/{rel}" if rel_prefix else rel
            if not is_excluded(combined):
                out.add(combined)
    return out


# ---------------------------------------------------------------------------
# 동기화 엔진
# ---------------------------------------------------------------------------

def collect_rels(local_root: Path, remote_root: Path, items) -> list[str]:
    """동기화 대상 상대경로 목록. 파일 항목은 그대로, 디렉터리는 펼친다."""
    rels: set[str] = set()
    for rel, kind in items:
        if kind == "file":
            if is_excluded(rel):
                continue
            if (local_root / rel).is_file() or (remote_root / rel).is_file():
                rels.add(rel)
        else:
            rels |= enumerate_files(local_root / rel, rel)
            rels |= enumerate_files(remote_root / rel, rel)
    return sorted(rels)


def sync_items(
    ws: Path,
    local_root: Path,
    remote_root: Path,
    items,
    direction: str,
    baseline: dict,
    force: bool,
    quiet: bool,
) -> dict:
    """direction: 'push' (로컬->Drive) 또는 'pull' (Drive->로컬)."""
    stats = {"copied": 0, "same": 0, "conflict": 0, "skipped": 0}

    for rel in collect_rels(local_root, remote_root, items):
        lpath = local_root / rel
        rpath = remote_root / rel
        lh = file_hash(lpath)
        rh = file_hash(rpath)
        base = baseline.get(rel)

        if lh is not None and lh == rh:
            baseline[rel] = lh
            stats["same"] += 1
            continue

        if direction == "push":
            src, dst, src_h, dst_h = lpath, rpath, lh, rh
        else:
            src, dst, src_h, dst_h = rpath, lpath, rh, lh

        if src_h is None:
            # 보낼 쪽에 파일이 없다. 삭제 전파는 하지 않는다(안전).
            stats["skipped"] += 1
            continue

        # 받는 쪽이 비어 있거나, 마지막 동기화 이후 그대로면 그냥 덮어쓴다.
        if dst_h is None or dst_h == base or force:
            if dst_h is not None and dst_h != base and force:
                save_conflict(ws, rel, dst, "overwritten")
            copy_file(src, dst)
            baseline[rel] = src_h
            stats["copied"] += 1
            log(f"  {'→' if direction == 'push' else '←'} {rel}", quiet)
        else:
            # 양쪽 다 바뀌었다. 어느 쪽도 덮지 않고 충돌본을 남긴다.
            saved = save_conflict(ws, rel, dst, f"{direction}-blocked")
            stats["conflict"] += 1
            warn(f"충돌: {rel}")
            warn(f"       마지막 동기화 이후 이 컴퓨터와 다른 컴퓨터가 같은 파일을 고쳤습니다.")
            warn(f"       덮어쓰지 않았습니다. 상대편 사본: {saved}")

    return stats


def do_push(ws: Path, force: bool, quiet: bool, shared_only: bool = False) -> dict:
    state = load_state(ws)
    baseline = state.setdefault("baseline", {})
    total = {"copied": 0, "same": 0, "conflict": 0, "skipped": 0}

    log("공유 메모리 → Drive", quiet)
    s = sync_items(ws, CLAUDE_HOME, ws / "memory" / "shared", SHARED_ITEMS,
                   "push", baseline, force, quiet)
    for k in total:
        total[k] += s[k]

    if not shared_only:
        log("이 컴퓨터 기록 → Drive", quiet)
        mroot = ws / "memory" / "machines" / machine_id()
        mbase = state.setdefault("machine_baseline", {})
        s = sync_items(ws, CLAUDE_HOME, mroot, MACHINE_ITEMS,
                       "push", mbase, True, quiet)  # 기기별 기록은 항상 최신으로 덮어씀
        for k in total:
            total[k] += s[k]
        backup_reference(ws, quiet)

    state["last_push"] = now_iso()
    save_state(ws, state)
    return total


def do_pull(ws: Path, force: bool, quiet: bool) -> dict:
    state = load_state(ws)
    baseline = state.setdefault("baseline", {})
    log("Drive → 공유 메모리", quiet)
    total = sync_items(ws, CLAUDE_HOME, ws / "memory" / "shared", SHARED_ITEMS,
                       "pull", baseline, force, quiet)
    state["last_pull"] = now_iso()
    save_state(ws, state)
    return total


# ---------------------------------------------------------------------------
# ~/.claude.json 참고용 백업 (비밀값은 지우고 저장, 자동 복원하지 않음)
# ---------------------------------------------------------------------------

def redact(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if SECRET_KEY_RE.search(str(k)):
                out[k] = "<redacted>"
            else:
                out[k] = redact(v)
        return out
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    if isinstance(obj, str) and len(obj) > 40 and re.fullmatch(r"[A-Za-z0-9._\-]+", obj):
        return "<redacted:long-token-like>"
    return obj


def backup_reference(ws: Path, quiet: bool) -> None:
    """MCP 서버 목록 등 참고용. 비밀값을 제거한 사본만 Drive에 둔다."""
    src = Path.home() / ".claude.json"
    if not src.is_file():
        return
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        warn("~/.claude.json 을 읽지 못해 참고 백업을 건너뜁니다.")
        return
    slim = {k: redact(v) for k, v in data.items() if k in ("mcpServers", "projects")}
    if "projects" in slim and isinstance(slim["projects"], dict):
        # 프로젝트별 대화 기록 전체가 아니라 경로 목록만 남긴다.
        slim["projects"] = sorted(slim["projects"].keys())
    dst = ws / "memory" / "machines" / machine_id() / "claude.json.reference.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(slim, indent=2, ensure_ascii=False), encoding="utf-8")
    log("  → claude.json.reference.json (비밀값 제거됨)", quiet)


# ---------------------------------------------------------------------------
# bootstrap: 이 컴퓨터를 워크스페이스에 연결
# ---------------------------------------------------------------------------

TREE = [
    ".workspace/bin",
    ".workspace/state",
    "memory/shared",
    "memory/machines",
    "memory/.conflicts",
    "projects",
    "outputs",
]

README_TEXT = """# ClaudeWorkspace

집 / 회사 / 노트북 어디서 열어도 같은 작업물과 같은 Claude 메모리를 쓰기 위한 폴더입니다.

    projects/   실제 작업 폴더. 여기서 작업하세요.
    outputs/    완성된 산출물.
    memory/     Claude 메모리 백업. 직접 건드리지 마세요.
    .workspace/ 도구와 상태 파일. 직접 건드리지 마세요.

## 지켜야 할 규칙

1. 한 번에 한 컴퓨터에서만 작업하세요.
2. 작업을 마치면 Google Drive 동기화가 끝난 것을 확인한 뒤 다른 컴퓨터를 켜세요.
   (트레이 아이콘이 "최신 상태"가 될 때까지 기다리기)
3. node_modules 같은 무거운 폴더는 Drive 에 올리지 마세요.
   `python3 .workspace/bin/workspace.py detach <프로젝트경로>` 로 바깥으로 빼낼 수 있습니다.

## 새 컴퓨터 추가하기

    python3 .workspace/bin/workspace.py bootstrap
"""


def _import_hooks():
    try:
        import ws_hooks  # noqa: PLC0415
        return ws_hooks
    except ImportError:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        try:
            import ws_hooks  # noqa: PLC0415
            return ws_hooks
        except ImportError:
            return None


def seed_templates(ws: Path, here: Path, quiet: bool, reseed: bool = False) -> None:
    """저장소의 memory/ 템플릿(블로그 규칙 등)을 공유 메모리에 넣는다.

    이미 있는 파일은 덮어쓰지 않는다. --reseed 를 주면 저장소 버전으로 되돌린다.
    Drive 안의 도구 사본(.workspace/bin)에서 실행할 때는 템플릿이 없으므로 조용히 넘어간다.
    """
    src_dir = here.parent / "memory"
    if not src_dir.is_dir():
        return
    dst_dir = ws / "memory" / "shared"
    for src in sorted(src_dir.rglob("*")):
        if not src.is_file():
            continue
        rel = src.relative_to(src_dir)
        dst = dst_dir / rel
        if dst.exists() and not reseed:
            continue
        if dst.exists() and reseed and file_hash(dst) != file_hash(src):
            save_conflict(ws, rel.as_posix(), dst, "reseed-replaced")
        copy_file(src, dst)
        log(f"  기준 메모리 심음: {rel.as_posix()}", quiet)


def cmd_bootstrap(args) -> int:
    drive = find_drive_root()
    if drive is None and not args.workspace:
        print(
            "Google Drive 폴더를 찾지 못했습니다.\n\n"
            "  1) Google Drive for Desktop 을 설치하고 로그인하세요.\n"
            "     https://www.google.com/drive/download/\n"
            "  2) 탐색기(파인더)에서 '내 드라이브' 가 보이는지 확인하세요.\n"
            "  3) 그래도 안 되면 경로를 직접 알려주세요:\n"
            "       CLAUDE_DRIVE_ROOT=\"<내 드라이브 경로>\" python3 workspace.py bootstrap",
            file=sys.stderr,
        )
        return 2

    ws = Path(args.workspace).expanduser() if args.workspace else drive / WORKSPACE_NAME
    log(f"워크스페이스: {ws}", args.quiet)

    for sub in TREE:
        (ws / sub).mkdir(parents=True, exist_ok=True)

    readme = ws / "README.md"
    if not readme.exists():
        readme.write_text(README_TEXT, encoding="utf-8")

    # 도구 자체를 Drive 안에 복사해 둔다. 다른 컴퓨터는 이 사본으로 bootstrap 한다.
    here = Path(__file__).resolve().parent
    bin_dir = ws / ".workspace" / "bin"
    for name in ("workspace.py", "ws_hooks.py"):
        src = here / name
        if src.is_file() and src.resolve() != (bin_dir / name).resolve():
            copy_file(src, bin_dir / name)
    log(f"  도구 복사됨: {bin_dir}", args.quiet)

    seed_templates(ws, here, args.quiet, reseed=args.reseed)

    config = ws / ".workspace" / "config.json"
    data = {}
    if config.is_file():
        try:
            data = json.loads(config.read_text(encoding="utf-8"))
        except ValueError:
            data = {}
    machines = data.setdefault("machines", {})
    machines[machine_id()] = {
        "os": f"{platform.system()} {platform.release()}",
        "drive_root": str(drive) if drive else None,
        "claude_home": str(CLAUDE_HOME),
        "registered": machines.get(machine_id(), {}).get("registered", now_iso()),
        "last_bootstrap": now_iso(),
    }
    data["workspace_name"] = WORKSPACE_NAME
    config.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    POINTER_FILE.write_text(
        json.dumps({"workspace": str(ws), "updated": now_iso()}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log(f"  포인터 기록됨: {POINTER_FILE}", args.quiet)

    if args.no_hooks:
        log("  훅 설치 건너뜀 (--no-hooks)", args.quiet)
    else:
        hooks_mod = _import_hooks()
        if hooks_mod is None:
            warn("ws_hooks.py 를 찾지 못해 훅을 설치하지 못했습니다.")
        else:
            ok, msg = hooks_mod.install(CLAUDE_HOME / "settings.json", ws)
            log(f"  {msg}", args.quiet) if ok else warn(msg)

    log("\n첫 동기화를 시작합니다.", args.quiet)
    do_pull(ws, force=False, quiet=args.quiet)
    do_push(ws, force=False, quiet=args.quiet)

    log(f"\n완료. 이제 작업은 {ws / 'projects'} 아래에서 하세요.", args.quiet)
    return 0


# ---------------------------------------------------------------------------
# detach / attach: 무거운 폴더를 Drive 바깥으로 빼내기
# ---------------------------------------------------------------------------

def _project_key(path: Path) -> str:
    return hashlib.sha256(str(path.resolve()).encode("utf-8")).hexdigest()[:12]


def _make_link(link: Path, target: Path) -> bool:
    """link -> target 링크를 만든다. Windows 는 관리자 권한 없이 되는 junction 사용."""
    if platform.system() == "Windows":
        try:
            subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(link), str(target)],
                check=True, capture_output=True,
            )
            return True
        except (subprocess.CalledProcessError, OSError) as exc:
            warn(f"junction 생성 실패 ({link}): {exc}")
            return False
    try:
        os.symlink(target, link, target_is_directory=True)
        return True
    except OSError as exc:
        warn(f"symlink 생성 실패 ({link}): {exc}")
        return False


def _is_link(path: Path) -> bool:
    if path.is_symlink():
        return True
    if platform.system() == "Windows":
        try:
            return bool(os.readlink(str(path)))
        except OSError:
            return False
    return False


# 설치된 응용프로그램임을 알려주는 표시들. 이런 폴더의 node_modules 는
# 소스가 아니라 프로그램의 일부라서 건드리면 프로그램이 깨진다.
APP_MARKERS = ["app.asar", "app-update.yml", "resources/app.asar", "*.exe", "*.app"]


def looks_like_installed_app(root: Path) -> list[str]:
    """설치된 프로그램 폴더로 보이는 근거를 모은다. 비어 있으면 소스 프로젝트."""
    found = []
    for pattern in APP_MARKERS:
        try:
            for hit in list(root.glob(pattern))[:2]:
                found.append(hit.name)
        except OSError:
            continue
    return found


def cmd_detach(args) -> int:
    root = Path(args.path).expanduser().resolve()
    if not root.is_dir():
        print(f"디렉터리가 아닙니다: {root}", file=sys.stderr)
        return 2

    markers = looks_like_installed_app(root)
    if markers and not args.force:
        print(
            f"여기는 설치된 프로그램 폴더로 보입니다: {root}\n"
            f"  근거: {', '.join(sorted(set(markers)))}\n\n"
            "이런 폴더의 node_modules 는 소스가 아니라 프로그램의 일부입니다.\n"
            "네이티브 모듈(.node)이 들어 있으면 npm install 로 되살릴 수 없고,\n"
            "잘못 건드리면 프로그램이 실행되지 않습니다.\n\n"
            "게다가 용량의 대부분은 node_modules 가 아니라 app.asar 과 .exe 입니다.\n"
            "detach 를 해도 문제는 거의 해결되지 않습니다.\n\n"
            "이런 경우의 올바른 해결책은 프로그램을 Drive 동기화 대상 폴더\n"
            "(바탕 화면 등) 바깥으로 옮기는 것입니다. docs/SETUP.md 를 보세요.\n\n"
            "그래도 진행하려면 --force 를 붙이세요.",
            file=sys.stderr,
        )
        return 2

    key = _project_key(root)
    moved = 0
    for dirpath, dirnames, _ in os.walk(root):
        for name in list(dirnames):
            if name not in HEAVY_DIRS:
                continue
            src = Path(dirpath) / name
            if _is_link(src):
                dirnames.remove(name)
                continue
            rel = src.relative_to(root)
            dst = CACHE_ROOT / key / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst.exists():
                shutil.rmtree(dst, ignore_errors=True)
            try:
                shutil.move(str(src), str(dst))
            except OSError as exc:
                warn(f"이동 실패 {src}: {exc}")
                continue
            if _make_link(src, dst):
                log(f"  분리됨: {rel}  →  {dst}", args.quiet)
                moved += 1
            else:
                shutil.move(str(dst), str(src))  # 실패하면 되돌린다
            dirnames.remove(name)

    if moved == 0:
        log("분리할 무거운 폴더가 없습니다.", args.quiet)
    else:
        log(f"\n{moved}개 폴더를 Drive 바깥({CACHE_ROOT})으로 옮겼습니다.", args.quiet)
        log("이 폴더들은 컴퓨터마다 따로 만들어야 합니다 (예: npm install).", args.quiet)
    return 0


def cmd_attach(args) -> int:
    """detach 를 되돌린다. 링크를 실제 폴더로 복구."""
    root = Path(args.path).expanduser().resolve()
    restored = 0
    for dirpath, dirnames, _ in os.walk(root):
        for name in list(dirnames):
            if name not in HEAVY_DIRS:
                continue
            link = Path(dirpath) / name
            if not _is_link(link):
                continue
            try:
                target = Path(os.readlink(str(link)))
            except OSError:
                continue
            link.unlink() if link.is_symlink() else os.rmdir(str(link))
            if target.is_dir():
                shutil.move(str(target), str(link))
                restored += 1
                log(f"  복구됨: {link.relative_to(root)}", args.quiet)
            dirnames.remove(name)
    log(f"{restored}개 폴더를 되돌렸습니다.", args.quiet)
    return 0


# ---------------------------------------------------------------------------
# status / doctor
# ---------------------------------------------------------------------------

def cmd_status(args) -> int:
    ws = require_workspace(args)
    state = load_state(ws)
    print(f"워크스페이스 : {ws}")
    print(f"이 컴퓨터    : {machine_id()}  ({platform.system()} {platform.release()})")
    print(f"Claude 홈    : {CLAUDE_HOME}")
    print(f"마지막 pull  : {state.get('last_pull') or '없음'}")
    print(f"마지막 push  : {state.get('last_push') or '없음'}")

    config = ws / ".workspace" / "config.json"
    if config.is_file():
        try:
            machines = json.loads(config.read_text(encoding="utf-8")).get("machines", {})
            print(f"\n등록된 컴퓨터 ({len(machines)}대):")
            for name, info in sorted(machines.items()):
                mark = " ← 지금 이 컴퓨터" if name == machine_id() else ""
                print(f"  - {name:<20} {info.get('os', '?')}{mark}")
        except ValueError:
            warn("config.json 파싱 실패")

    # 다른 컴퓨터가 더 최근에 작업했는지 알려준다
    others = []
    state_dir = ws / ".workspace" / "state"
    if state_dir.is_dir():
        mine = {machine_id(), legacy_machine_id()}
        for f in state_dir.glob("*.json"):
            if f.stem in mine:
                continue  # 예전 이름으로 남은 내 기록은 다른 컴퓨터가 아니다
            try:
                other = json.loads(f.read_text(encoding="utf-8"))
                if other.get("last_push"):
                    others.append((f.stem, other["last_push"]))
            except (OSError, ValueError):
                continue
    if others:
        others.sort(key=lambda x: x[1], reverse=True)
        latest_name, latest_time = others[0]
        print(f"\n가장 최근 다른 컴퓨터 작업: {latest_name} @ {latest_time}")
        mine = state.get("last_pull") or ""
        if latest_time > mine:
            print("  ⚠ 아직 받아오지 않은 변경이 있습니다.  →  workspace.py pull")

    conflicts = list((ws / "memory" / ".conflicts").rglob("*")) if (ws / "memory" / ".conflicts").is_dir() else []
    conflict_files = [c for c in conflicts if c.is_file()]
    if conflict_files:
        print(f"\n⚠ 충돌 사본 {len(conflict_files)}개: {ws / 'memory' / '.conflicts'}")
    return 0


def cmd_doctor(args) -> int:
    problems = 0

    def check(ok: bool, good: str, bad: str) -> None:
        nonlocal problems
        print(f"  [{'OK' if ok else '!!'}] {good if ok else bad}")
        if not ok:
            problems += 1

    print("ClaudeWorkspace 진단\n")
    print(f"Python {platform.python_version()} / {platform.system()} {platform.release()}\n")

    drive = find_drive_root()
    check(drive is not None,
          f"Google Drive 발견: {drive}",
          "Google Drive 를 찾지 못했습니다. Drive for Desktop 이 실행 중인가요?")

    ws = find_workspace(getattr(args, "workspace", None))
    check(ws is not None, f"워크스페이스: {ws}", "워크스페이스 없음. bootstrap 을 실행하세요.")
    if ws is None:
        print(f"\n문제 {problems}건.")
        return 1

    for sub in ("memory/shared", "projects", ".workspace/bin"):
        check((ws / sub).is_dir(), f"{sub} 존재", f"{sub} 없음 — bootstrap 을 다시 실행하세요.")

    # 쓰기 가능 여부
    try:
        probe = ws / ".workspace" / ".write-probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        check(True, "워크스페이스 쓰기 가능", "")
    except OSError as exc:
        check(False, "", f"워크스페이스에 쓸 수 없습니다: {exc}")

    # 자격증명이 Drive 로 새어나갔는지
    leaked = [p for p in (ws / "memory").rglob("*") if p.is_file() and p.name in NEVER_SYNC]
    check(not leaked,
          "자격증명 파일이 Drive 에 없습니다",
          f"자격증명으로 보이는 파일이 Drive 에 있습니다: {leaked}. 즉시 삭제하세요.")

    # 훅 설치 여부
    settings = CLAUDE_HOME / "settings.json"
    hooked = settings.is_file() and HOOK_MARKER in settings.read_text(encoding="utf-8", errors="ignore")
    check(hooked, "자동 동기화 훅 설치됨",
          "훅이 없습니다 — 자동 백업이 동작하지 않습니다. bootstrap 을 실행하세요.")

    # 무거운 폴더가 Drive 안에 있는지
    heavy_found = []
    projects = ws / "projects"
    if projects.is_dir():
        for dirpath, dirnames, _ in os.walk(projects):
            for name in list(dirnames):
                if name in HEAVY_DIRS and not _is_link(Path(dirpath) / name):
                    heavy_found.append(str(Path(dirpath) / name))
                    dirnames.remove(name)
            if len(heavy_found) > 10:
                break
    check(not heavy_found,
          "무거운 폴더가 Drive 에 노출되어 있지 않습니다",
          f"동기화 충돌을 일으킬 폴더 {len(heavy_found)}개 발견. "
          f"workspace.py detach <경로> 를 실행하세요. 예: {heavy_found[:2]}")

    print(f"\n문제 {problems}건." if problems else "\n이상 없습니다.")
    return 1 if problems else 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

CONFLICT_HELP = (
    "\n충돌을 풀려면 어느 쪽을 남길지 고르세요:\n"
    "  workspace.py resolve --keep-local   이 컴퓨터 내용을 Drive 에 반영\n"
    "  workspace.py resolve --keep-drive   Drive 내용을 이 컴퓨터에 반영\n"
    "밀려난 내용은 memory/.conflicts 아래에 사본으로 남습니다."
)


def cmd_push(args) -> int:
    ws = require_workspace(args)
    s = do_push(ws, args.force, args.quiet)
    log(f"복사 {s['copied']} / 동일 {s['same']} / 충돌 {s['conflict']}", args.quiet)
    if s["conflict"]:
        log(CONFLICT_HELP, args.quiet)
    return 1 if s["conflict"] else 0


def cmd_resolve(args) -> int:
    """충돌로 막힌 상태를 푼다. 어느 쪽을 남길지 명시해야 한다."""
    ws = require_workspace(args)
    if args.keep_local:
        log("이 컴퓨터 내용을 Drive 에 반영합니다.", args.quiet)
        s = do_push(ws, force=True, quiet=args.quiet, shared_only=True)
    else:
        log("Drive 내용을 이 컴퓨터에 반영합니다.", args.quiet)
        s = do_pull(ws, force=True, quiet=args.quiet)
    log(f"정리 완료 — 반영 {s['copied']}건. 밀려난 사본은 memory/.conflicts 에 있습니다.",
        args.quiet)
    return 0


def cmd_pull(args) -> int:
    ws = require_workspace(args)
    s = do_pull(ws, args.force, args.quiet)
    log(f"복사 {s['copied']} / 동일 {s['same']} / 충돌 {s['conflict']}", args.quiet)
    if s["conflict"]:
        log(CONFLICT_HELP, args.quiet)
    return 1 if s["conflict"] else 0


def cmd_sync(args) -> int:
    ws = require_workspace(args)
    a = do_pull(ws, args.force, args.quiet)
    b = do_push(ws, args.force, args.quiet)
    conflicts = a["conflict"] + b["conflict"]
    log(f"복사 {a['copied'] + b['copied']} / 충돌 {conflicts}", args.quiet)
    if conflicts:
        log(CONFLICT_HELP, args.quiet)
    return 1 if conflicts else 0


def cmd_uninstall_hooks(args) -> int:
    hooks_mod = _import_hooks()
    if hooks_mod is None:
        warn("ws_hooks.py 를 찾지 못했습니다.")
        return 1
    ok, msg = hooks_mod.uninstall(CLAUDE_HOME / "settings.json")
    log(msg, args.quiet) if ok else warn(msg)
    return 0 if ok else 1


def build_parser() -> argparse.ArgumentParser:
    # 공통 플래그는 서브커맨드 앞뒤 어디에 써도 동작해야 한다.
    # SUPPRESS 를 쓰면 지정하지 않은 쪽이 지정한 쪽 값을 덮어쓰지 않는다.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--workspace", default=argparse.SUPPRESS,
                        help="워크스페이스 경로를 직접 지정")
    common.add_argument("--quiet", action="store_true", default=argparse.SUPPRESS,
                        help="출력 최소화")
    common.add_argument("--soft-fail", action="store_true", default=argparse.SUPPRESS,
                        help="실패해도 종료코드 0 (훅에서 사용)")

    p = argparse.ArgumentParser(
        prog="workspace.py",
        parents=[common],
        description="ClaudeWorkspace — Google Drive 기반 다중 컴퓨터 작업/메모리 동기화",
    )
    sub = p.add_subparsers(dest="command", required=True)

    b = sub.add_parser("bootstrap", parents=[common], help="이 컴퓨터를 워크스페이스에 연결")
    b.add_argument("--no-hooks", action="store_true", help="자동 동기화 훅을 설치하지 않음")
    b.add_argument("--reseed", action="store_true",
                   help="저장소의 기준 메모리(memory/)로 공유 메모리를 되돌림")
    b.set_defaults(func=cmd_bootstrap)

    for name, fn, helptext in (
        ("push", cmd_push, "로컬 메모리를 Drive 로 백업"),
        ("pull", cmd_pull, "Drive 의 공유 메모리를 로컬로 받아오기"),
        ("sync", cmd_sync, "pull 후 push"),
    ):
        s = sub.add_parser(name, parents=[common], help=helptext)
        s.add_argument("--force", action="store_true",
                       help="충돌 시 덮어쓰기(덮인 내용은 사본으로 남김)")
        s.set_defaults(func=fn)

    r = sub.add_parser("resolve", parents=[common], help="충돌로 막힌 상태 풀기")
    side = r.add_mutually_exclusive_group(required=True)
    side.add_argument("--keep-local", action="store_true",
                      help="이 컴퓨터 내용을 Drive 에 반영")
    side.add_argument("--keep-drive", action="store_true",
                      help="Drive 내용을 이 컴퓨터에 반영")
    r.set_defaults(func=cmd_resolve)

    sub.add_parser("status", parents=[common],
                   help="현재 상태 확인").set_defaults(func=cmd_status)
    sub.add_parser("doctor", parents=[common],
                   help="설정 문제 진단").set_defaults(func=cmd_doctor)
    sub.add_parser("uninstall-hooks", parents=[common],
                   help="자동 동기화 훅 제거").set_defaults(func=cmd_uninstall_hooks)

    d = sub.add_parser("detach", parents=[common],
                       help="node_modules 등 무거운 폴더를 Drive 바깥으로")
    d.add_argument("path", help="프로젝트 경로")
    d.add_argument("--force", action="store_true",
                   help="설치된 프로그램 폴더여도 강행 (프로그램이 깨질 수 있음)")
    d.set_defaults(func=cmd_detach)

    a = sub.add_parser("attach", parents=[common], help="detach 를 되돌리기")
    a.add_argument("path", help="프로젝트 경로")
    a.set_defaults(func=cmd_attach)

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    # SUPPRESS 로 빠져 있을 수 있는 값들을 채운다.
    for name, default in (("workspace", None), ("quiet", False),
                          ("soft_fail", False), ("force", False)):
        if not hasattr(args, name):
            setattr(args, name, default)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        return 130
    except SystemExit:
        if args.soft_fail:
            return 0
        raise
    except Exception as exc:  # noqa: BLE001 - 훅이 세션을 막으면 안 된다
        if args.soft_fail:
            warn(f"동기화를 건너뜁니다: {exc}")
            return 0
        raise


if __name__ == "__main__":
    sys.exit(main())
