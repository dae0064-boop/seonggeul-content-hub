# usage-meter — 클로드 사용량 패널

이 저장소로 여는 Claude 대화의 채팅 옆에 '클로드 사용량' 패널을 띄운다 (2026-11-02 사용자 요청 — "매번 들어가서 확인하기 어렵다").
현재 세션(5시간)·주간 한도(7일) 막대와 %, 초기화 시각(한국 시간)을 보여 주고, Claude 가 답할 때마다 저절로 바뀐다. 70% 노랑, 90% 빨강.
계정 전체 사용량이라 자동 작업(Routine)이 쓴 양도 들어간다. 읽기만 하고 아무것도 바꾸지 않는다.

- ⚠ **클라우드 대화에서는 켜지지 않는다** (2026-11-02 확인 — `claude -p "/usage-pane" --debug` 로 직접 띄워 기록을 봄):
  1. 이 폴더의 플러그인은 대화가 시작될 때 읽히지 않는다. 기록: `installed plugins' hooks modules not loaded: rollout flag (tengu_plugin_hooks_modules) is not answered yet in this wake`
     — Anthropic 쪽 기능 스위치가 이 클라우드 환경에서 아직 켜지지 않아, 내장 플러그인 말고는 패널 프로그램을 돌리지 않는다. 우리가 고칠 수 있는 것이 아니다. 그래서 `/usage-pane` 도 없다.
  2. 대화 중에 Claude 가 이 폴더를 그 대화의 모드 폴더(`~/.claude/dev-mods/<대화 id>/`)로 복사하면 앱에 'Turn them on' 질문이 뜬다 — **늦게 뜰 수 있다**(11/2 처음엔 '거절'로 기록됐다가, 대화를 다시 열었을 때 떠서 누르니 켜짐, `/usage-pane` 정상). 이 방법은 그 대화에서만 된다.
  3. 같은 복사본을 시험으로 띄우면 프로그램 자체는 정상으로 돈다(`/usage-pane listed`, 명령 응답 정상). 프로그램 문제가 아니다.
  대신 PC 에서 `launchers/usage-window.cmd` 더블클릭 → 사용량 화면이 작은 크롬 창으로 뜬다. 위 스위치가 켜지면 이 폴더 그대로 다시 시험한다.
- **2026-11-02 사용자: 요청할 때만 뜬다** — 대화를 열어도 패널·상태 줄이 저절로 뜨지 않는다. 볼 때만 `/usage-pane` 을 치거나 Claude 에게 "사용량 보여 줘". 그 대화 안에서만 보이고 다음 대화는 다시 꺼진 채로 시작한다
- 끄려면 이 폴더(`.claude/skills/usage-meter/`)를 지운다
- 고칠 때는 `hooks/register.tsx` 를 고치고 `claude plugin validate .claude/skills/usage-meter` 로 확인
