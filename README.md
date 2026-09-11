# seonggeul-content-hub

집 · 회사 · 노트북 어디서 열어도 **같은 작업물과 같은 Claude 메모리**로 이어서 작업하기 위한 설정.

작업물은 Google Drive 의 `ClaudeWorkspace/` 에 두고, Claude 의 메모리는 세션을 열고 닫을 때
자동으로 Drive 에 백업·복원됩니다.

## 빠른 시작

```bash
git clone https://github.com/dae0064-boop/seonggeul-content-hub.git
cd seonggeul-content-hub
python3 scripts/workspace.py bootstrap
```

두 번째 컴퓨터부터는 clone 없이 Drive 안의 사본으로 설치합니다.

```bash
python3 "<내 드라이브>/ClaudeWorkspace/.workspace/bin/workspace.py" bootstrap
```

자세한 설치·문제 해결은 **[docs/SETUP.md](docs/SETUP.md)** 를 보세요.

## 구성

| 경로 | 내용 |
|---|---|
| `memory/CLAUDE.md` | 성글벙글 블로그 글쓰기 규칙 (모든 컴퓨터가 공유하는 기준 메모리) |
| `scripts/workspace.py` | 동기화 도구 본체 |
| `scripts/ws_hooks.py` | Claude Code 자동 동기화 훅 설치기 |
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
