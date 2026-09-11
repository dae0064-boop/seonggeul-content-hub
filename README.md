# seonggeul-content-hub

집 · 회사 · 노트북 어디서 열어도 **같은 작업물과 같은 Claude 메모리**로 이어서 작업하기 위한 설정.

작업물은 Google Drive 의 `ClaudeWorkspace/` 에 두고, Claude 의 메모리는 세션을 열고 닫을 때
자동으로 Drive 에 백업·복원됩니다.

## 빠른 시작

컴퓨터마다 한 번씩, 모두 같은 방법입니다. git clone 이 필요 없습니다.

**Windows** — `내 드라이브\ClaudeWorkspace\connect.cmd` 더블클릭

**macOS / Linux**

```bash
cd "<내 드라이브>/ClaudeWorkspace"
python3 connect.py
```

`connect.py` 는 Drive 에 도구가 없으면 GitHub 에서 받아오고, 있으면 그대로 씁니다.
그래서 첫 컴퓨터든 세 번째든 절차가 같고, 두 번째부터는 인터넷이 막혀 있어도 됩니다.

자세한 설치·문제 해결은 **[docs/SETUP.md](docs/SETUP.md)** 를 보세요.

## 구성

| 경로 | 내용 |
|---|---|
| `memory/CLAUDE.md` | 성글벙글 블로그 글쓰기 규칙 (모든 컴퓨터가 공유하는 기준 메모리) |
| `scripts/workspace.py` | 동기화 도구 본체 |
| `scripts/ws_hooks.py` | Claude Code 자동 동기화 훅 설치기 |
| `launchers/connect.py` | Drive 에 두는 연결 스크립트 (도구를 받아와 bootstrap) |
| `launchers/*.cmd` | Windows 더블클릭 런처 |
| `CLAUDE.md` | Claude 가 이 저장소에서 따를 작업 규칙 |
| `docs/SETUP.md` | 컴퓨터별 설치 가이드 |

## 만들어지는 Drive 구조

```
내 드라이브/ClaudeWorkspace/
├── projects/    진행 중인 작업
├── outputs/     완성된 산출물
├── memory/      Claude 메모리 백업
│   ├── shared/     모든 컴퓨터 공통 (CLAUDE.md, 커맨드, 스킬)
│   ├── machines/   컴퓨터별 세션 기록
│   └── .conflicts/ 충돌 시 밀려난 사본
└── .workspace/  도구와 상태 파일
```

## 안전 장치

- 자격증명(`.credentials.json`, `.env`)은 Drive 에 올라가지 않습니다.
- `~/.claude.json` 백업본의 토큰·API 키는 `<redacted>` 로 지워집니다.
- 두 컴퓨터가 같은 파일을 고치면 **덮어쓰지 않고** 멈춘 뒤,
  `workspace.py resolve` 로 어느 쪽을 남길지 고르게 합니다.
- 파일 삭제는 다른 컴퓨터로 전파되지 않습니다.

## 주의

`node_modules`, `.venv`, `build` 같은 폴더를 Drive 에 두면 동기화 충돌과 속도 저하가 생깁니다.

```bash
workspace.py doctor                # 문제 폴더 찾기
workspace.py detach <프로젝트경로>   # Drive 바깥으로 옮기고 링크만 남기기
```
