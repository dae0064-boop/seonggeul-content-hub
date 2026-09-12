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
| `#check` | 08-checklist.png | 966×1288 | 본문 체크리스트 |
| `#faq` | 09-faq.png | 966×1288 | 본문 Q&A |

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

## 아직 렌더링하지 않음

소스만 있고 PNG 는 아직 뽑지 않았다. 인용구 스타일 정리가 끝난 뒤
원고가 확정되면 그때 뽑는다. 카드 문구가 본문과 어긋나면 안 되기 때문이다.
