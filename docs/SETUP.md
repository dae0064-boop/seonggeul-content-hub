# 컴퓨터 설치 가이드

집 · 회사 · 노트북 각각에서 **한 번씩만** 하면 됩니다.
이후에는 어디서 열어도 같은 작업 폴더와 같은 Claude 메모리를 씁니다.

---

## 0. 준비물

| 필요한 것 | 확인 방법 |
|---|---|
| Google Drive for Desktop | 탐색기(파인더)에 **내 드라이브**가 보이면 OK — [다운로드](https://www.google.com/drive/download/) |
| Python 3.8 이상 | 터미널에서 `python3 --version` (Windows 는 `python --version`) |

Python 이 없다면:

- **Windows**: `winget install Python.Python.3.12`
- **macOS**: `brew install python3` (또는 [python.org](https://www.python.org/downloads/))

---

## 1. 첫 번째 컴퓨터

이 저장소를 받아서 `bootstrap` 을 한 번 실행합니다.

```bash
git clone https://github.com/dae0064-boop/seonggeul-content-hub.git
cd seonggeul-content-hub
python3 scripts/workspace.py bootstrap
```

이때 일어나는 일:

1. Google Drive 를 찾아 `내 드라이브/ClaudeWorkspace/` 를 만듭니다.
2. `memory/CLAUDE.md` (블로그 규칙)를 공유 메모리로 심습니다.
3. 도구 자체를 `ClaudeWorkspace/.workspace/bin/` 안에 복사합니다.
   → 다른 컴퓨터는 git clone 없이 이 사본으로 설치할 수 있습니다.
4. Claude Code 설정에 자동 동기화 훅을 넣습니다.
   - 세션 **시작** 시 → Drive 의 최신 메모리를 받아옴
   - 세션 **종료** 시 → 메모리를 Drive 에 백업
5. 첫 동기화를 실행합니다.

> 훅을 넣고 싶지 않다면 `--no-hooks` 를 붙이세요. 대신 `workspace.py sync` 를 직접 실행해야 합니다.

---

## 2. 두 번째, 세 번째 컴퓨터

git clone 이 필요 없습니다. Drive 가 동기화되기를 기다린 뒤, Drive 안의 도구를 그대로 실행합니다.

**Windows (PowerShell)**

```powershell
python "G:\내 드라이브\ClaudeWorkspace\.workspace\bin\workspace.py" bootstrap
```

**macOS**

```bash
python3 ~/Library/CloudStorage/GoogleDrive-dae0064@gmail.com/My\ Drive/ClaudeWorkspace/.workspace/bin/workspace.py bootstrap
```

경로가 다르면 `내 드라이브` 안의 `ClaudeWorkspace/.workspace/bin/workspace.py` 를 찾아 그 경로를 쓰면 됩니다.

---

## 3. 매일 쓰는 법

훅을 설치했다면 **평소에는 아무것도 하지 않아도 됩니다.** Claude 를 열고 닫을 때 알아서 동기화됩니다.

작업은 항상 여기서 합니다:

```
내 드라이브/ClaudeWorkspace/projects/
```

### 컴퓨터를 옮길 때 (중요)

1. 작업을 마칩니다.
2. **Google Drive 트레이 아이콘이 "최신 상태"가 될 때까지 기다립니다.**
3. 그다음 다른 컴퓨터를 켭니다.

이 순서만 지키면 충돌이 나지 않습니다.

---

## 4. 명령어

Drive 안의 도구 경로를 `WS` 라고 하면:

| 명령 | 하는 일 |
|---|---|
| `workspace.py status` | 워크스페이스 경로, 등록된 컴퓨터, 마지막 동기화 시각 |
| `workspace.py sync` | 받아오고(pull) 백업(push) |
| `workspace.py pull` | Drive → 이 컴퓨터 |
| `workspace.py push` | 이 컴퓨터 → Drive |
| `workspace.py doctor` | 설정 문제 진단 |
| `workspace.py detach <경로>` | `node_modules` 등을 Drive 바깥으로 |
| `workspace.py resolve --keep-local` | 충돌 시 이 컴퓨터 내용을 남김 |
| `workspace.py resolve --keep-drive` | 충돌 시 Drive 내용을 남김 |
| `workspace.py uninstall-hooks` | 자동 동기화 끄기 |

---

## 5. 문제 해결

### "워크스페이스를 찾지 못했습니다"

먼저 `doctor` 를 돌려보세요.

```bash
python3 scripts/workspace.py doctor
```

Google Drive 가 실행 중인데도 못 찾으면, 경로를 직접 알려줍니다.

```bash
# macOS / Linux
CLAUDE_DRIVE_ROOT="/경로/내 드라이브" python3 scripts/workspace.py bootstrap

# Windows PowerShell
$env:CLAUDE_DRIVE_ROOT="G:\내 드라이브"; python scripts\workspace.py bootstrap
```

### 충돌이 났다고 나옵니다

두 컴퓨터가 마지막 동기화 이후 **같은 파일**을 고쳤다는 뜻입니다.
**어느 쪽도 덮어쓰이지 않았고**, 밀려난 내용은 `ClaudeWorkspace/memory/.conflicts/` 에 사본으로 남아 있습니다.

양쪽 내용을 직접 비교한 뒤 고릅니다.

```bash
workspace.py resolve --keep-local   # 이 컴퓨터 것을 남긴다
workspace.py resolve --keep-drive   # Drive 것을 남긴다
```

### Drive 동기화가 너무 느립니다

`node_modules` 같은 폴더가 Drive 에 올라가 있을 가능성이 큽니다.

```bash
workspace.py doctor                                    # 어떤 폴더가 문제인지 확인
workspace.py detach "내 드라이브/ClaudeWorkspace/projects/블로그"
```

해당 폴더는 Drive 바깥(`~/.claude-ws-cache/`)으로 옮겨지고 링크만 남습니다.
이 폴더들은 컴퓨터마다 따로 만들어야 합니다 (`npm install` 등).

### 블로그 규칙을 저장소 원본으로 되돌리고 싶습니다

```bash
python3 scripts/workspace.py bootstrap --reseed
```

지금 있던 내용은 `memory/.conflicts/` 에 사본으로 남습니다.

---

## 6. 안전 장치

- **자격증명은 절대 Drive 에 올라가지 않습니다.**
  `.credentials.json`, `.env`, `credentials.json` 은 동기화 대상에서 제외됩니다.
- `~/.claude.json` 은 MCP 서버 목록 참고용으로만 백업되며, **토큰·API 키는 `<redacted>` 로 지워집니다.**
  이 파일은 자동 복원되지 않습니다.
- 충돌 시 **덮어쓰기보다 보존을 우선**합니다. 데이터를 지우는 동작은 없습니다.
- 파일 삭제는 다른 컴퓨터로 전파되지 않습니다. 지우려면 양쪽에서 직접 지워야 합니다.
