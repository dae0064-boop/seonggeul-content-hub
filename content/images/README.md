# 카드 이미지

원고에 넣을 이미지 10장 중 **사진이 아닌 것**을 여기서 만든다.
썸네일, 체크리스트 카드, Q&A 카드가 해당한다.

사진(에어컨 실물, 필터 근접 등)은 여기서 만들지 않는다.
작업판 아티팩트의 이미지 프롬프트를 이미지 생성 도구에 넣어 쓴다.

## 소스

`cards.html` 한 파일에 카드 세 장이 들어 있다.
한글 서체는 Google Fonts 에서 받으므로 렌더링할 때 네트워크가 필요하다.

| id | 파일명 | 크기 | 쓰임 |
|---|---|---|---|
| `#thumb` | 01-thumbnail.png | 1000×1000 | 썸네일 |
| `#check` | 08-checklist.png | 966×1300 | 본문 체크리스트 |
| `#faq` | 09-faq.png | 966×1150 | 본문 Q&A |

리스트형 카드는 **높이를 고정하지 않는다.** 고정하면 내용이 넘칠 때
flex 가 얇은 요소부터 눌러 없앤다. 7px 구분선이 0이 되어 사라졌다.
`min-height` 로 두고 `.rule`, `.row`, `.tail` 에 `flex:none` 을 준다.

## 렌더링

```bash
node - <<'EOF'
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--force-color-profile=srgb'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 2 });
  await p.goto('file://' + process.cwd() + '/content/images/cards.html');
  await p.waitForFunction(() => document.fonts.status === 'loaded').catch(() => {});
  await p.waitForTimeout(1500);
  for (const [id, name] of [['thumb','01-thumbnail'],['check','08-checklist'],['faq','09-faq']])
    await p.locator('#' + id).screenshot({ path: `content/images/${name}.png` });
  await b.close();
});
EOF
```

`deviceScaleFactor: 2` 로 뽑아 실제 크기는 두 배가 된다.
네이버 본문 이미지 권장 폭이 966px 이라 축소 없이 선명하게 들어간다.

## 색은 본문 강조와 같은 값을 쓴다

카드와 본문이 따로 놀면 안 된다. CLAUDE.md 의 강조 색을 그대로 쓴다.

| | 값 | 역할 |
|---|---|---|
| 빨강 | `#cc0000` | 문제·경고 |
| 파랑 | `#0b4da2` | 행동·방법 |
| 노란배경 | `#ffe97a` | 기억할 원리 |

바탕은 `#faf7f2`, 글자는 `#2a2622`, 하단 띠는 파랑이다.

## 원고를 고치면 카드도 고친다

카드에 적힌 문구는 본문에서 가져온 것이다. 본문이 바뀌면
카드도 다시 뽑아야 한다. 어긋나면 독자가 먼저 알아챈다.
