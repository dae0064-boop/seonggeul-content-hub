"""ChatGPT 가 만든 배너(content/blog-banner/src/gpt-clean.png, 2000×667)를 네이버 화면에 맞춘다 (2026-11-02).
- 1920×600 으로 줄이고, 가운데 원래 제목·카드를 지운 깨끗한 바탕을 만든다 (양옆 색을 줄마다 이어 붙여 흐리게)
- GPT 제목 글씨를 잘라 위젯 다섯 칸의 가운데(x 943)로, 카드 5장을 잘라 위젯 칸(x 486+k*186, 폭 170)에 정확히 놓는다
결과: content/blog-banner/out/clean-1920x600.png, clean-preview.png
"""
from PIL import Image, ImageDraw, ImageFilter
import os, sys
R = 'content/blog-banner'
src = Image.open(f'{R}/src/gpt-clean.png').convert('RGB')
W, H = src.size
# 0) 카드 사진 바꾸기 (src/cat-care2.png → 2번째, src/cat-trip.png → 5번째). 카드 안 사진 칸: 카드 왼쪽+2 ~ +255, y 343~530
for k, name in ((1, 'cat-care2'), (4, 'cat-trip')):
    f = f'{R}/src/{name}.png'
    if not os.path.exists(f): continue
    l = round(320 + k * 275.5) + 2 if k else 322
    l = [322, 598, 873, 1148, 1424][k]
    pw, ph = 253, 187
    im = Image.open(f).convert('RGB'); sc = max(pw / im.width, ph / im.height)
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    im = im.crop(((im.width - pw) // 2, (im.height - ph) // 2, (im.width - pw) // 2 + pw, (im.height - ph) // 2 + ph))
    pm = Image.new('L', (pw, ph), 0); ImageDraw.Draw(pm).rounded_rectangle([0, 0, pw - 1, ph + 30], radius=18, fill=255)
    src.paste(im, (l, 343), pm)
# 1) 깨끗한 바탕: 가운데를 원본 가운데 위·아래 바탕색의 세로 그라데이션으로 채우고 양옆과 넓게 섞는다
def avg(box):
    r = src.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0)); return r
top, bot = avg((900, 5, 1100, 80)), avg((900, 610, 1100, 665))
plate = Image.new('RGB', (W, H))
d0 = ImageDraw.Draw(plate)
for y in range(H):
    t = y / (H - 1); d0.line([(0, y), (W, y)], fill=tuple(int(top[c] * (1 - t) + bot[c] * t) for c in range(3)))
glow = Image.new('L', (W, H), 0); ImageDraw.Draw(glow).ellipse([500, -150, 1500, 450], fill=70); glow = glow.filter(ImageFilter.GaussianBlur(120))
plate = Image.composite(Image.new('RGB', (W, H), (255, 250, 240)), plate, glow)
mask = Image.new('L', (W, H), 0)
ImageDraw.Draw(mask).rectangle([262, 0, 1718, H], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(22))
bg = Image.composite(plate, src, mask)
# 2) 1920 폭으로 (0.96배 → 640 높이), 위 20px 잘라 600
s = 1920 / W
bg = bg.resize((1920, round(H * s)), Image.LANCZOS).crop((0, 20, 1920, 620))
out = bg.convert('RGBA')
# 3) 제목 글씨만 떼어 얹기 (크림 바탕과의 색 차이로 투명도를 만든다 — 상자 자국이 안 남게)
def keyed(box):
    p = src.crop(box); bgc = p.crop((0, 0, 30, 30)).resize((1, 1), Image.BOX).getpixel((0, 0))
    p = p.resize((round(p.width * s), round(p.height * s)), Image.LANCZOS).convert('RGBA'); px = p.load()
    for yy in range(p.height):
        for xx in range(p.width):
            r, g, b0, _ = px[xx, yy]
            dist = ((r - bgc[0]) ** 2 + (g - bgc[1]) ** 2 + (b0 - bgc[2]) ** 2) ** 0.5
            al = max(0.0, min(1.0, (dist - 8) / 70))
            if al <= 0: px[xx, yy] = (0, 0, 0, 0); continue
            c = [max(0, min(255, round((v - (1 - al) * bv) / al))) for v, bv in ((r, bgc[0]), (g, bgc[1]), (b0, bgc[2]))]
            px[xx, yy] = (*c, round(al * 255))
    return p
title = keyed((700, 95, 1300, 255))
out.alpha_composite(title, (943 - title.width // 2, 92))
SUB = sys.argv[1] if len(sys.argv) > 1 else ''
if SUB:  # 부제를 바꿀 때: 고딕 글씨로 직접 (제목과 간격 넓게, 자간 넓게 — 2026-11-02 사용자)
    from PIL import ImageFont
    fnt = ImageFont.truetype('scripts/lib/fonts/GothicA1-Medium.ttf', 34)
    dd = ImageDraw.Draw(out); sp = 3
    w = sum(dd.textlength(ch, font=fnt) for ch in SUB) + sp * (len(SUB) - 1)
    x = 943 - w / 2; y = 92 + title.height + 26
    for ch in SUB:
        dd.text((x, y), ch, font=fnt, fill=(112, 100, 88, 255)); x += dd.textlength(ch, font=fnt) + sp
else:
    sub = keyed((700, 255, 1300, 318))
    out.alpha_composite(sub, (943 - sub.width // 2, 92 + title.height))
# 4) 카드 5장 (원본 왼쪽 320+k*275.5, 위 339, 258×252) → 폭 170, 위젯 칸에
CW = 170
for k in range(5):
    l = round(320 + k * 275.5)
    c = src.crop((l, 339, l + 258, 591))
    ch = round(252 * CW / 258)
    c = c.resize((CW, ch), Image.LANCZOS)
    cm = Image.new('L', (CW, ch), 0); ImageDraw.Draw(cm).rounded_rectangle([0, 0, CW - 1, ch - 1], radius=14, fill=255)
    x, y = 486 + k * 186, 392
    sh = Image.new('RGBA', (CW + 40, ch + 40), (0, 0, 0, 0))
    sm = Image.new('L', (CW + 40, ch + 40), 0); ImageDraw.Draw(sm).rounded_rectangle([20, 26, CW + 19, ch + 25], radius=14, fill=60); sm = sm.filter(ImageFilter.GaussianBlur(9))
    sh.putalpha(sm); out.alpha_composite(Image.composite(Image.new('RGBA', sh.size, (120, 95, 60, 255)), sh, sm), (x - 20, y - 20))
    out.paste(c, (x, y), cm)
os.makedirs(f'{R}/out', exist_ok=True)
out.convert('RGB').save(f'{R}/out/clean-1920x600.png')
pv = out.copy(); d = ImageDraw.Draw(pv)
for k in range(5):
    x = 486 + k * 186
    for yy in range(321, 600, 10): d.line([(x, yy), (x, yy + 5)], fill=(40, 90, 220)); d.line([(x + 170, yy), (x + 170, yy + 5)], fill=(40, 90, 220))
    for xx in range(x, x + 170, 10): d.line([(xx, 321), (xx + 5, 321)], fill=(40, 90, 220))
d.text((1158, 12), 'menu', fill=(60, 60, 60)); d.text((487, 56), 'prologue | blog', fill=(60, 60, 60))
pv.convert('RGB').save(f'{R}/out/clean-preview.png')
print('ok')
