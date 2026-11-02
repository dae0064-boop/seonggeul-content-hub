"""스레드에 올릴 '성글벙글' 글씨 그림 (2026-11-02 사용자 — 네이버 배너에 들어간 성글벙글 글자로만).
네이버 PC 배너 원본(content/blog-banner/src/gpt-clean.png)에서 제목 글씨만 떼어,
배너와 같은 크림색 바탕 1080×1080 가운데에 얹는다. 투명 배경 PNG 도 함께 만든다.
결과: content/threads/brand/seonggeul-logo-1080.png, seonggeul-logo-transparent.png
같은 날 사용자 — "부제(매일매일 좋은 날을 나누는 공간)까지 다 넣고, 둥근 프로필 화면에 들어가게":
seonggeul-profile-circle.png (1080×1080, 글씨 전체가 가운데 원 안에) + 원 모양 미리보기 seonggeul-profile-preview.png
"""
from PIL import Image, ImageDraw, ImageFilter
R = 'content/blog-banner'; OUT = 'content/threads/brand'
src = Image.open(f'{R}/src/gpt-clean.png').convert('RGB')
avg = lambda b: src.crop(b).resize((1, 1), Image.BOX).getpixel((0, 0))
# 1) 제목 글씨만: 크림 바탕과의 색 차이로 투명도를 만든다 (fit-gpt.py 와 같은 방법)
def keyed(box):
  p = src.crop(box); bgc = avg((700, 95, 730, 125))
  p = p.convert('RGBA'); px = p.load()
  for y in range(p.height):
    for x in range(p.width):
        r, g, b, _ = px[x, y]
        d = ((r - bgc[0]) ** 2 + (g - bgc[1]) ** 2 + (b - bgc[2]) ** 2) ** 0.5
        a = max(0.0, min(1.0, (d - 8) / 70))
        if a <= 0: px[x, y] = (0, 0, 0, 0); continue
        c = [max(0, min(255, round((v - (1 - a) * bv) / a))) for v, bv in ((r, bgc[0]), (g, bgc[1]), (b, bgc[2]))]
        px[x, y] = (*c, round(a * 255))
  return p.crop(p.getbbox())
p = keyed((700, 95, 1300, 255))
# 2) 키워서 (가로 760) 투명 배경으로 한 장
S = 1080; sc = 760 / p.width
logo = p.resize((760, round(p.height * sc)), Image.LANCZOS)
t = Image.new('RGBA', (logo.width + 80, logo.height + 80), (0, 0, 0, 0)); t.alpha_composite(logo, (40, 40))
t.save(f'{OUT}/seonggeul-logo-transparent.png')
# 3) 배너와 같은 바탕 (위·아래 색 그라데이션 + 가운데 은은한 빛) 1080×1080
top, bot = avg((900, 5, 1100, 80)), avg((900, 610, 1100, 665))
cv = Image.new('RGB', (S, S)); d = ImageDraw.Draw(cv)
for y in range(S):
    k = y / (S - 1); d.line([(0, y), (S, y)], fill=tuple(int(top[c] * (1 - k) + bot[c] * k) for c in range(3)))
glow = Image.new('L', (S, S), 0); ImageDraw.Draw(glow).ellipse([140, 240, 940, 840], fill=90); glow = glow.filter(ImageFilter.GaussianBlur(140))
cv = Image.composite(Image.new('RGB', (S, S), (255, 251, 243)), cv, glow).convert('RGBA')
base = cv.copy()
cv.alpha_composite(logo, ((S - logo.width) // 2, (S - logo.height) // 2))
cv.convert('RGB').save(f'{OUT}/seonggeul-logo-1080.png')
# 4) 프로필(둥근 화면): 제목 + 부제 전체를 원 안쪽(반지름 540 중 약 450)에 들어가게
full = keyed((705, 95, 1295, 318)); FW = 820
full = full.resize((FW, round(full.height * FW / full.width)), Image.LANCZOS)
assert ((full.width / 2) ** 2 + (full.height / 2) ** 2) ** 0.5 < 470, full.size
pf = base.copy(); pf.alpha_composite(full, ((S - full.width) // 2, (S - full.height) // 2 + 6))
pf.convert('RGB').save(f'{OUT}/seonggeul-profile-circle.png')
m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse([0, 0, S - 1, S - 1], fill=255)
pv = Image.new('RGBA', (S, S), (255, 255, 255, 255)); pv.paste(pf, (0, 0), m)
pv.convert('RGB').save(f'{OUT}/seonggeul-profile-preview.png')
print('ok', logo.size, full.size)
