# seonggeul-content-hub

성글벙글 콘텐츠 작업을 집·회사·노트북 어디서든 똑같이 이어서 할 수 있게 만드는 저장소.

## 이 저장소의 역할

두 가지만 담는다.

1. **`memory/`** — 모든 컴퓨터가 공유해야 할 기준 메모리의 원본.
   `memory/CLAUDE.md` 가 블로그 글쓰기 규칙이며, 이것이 각 컴퓨터의 `~/.claude/CLAUDE.md` 가 된다.
2. **`scripts/`** — 그 메모리와 작업물을 Google Drive 로 동기화하는 도구.

실제 **작업물은 이 저장소에 두지 않는다.** Google Drive 의 `ClaudeWorkspace/` 에 둔다.

## 작업 규칙

### 어디에 저장하는가

모든 작업 결과물은 Google Drive 의 워크스페이스 안에 저장한다. 로컬 임시 폴더나 바탕화면에 남기지 않는다.

```
내 드라이브/ClaudeWorkspace/
├── projects/    ← 진행 중인 작업. 여기서 작업한다.
├── outputs/     ← 완성된 산출물 (발행 완료된 글, 이미지 등)
├── memory/      ← Claude 메모리 백업. 직접 건드리지 않는다.
└── .workspace/  ← 도구와 상태 파일. 직접 건드리지 않는다.
```

워크스페이스 경로는 `workspace.py status` 로 확인한다. 컴퓨터마다 실제 경로가 다르므로
(Windows 는 `G:\내 드라이브\...`, macOS 는 `~/Library/CloudStorage/...`) 경로를 하드코딩하지 않는다.

### 글을 쓸 때

`memory/CLAUDE.md` 의 규칙을 예외 없이 적용한다. 특히:

- 쓰기 전에 **타겟 / 목적 / 팩트** 3가지를 먼저 확정한다.
- 수치·제도는 **1차 출처 원문 + URL** 을 확인한다. 확인 못 하면 쓰지 않는다.
- 광고 심의 금지 표현(최고·무조건·100%·보장 등)을 쓰지 않는다.
- CTA 는 판매가 아니라 **점검형**으로 끝낸다.
- 발행 전 10문항 체크리스트를 통과시킨다.

### 메모리를 고쳤을 때

기준 메모리(`~/.claude/CLAUDE.md`)를 고쳤다면, 그 변경은 Drive 를 통해 다른 컴퓨터로 전파된다.
세션이 끝날 때 자동으로 백업되지만, 확실히 하려면 `workspace.py push` 를 실행한다.

저장소의 원본(`memory/CLAUDE.md`)까지 바꾸려면 여기서 직접 수정하고 커밋한다.

## 컴퓨터를 옮길 때 — 반드시 지킬 것

1. **한 번에 한 컴퓨터에서만** 작업한다.
2. 작업을 마치면 Google Drive 트레이 아이콘이 **"최신 상태"** 가 될 때까지 기다린 뒤 컴퓨터를 끈다.
3. 다른 컴퓨터에서 시작할 때도 동기화가 끝난 뒤 Claude 를 연다.

이 순서를 어기면 같은 파일이 양쪽에서 바뀌어 충돌이 난다. 충돌이 나도 데이터는 지워지지 않고
`memory/.conflicts/` 에 사본이 남으며, `workspace.py resolve` 로 어느 쪽을 남길지 고를 수 있다.

## 절대 하지 않을 것

- **`node_modules`, `.venv`, `build`, `dist` 를 Drive 안에 그대로 두지 않는다.**
  동기화 충돌과 속도 저하의 주원인이다. `workspace.py detach <경로>` 로 Drive 바깥으로 뺀다.
- **자격증명을 Drive 에 올리지 않는다.** `.credentials.json`, `.env`, API 키가 담긴 파일은
  동기화 대상에서 제외되어 있다. 이 제외 목록을 임의로 풀지 않는다.
- 작업 중인 파일을 양쪽 컴퓨터에서 동시에 열지 않는다.

## 자주 쓰는 명령

워크스페이스가 설치된 뒤에는 Drive 안의 사본으로 실행한다.

```bash
python3 ".../ClaudeWorkspace/.workspace/bin/workspace.py" status   # 지금 상태
python3 ".../ClaudeWorkspace/.workspace/bin/workspace.py" sync     # 받아오고 백업
python3 ".../ClaudeWorkspace/.workspace/bin/workspace.py" doctor   # 문제 진단
```

새 컴퓨터 추가와 문제 해결은 `docs/SETUP.md` 참고.
