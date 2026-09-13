# 여러 대의 컴퓨터에서 이어서 작업하기

집·회사·노트북에서 같은 규칙 메모리로 작업하기 위해 Google Drive 워크스페이스를 쓴다.
`memory/CLAUDE.md` 가 각 PC 의 `~/.claude/CLAUDE.md` 로 배포된다.

Google Drive 워크스페이스(`ClaudeWorkspace/`)는 **규칙 메모리 동기화와 PC 간 연속성**
용도로만 쓴다. **원고의 정본 위치가 아니다** — 원고와 산출물은 이 저장소 `content/` 에 둔다.
검사기와 발행 스크립트가 저장소 경로를 기준으로 동작하므로, 저장소 밖에 두면 검증이 돌지 않는다.

## 설치

컴퓨터마다 한 번씩, 모두 같은 방법이다. 자세한 절차는 `docs/SETUP.md`.

**Windows** — `내 드라이브\ClaudeWorkspace\connect.cmd` 더블클릭
**macOS / Linux** — `python3 "<내 드라이브>/ClaudeWorkspace/connect.py"`

```bash
workspace.py status   # 지금 상태
workspace.py sync     # 받아오고 백업
workspace.py doctor   # 문제 진단
```

경로는 컴퓨터마다 다르므로(Windows `G:\내 드라이브\...`, macOS `~/Library/CloudStorage/...`)
하드코딩하지 않고 `workspace.py status` 로 확인한다.

## 지킬 것

1. **한 번에 한 컴퓨터에서만** 작업한다.
2. 작업을 마치면 Drive 트레이 아이콘이 **"최신 상태"** 가 된 뒤 컴퓨터를 끈다.
3. 다른 컴퓨터에서 시작할 때도 동기화가 끝난 뒤 Claude 를 연다.

어겨서 충돌이 나도 데이터는 지워지지 않는다. `memory/.conflicts/` 에 사본이 남고
`workspace.py resolve` 로 고를 수 있다.

## 하지 않을 것

- `node_modules`, `.venv`, `build`, `dist` 를 Drive 안에 두지 않는다.
  동기화 충돌과 속도 저하의 주원인이다. `workspace.py detach <경로>` 로 빼낸다.
- 자격증명을 Drive 에 올리지 않는다. `.credentials.json`, `.env`, API 키가 담긴 파일은
  동기화 제외 목록에 있다. 이 목록을 임의로 풀지 않는다.
- 같은 파일을 두 컴퓨터에서 동시에 열지 않는다.

## 메모리를 고쳤을 때

각 PC 의 `~/.claude/CLAUDE.md` 를 고친 변경은 Drive 를 통해 전파된다. 세션 종료 시 자동
백업되지만, 확실히 하려면 `workspace.py push` 를 실행한다.
저장소의 정본까지 바꾸려면 `memory/CLAUDE.md` 를 직접 고치고 커밋한다.
