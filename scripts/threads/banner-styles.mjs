#!/usr/bin/env node
/**
 * 스레드 심의필 배너 — 새 디자인 시안 3가지 (2026-11-03 사용자: "지금 배너가 저렴한 느낌, 다른 느낌으로 3장")
 *
 *   node scripts/threads/banner-styles.mjs                 글자·배치만 (비용 0)
 *   node scripts/threads/banner-styles.mjs --art           왼쪽 칸 그림을 GPT(low)로 3장 만들어 넣음 (약 30원, PC 에서만 — 클라우드는 OpenAI 가 막힘)
 *   node scripts/threads/banner-styles.mjs --out <폴더> --no 제26-10-0209호 --from 2026-10-06 --to 2027-10-05
 *
 * 글(심의받은 문구)은 지금 배너(base.jpg)와 한 글자도 다르지 않게 코드로 쓴다 — GPT 는 글자를 깨뜨려서 글자는 맡기지 않는다.
 * 고운바탕·고운돋움 글꼴은 왼쪽 칸 글자만 남겨 줄였다 (fonts/Gowun*.ttf, OFL) — 왼쪽 문구를 바꾸면 원본에서 다시 줄인다.
 * 결과: <out>/banner-a-soft.jpg · banner-b-clean.jpg · banner-c-calm.jpg (1602x504, 지금 배너 801x252 의 2배)
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FONTS = join(HERE, "fonts");

const { values: opt } = parseArgs({
  options: {
    art: { type: "boolean", default: false },
    out: { type: "string", default: join(ROOT, "dumps", "banner-styles") },
    no: { type: "string", default: "제26-00-0000호" },
    from: { type: "string", default: "2026-00-00" },
    to: { type: "string", default: "2027-00-00" },
  },
});
const OUT = resolve(opt.out);
mkdirSync(OUT, { recursive: true });

// 심의받은 문구 — 바꾸지 않는다
const d = (s) => s.replace(/-/g, ".");
const T = {
  firm: "글로벌금융판매(등록번호 2009091278)",
  agent: "보험설계사 강성대(등록번호 20190392060009)",
  op: ["상기 내용은 보험설계사 강성대의 의견이며,", "계약체결에 따른 이익 또는 손실은 보험계약자 등에게 귀속됩니다."],
  sw: [
    "보험계약자가 기존 보험계약을 해지하고 새로운 보험계약을 체결하는 과정에서",
    "1. 질병이력, 연령증가 등으로 가입이 거절되거나 보험료가 인상될 수 있습니다.",
    "2. 가입 상품에 따라 새로운 면책기간 적용 및 보장제한 등 기타 불이익이 발생할 수 있습니다.",
  ],
  valid: "본 광고는 광고심의기준을 준수하였으며, 유효기간은 심의일로부터 1년입니다.",
  no: `글로벌금융판매 준법감시인 심의필 ${opt.no}(${d(opt.from)}~${d(opt.to)})`,
};

// 왼쪽 칸 그림 프롬프트 (글자·사람 얼굴 없이, 부드러운 배경 그림만)
const STYLES = [
  {
    id: "a-soft",
    title: "부드럽고 편안한",
    prompt: "Soft watercolor illustration, a warm cup of tea and an open notebook with a pen on a light wooden table, gentle morning sunlight, a small sprig of dried flowers, pastel peach, cream and muted sage palette, airy, lots of empty space, calm and caring mood, no people.",
  },
  {
    id: "b-clean",
    title: "깔끔하고 단정한",
    prompt: "Minimal elegant abstract background, deep navy blue with very subtle soft paper texture and a few thin fine champagne-gold curved lines, refined, premium, quiet, lots of empty space, no objects, no people.",
  },
  {
    id: "c-calm",
    title: "무난하면서 편안한",
    prompt: "Calm minimal flat illustration, a green leafy plant in a simple ceramic pot beside a stack of neat papers on a soft beige desk, muted sage green and warm beige palette, soft shadows, clean and tidy, lots of empty space, no people.",
  },
];

function art(style) {
  const name = `art-${style.id}`;
  const file = join(OUT, `${name}.png`);
  if (!opt.art) return null;
  if (existsSync(file)) return file; // 이미 만든 그림은 다시 만들지 않는다 (지출 최소)
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "image-gen.mjs"), style.prompt,
    "--out", OUT, "--name", name, "--quality", "low", "--size", "1024x1536"], { stdio: "inherit" });
  if (r.status !== 0 || !existsSync(file)) { console.log(`⚠ ${style.title} 그림 실패 — 그림 없이 만듭니다`); return null; }
  return file;
}

const fontCss = `
@font-face{font-family:P;src:url(${pathToFileURL(join(FONTS, "Pretendard-Regular.otf"))});font-weight:400}
@font-face{font-family:P;src:url(${pathToFileURL(join(FONTS, "Pretendard-Medium.otf"))});font-weight:500}
@font-face{font-family:P;src:url(${pathToFileURL(join(FONTS, "Pretendard-SemiBold.otf"))});font-weight:600}
@font-face{font-family:P;src:url(${pathToFileURL(join(FONTS, "Pretendard-Bold.otf"))});font-weight:700}
@font-face{font-family:GB;src:url(${pathToFileURL(join(FONTS, "GowunBatang-Bold.ttf"))});font-weight:700}
@font-face{font-family:GD;src:url(${pathToFileURL(join(FONTS, "GowunDodum-Regular.ttf"))});font-weight:400}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:801px;height:252px;overflow:hidden}
body{font-family:P,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-0.01em}
.wrap{position:relative;width:801px;height:252px;display:flex}
.left{position:relative;width:216px;height:252px;flex:none;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;overflow:hidden}
.left .bg{position:absolute;inset:0;background-size:cover;background-position:center}
.left .in{position:relative;z-index:3}
.left .deco{position:absolute;inset:0;z-index:2}
.right{flex:1;display:flex;flex-direction:column;justify-content:center}
.firm,.agent{font-weight:700;font-size:13.6px;line-height:1.38}
.p{font-size:10.6px;line-height:1.5}
.gap{height:7px}
.valid{font-weight:600;font-size:11.4px;line-height:1.5}
.no{font-weight:700;font-size:11.8px;line-height:1.5}
`;

const body = (s) => `
<div class="firm">${T.firm}</div>
<div class="agent">${T.agent}</div>
<div class="gap"></div>
<div class="p">${T.op.join("<br>")}</div>
<div class="gap"></div>
<div class="p">${T.sw.join("<br>")}</div>
<div class="sep"></div>
<div class="valid">${T.valid}</div>
<div class="no">${T.no}</div>`;

// 왼쪽 칸 장식 그림 — GPT 없이 코드로 그린다 (2026-11-03 사용자 "클로드 너가 만들어봐", 비용 0). --art 로 GPT 그림을 넣으면 빠진다.
const svg = (inner) => `<svg class="deco" width="216" height="252" viewBox="0 0 216 252" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const leaf = (x, y, r, fill, op) => `<ellipse cx="0" cy="-9" rx="4.6" ry="10" fill="${fill}" opacity="${op}" transform="translate(${x} ${y}) rotate(${r})"/>`;
const DECO = {
  "a-soft": svg(`
    <circle cx="18" cy="22" r="74" fill="#FBEFE4" opacity=".75"/>
    <circle cx="206" cy="238" r="66" fill="#DCE3CF" opacity=".55"/>
    <g transform="translate(150 22)" stroke="#9FAE8C" stroke-width="1.2" fill="none" stroke-linecap="round">
      <path d="M8 46 C 14 30, 24 16, 40 4"/>
    </g>
    <g transform="translate(150 22)">${leaf(14, 36, -60, "#B5C1A2", .9)}${leaf(20, 26, 40, "#C4CDB2", .9)}${leaf(27, 18, -55, "#B5C1A2", .9)}${leaf(34, 10, 35, "#C4CDB2", .9)}</g>
    <g transform="translate(18 196)" stroke="#C8906F" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 12 H34 V17 A16 16 0 0 1 2 17 Z" fill="#FFF8F1"/>
      <path d="M34 15 a6 6 0 0 1 0 11"/>
      <path d="M-4 35 H40"/>
      <path d="M12 8 c-3 -4 3 -6 0 -10"/><path d="M22 8 c-3 -4 3 -6 0 -10"/>
    </g>`),
  "b-clean": svg(`
    <g fill="none" stroke="#C9B27C" stroke-width=".8">
      <circle cx="216" cy="252" r="58" opacity=".35"/><circle cx="216" cy="252" r="82" opacity=".25"/>
      <circle cx="216" cy="252" r="106" opacity=".17"/><circle cx="216" cy="252" r="130" opacity=".1"/>
      <circle cx="0" cy="0" r="46" opacity=".2"/><circle cx="0" cy="0" r="66" opacity=".12"/>
    </g>`),
  "c-calm": svg(`
    <g transform="translate(-6 252)">
      <path d="M0 0 C 20 -30, 40 -52, 74 -74" stroke="#EAF1EE" stroke-width="1.3" fill="none" opacity=".45"/>
      ${leaf(16, -18, 20, "#EAF1EE", .28)}${leaf(26, -32, -70, "#EAF1EE", .22)}${leaf(36, -40, 30, "#EAF1EE", .28)}
      ${leaf(48, -54, -60, "#EAF1EE", .22)}${leaf(58, -60, 40, "#EAF1EE", .28)}${leaf(70, -72, -50, "#EAF1EE", .22)}
    </g>
    <g transform="translate(222 -4) rotate(180)">
      <path d="M0 0 C 14 -20, 28 -34, 50 -48" stroke="#EAF1EE" stroke-width="1.2" fill="none" opacity=".35"/>
      ${leaf(14, -16, 20, "#EAF1EE", .2)}${leaf(26, -28, -60, "#EAF1EE", .16)}${leaf(40, -38, 30, "#EAF1EE", .2)}
    </g>`),
};

const LAYOUT = {
  // ① 부드럽고 편안한 — 크림 바탕, 따뜻한 복숭아·세이지, 손글씨 느낌 명조 이름
  "a-soft": (img) => `
<style>
body{background:#FBF6EF;color:#4A3B32}
.left{background:linear-gradient(160deg,#F6E3D3 0%,#EFD9C6 55%,#E3E6D6 100%)}
.left .bg{${img ? `background-image:url(${pathToFileURL(img)});opacity:.55` : ""}}
.left::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(251,246,239,.15),rgba(251,246,239,.55))}
.kicker{font-family:GD;font-size:14px;color:#9A6B52;letter-spacing:.02em}
.name{font-family:GB;font-weight:700;font-size:40px;color:#5A3B2A;margin-top:2px;letter-spacing:.06em}
.line{width:26px;height:1.5px;background:#C8906F;margin:10px auto 9px;border-radius:2px}
.tag{font-family:GD;font-size:11.5px;color:#7A5C4A}
.right{margin:14px 14px 14px 0;padding:0 22px;background:#FFFDF9;border-radius:18px;box-shadow:0 1px 0 rgba(120,80,50,.05),0 6px 18px rgba(150,110,80,.08)}
.firm,.agent{color:#4A3226}
.p{color:#6B5A4E}
.sep{height:1px;background:#EBDDCF;margin:7px 0 6px}
.valid{color:#5A463A}
.no{color:#A0552F}
</style>
<div class="wrap"><div class="left"><div class="bg"></div>${img ? "" : DECO["a-soft"]}<div class="in">
<div class="kicker">친근한 설계사</div><div class="name">강성대</div><div class="line"></div><div class="tag">보험보다 안부를<br>먼저 묻는 사람</div>
</div></div><div class="right">${body()}</div></div>`,

  // ② 깔끔하고 단정한 — 흰 바탕 + 남색 칸, 금색 가는 선
  "b-clean": (img) => `
<style>
body{background:#FFFFFF;color:#22262E}
.left{background:#1E2A44}
.left .bg{${img ? `background-image:url(${pathToFileURL(img)});opacity:.9` : "background:radial-gradient(120% 80% at 0% 100%,#2A3A5E 0%,#1E2A44 60%)"}}
.kicker{font-size:11.5px;font-weight:500;color:#C9B27C;letter-spacing:.32em;margin-left:.32em}
.name{font-weight:700;font-size:36px;color:#FFFFFF;letter-spacing:.18em;margin:6px 0 0 .18em}
.line{width:22px;height:1px;background:#C9B27C;margin:12px auto 11px}
.tag{font-size:10.8px;font-weight:400;color:#C7CEDB;line-height:1.55}
.right{padding:0 28px 0 30px;border-left:3px solid #C9B27C}
.firm,.agent{color:#1E2A44}
.p{color:#5A616D}
.sep{height:1px;background:#E3E6EB;margin:7px 0 6px}
.valid{color:#2E3440}
.no{color:#1E2A44}
</style>
<div class="wrap"><div class="left"><div class="bg"></div>${img ? "" : DECO["b-clean"]}<div class="in">
<div class="kicker">친근한 설계사</div><div class="name">강성대</div><div class="line"></div><div class="tag">보험보다 안부를<br>먼저 묻는 사람</div>
</div></div><div class="right">${body()}</div></div>`,

  // ③ 무난하면서 편안한 — 따뜻한 회백색 + 차분한 세이지 그린
  "c-calm": (img) => `
<style>
body{background:#F3F1EC;color:#2F3A37}
.left{background:#6E8C83}
.left .bg{${img ? `background-image:url(${pathToFileURL(img)});opacity:.35;mix-blend-mode:luminosity` : ""}}
.kicker{font-size:12.5px;font-weight:500;color:#E4EEE9;letter-spacing:.08em}
.name{font-weight:700;font-size:38px;color:#FFFFFF;letter-spacing:.1em;margin:3px 0 0 .1em}
.line{width:24px;height:2px;border-radius:2px;background:#F3D9A4;margin:10px auto 9px}
.tag{font-size:11px;color:#EAF1EE;line-height:1.55}
.right{margin:12px 12px 12px 14px;padding:0 22px;background:#FFFFFF;border-radius:12px;border:1px solid #E4E0D8}
.firm,.agent{color:#2C4A43}
.p{color:#5C6663}
.sep{height:1px;background:#ECE8E1;margin:7px 0 6px}
.valid{color:#3A4643}
.no{color:#2C4A43}
</style>
<div class="wrap"><div class="left"><div class="bg"></div>${img ? "" : DECO["c-calm"]}<div class="in">
<div class="kicker">친근한 설계사</div><div class="name">강성대</div><div class="line"></div><div class="tag">보험보다 안부를<br>먼저 묻는 사람</div>
</div></div><div class="right">${body()}</div></div>`,
};

const { chromium } = await import("playwright");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 801, height: 252 }, deviceScaleFactor: 2 });
  for (const s of STYLES) {
    const img = art(s);
    // file:// 글꼴은 about:blank 에서 안 읽혀서 파일로 써서 연다
    const html = join(OUT, `.banner-${s.id}.html`);
    writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${fontCss}</style>${LAYOUT[s.id](img)}`);
    await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
    await page.evaluate(() => Promise.all(["400 16px P", "700 16px P", "700 16px GB", "16px GD"].map((f) => document.fonts.load(f, "강")).concat(document.fonts.ready)));
    const missing = await page.evaluate(() => ["P", "GB", "GD"].filter((f) => !document.fonts.check(`16px ${f}`, "강")));
    rmSync(html, { force: true });
    if (missing.length) throw new Error(`글꼴을 못 읽었습니다: ${missing.join(", ")}`);
    // 글자가 칸 밖으로 넘치면 실패로 본다 — 심의 문구가 잘리면 안 된다
    const over = await page.evaluate(() => [...document.querySelectorAll(".right > div")].some((e) => e.scrollWidth > e.clientWidth + 1)
      || document.querySelector(".right").scrollHeight > document.querySelector(".right").clientHeight + 1);
    if (over) throw new Error(`${s.title}: 글자가 칸을 넘칩니다`);
    const file = join(OUT, `banner-${s.id}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 95 });
    console.log(`✅ ${s.title}: ${file}${img ? " (GPT 그림 넣음)" : ""}`);
  }
} finally {
  await browser.close();
}
