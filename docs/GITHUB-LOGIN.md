# PC 에서 GitHub 로그인하기 (사용자용)

2026-11-14 확인: PC 의 git 에 GitHub 로그인이 저장돼 있지 않다.
그래서 이 PC 에서 Claude 가 고친 것을 GitHub 에 올리지(push) 못한다. 받아 오기(pull)는 공개 저장소라 로그인 없이 된다.

## 한 번만 하면 된다 (약 2분)

1. 키보드에서 **윈도우 키**를 누른다.
2. `cmd` 라고 친다 → **Enter**.
3. 검은 창이 뜨면 아래 줄을 복사해서 창 안에 **마우스 오른쪽 클릭**으로 붙여 넣고 **Enter**.

   ```
   git credential-manager github login
   ```

4. 작은 창이 뜨면 **Sign in with your browser**(브라우저로 로그인)를 누른다.
5. 크롬이 열리면 GitHub 계정(**dae0064-boop**)으로 로그인 → **Authorize git-ecosystem**(허락) 초록 버튼을 누른다.
6. 브라우저에 **Authentication Succeeded** 가 보이면 끝. 검은 창으로 돌아온다.
7. 잘 됐는지 확인 — 아래 줄을 붙여 넣고 Enter:

   ```
   git credential-manager github list
   ```

   **`dae0064-boop`** 한 줄이 나오면 정상이다.

## 다르게 보이면

- 4번 창 대신 "Username" 을 묻는 글자가 나오면: 창을 닫고 처음부터 다시 한다.
- 7번에서 아무것도 안 나오면: 5번 허락 버튼을 안 누른 것이다. 3번부터 다시.
- 모르겠으면 화면 캡처(윈도우 키 + Shift + S)를 Claude 에 붙여 준다.

로그인 뒤에는 Claude 에 "올려줘"라고만 하면 된다.
