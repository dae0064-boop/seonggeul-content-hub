"""네이버 블로그 모바일 커버 (2026-11-02 사용자 "휴대폰도"). PC 배너(ChatGPT 시안)와 같은 분위기, 1080×1080.
아래쪽은 네이버가 블로그 이름·소개를 덮어 쓰는 자리라 비워 둔다. 결과: content/blog-banner/out/mobile-cover-1080.png
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
R = 'content/blog-banner'
src = Image.open(f'{R}/src/gpt-clean.png').convert('RGB')
S = 1080
avg = lambda b: src.crop(b).resize((1, 1), Image.BOX).getpixel((0, 0))
top, bot = avg((900, 5, 1100, 80)), avg((900, 610, 1100, 665))
cv = Image.new('RGB', (S, S)); d = ImageDraw.Draw(cv)
for y in range(S):
    t = y / (S - 1); d.line([(0, y), (S, y)], fill=tuple(int(top[c] * (1 - t) + bot[c] * t) for c in range(3)))
glow = Image.new('L', (S, S), 0); ImageDraw.Draw(glow).ellipse([140, -120, 940, 620], fill=90); glow = glow.filter(ImageFilter.GaussianBlur(140))
cv = Image.composite(Image.new('RGB', (S, S), (255, 251, 243)), cv, glow)
def strip(box, x, fade_right):
    im = src.crop(box); sc = S / im.height; im = im.resize((round(im.width * sc), S), Image.LANCZOS)
    m = Image.new('L', im.size, 255); md = ImageDraw.Draw(m); w = im.width
    for i in range(w):
        a = i / w if not fade_right else 1 - i / w
        md.line([(i, 0), (i, S)], fill=int(255 * min(1, max(0, (a if not fade_right else a) * 1.6 - (0.6 if not fade_right else 0)))) if False else int(255 * ((1 - i / w) if fade_right else (i / w)) ** 0.8))
    cv.paste(im, (x, 0), m)
strip((0, 0, 240, 667), -150, True)
strip((1730, 0, 2000, 667), S - 300, False)
out = cv.convert('RGBA')
# 제목 글씨 (PC 배너와 같은 GPT 글씨를 떼어서)
def keyed(box, s):
    p = src.crop(box); bgc = p.crop((0, 0, 30, 30)).resize((1, 1), Image.BOX).getpixel((0, 0))
    p = p.resize((round(p.width * s), round(p.height * s)), Image.LANCZOS).convert('RGBA'); px = p.load()
    for yy in range(p.height):
        for xx in range(p.width):
            r, g, b0, _ = px[xx, yy]
            dist = ((r - bgc[0]) ** 2 + (g - bgc[1]) ** 2 + (b0 - bgc[2]) ** 2) ** 0.5
            al = max(0.0, min(1.0, (dist - 8) / 70))
            if al <= 0: px[xx, yy] = (0, 0, 0, 0); continue
            px[xx, yy] = (*[max(0, min(255, round((v - (1 - al) * bv) / al))) for v, bv in ((r, bgc[0]), (g, bgc[1]), (b0, bgc[2]))], round(al * 255))
    return p
title = keyed((700, 95, 1300, 255), 1.18)
out.alpha_composite(title, (S // 2 - title.width // 2, 150))
dd = ImageDraw.Draw(out)
def spaced(text, size, y, sp, fill, fontf='scripts/lib/fonts/GothicA1-Medium.ttf'):
    f = ImageFont.truetype(fontf, size); w = sum(dd.textlength(c, font=f) for c in text) + sp * (len(text) - 1); x = S / 2 - w / 2
    for c in text: dd.text((x, y), c, font=f, fill=fill); x += dd.textlength(c, font=f) + sp
spaced('오늘도 싱글벙글,', 40, 150 + title.height + 30, 3, (112, 100, 88, 255))
spaced('생활이 편해지는 이야기', 40, 150 + title.height + 86, 3, (112, 100, 88, 255))
# 카테고리 사진 동그라미 5개 (PC 배너 카드 사진)
from PIL import Image as I
src2 = Image.open(f'{R}/src/gpt-clean.png').convert('RGB')
import os
photos = []
for k, l in enumerate([322, 598, 873, 1148, 1424]):
    ph = src2.crop((l, 343, l + 253, 530))
    alt = {1: 'cat-care2', 4: 'cat-trip'}.get(k)
    if alt and os.path.exists(f'{R}/src/{alt}.png'): ph = Image.open(f'{R}/src/{alt}.png').convert('RGB')
    s0 = min(ph.size); ph = ph.crop(((ph.width - s0) // 2, (ph.height - s0) // 2, (ph.width - s0) // 2 + s0, (ph.height - s0) // 2 + s0)).resize((150, 150), Image.LANCZOS)
    photos.append(ph)
names = ['생활·정보', '생활·보장', '이슈·뉴스', '연예·방송', '맛집·나들이']
D = 150; gap = 34; x0 = S / 2 - (5 * D + 4 * gap) / 2; y0 = 560
lf = ImageFont.truetype('scripts/lib/fonts/GothicA1-Medium.ttf', 24)
for k, ph in enumerate(photos):
    x = round(x0 + k * (D + gap))
    sh = Image.new('L', (D + 40, D + 40), 0); ImageDraw.Draw(sh).ellipse([20, 26, D + 19, D + 25], fill=70); sh = sh.filter(ImageFilter.GaussianBlur(9))
    out.alpha_composite(Image.composite(Image.new('RGBA', sh.size, (120, 95, 60, 255)), Image.new('RGBA', sh.size, (0, 0, 0, 0)), sh), (x - 20, y0 - 20))
    ring = Image.new('L', (D, D), 0); ImageDraw.Draw(ring).ellipse([0, 0, D - 1, D - 1], fill=255)
    out.paste(Image.new('RGBA', (D, D), (255, 255, 255, 255)), (x, y0), ring)
    m = Image.new('L', (D - 12, D - 12), 0); ImageDraw.Draw(m).ellipse([0, 0, D - 13, D - 13], fill=255)
    out.paste(ph.resize((D - 12, D - 12)), (x + 6, y0 + 6), m)
    w = dd.textlength(names[k], font=lf); dd.text((x + D / 2 - w / 2, y0 + D + 14), names[k], font=lf, fill=(96, 86, 76, 255))
out.convert('RGB').save(f'{R}/out/mobile-cover-1080.png')
# 확인용: 아래 네이버 글자 자리
pv = out.copy(); pd = ImageDraw.Draw(pv)
pd.rectangle([0, 800, S, S], fill=(0, 0, 0, 0), outline=(40, 90, 220, 255), width=3)
pd.text((40, 830), 'Naver: blog name / intro area (approx.)', fill=(40, 90, 220, 255))
pv.convert('RGB').save(f'{R}/out/mobile-cover-preview.png')
print('ok')
