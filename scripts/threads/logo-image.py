"""스레드에 올릴 '성글벙글' 글씨 그림 (2026-11-02 사용자 — 네이버 배너에 들어간 성글벙글 글자로만).
네이버 PC 배너 원본(content/blog-banner/src/gpt-clean.png)에서 제목 글씨만 떼어,
배너와 같은 크림색 바탕 1080×1080 가운데에 얹는다. 투명 배경 PNG 도 함께 만든다.
결과: content/threads/brand/seonggeul-logo-1080.png, seonggeul-logo-transparent.png
"""
from PIL import Image, ImageDraw, ImageFilter
R = 'content/blog-banner'; OUT = 'content/threads/brand'
src = Image.open(f'{R}/src/gpt-clean.png').convert('RGB')
avg = lambda b: src.crop(b).resize((1, 1), Image.BOX).getpixel((0, 0))
# 1) 제목 글씨만: 크림 바탕과의 색 차이로 투명도를 만든다 (fit-gpt.py 와 같은 방법)
p = src.crop((700, 95, 1300, 255)); bgc = avg((700, 95, 730, 125))
p = p.convert('RGBA'); px = p.load()
for y in range(p.height):
    for x in range(p.width):
        r, g, b, _ = px[x, y]
        d = ((r - bgc[0]) ** 2 + (g - bgc[1]) ** 2 + (b - bgc[2]) ** 2) ** 0.5
        a = max(0.0, min(1.0, (d - 8) / 70))
        if a <= 0: px[x, y] = (0, 0, 0, 0); continue
        c = [max(0, min(255, round((v - (1 - a) * bv) / a))) for v, bv in ((r, bgc[0]), (g, bgc[1]), (b, bgc[2]))]
        px[x, y] = (*c, round(a * 255))
p = p.crop(p.getbbox())
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
cv.alpha_composite(logo, ((S - logo.width) // 2, (S - logo.height) // 2))
cv.convert('RGB').save(f'{OUT}/seonggeul-logo-1080.png')
print('ok', logo.size)
