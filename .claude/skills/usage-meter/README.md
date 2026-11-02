# usage-meter — 클로드 사용량 패널

이 저장소로 여는 Claude 대화의 채팅 옆에 '클로드 사용량' 패널을 띄운다 (2026-11-02 사용자 요청 — "매번 들어가서 확인하기 어렵다").
현재 세션(5시간)·주간 한도(7일) 막대와 %, 초기화 시각(한국 시간)을 보여 주고, Claude 가 답할 때마다 저절로 바뀐다. 70% 노랑, 90% 빨강.
계정 전체 사용량이라 자동 작업(Routine)이 쓴 양도 들어간다. 읽기만 하고 아무것도 바꾸지 않는다.

- 패널이 안 보이면 채팅창에 `/usage-pane`
- 끄려면 이 폴더(`.claude/skills/usage-meter/`)를 지운다
- 고칠 때는 `hooks/register.tsx` 를 고치고 `claude plugin validate .claude/skills/usage-meter` 로 확인
