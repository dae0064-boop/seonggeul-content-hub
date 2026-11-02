#!/usr/bin/env node
/**
 * 인스타 카드뉴스 그림 만들기 — 2026-11-02 v2 (사용자: 참고 카드처럼 "사진 바탕 + 굵은 제목"으로).
 *
 *   node scripts/instagram/render-cards.mjs [content/instagram/sets/<날짜>.json] [--out <폴더>] [--only 1,2]
 *
 * 편마다 1080×1080 PNG 7장 = 원고 cards 5장(표지·정보 3·체크) + 6장째 팔로우 + 7장째 심의 고지.
 * 바탕: 편마다 AI 사진 한 장(content/instagram/bg/<slug>.png)을 모든 장에 어둡게 깔아 쓴다.
 *   그 사진은 PC 가 만든다 (클라우드에서는 OpenAI 가 막혀 있다): node scripts/instagram/make-bg.mjs — low 1장 약 10원.
 *   사진이 아직 없으면 bg/_placeholder.png (임시 바탕)로 그린다.
 * 글 안 [대괄호] 는 노란 글씨로 칠한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : ''; };
const only = new Set((opt('--only') || '').split(',').map(Number).filter(Boolean));
const setFile = argv.find((a, i) => a.endsWith('.json') && !['--out', '--only'].includes(argv[i - 1]))
  || path.join(ROOT, 'content/instagram/sets', fs.readdirSync(path.join(ROOT, 'content/instagram/sets')).filter((f) => f.endsWith('.json')).sort().pop());
const day = path.basename(setFile, '.json');
const outRoot = opt('--out') || path.join(ROOT, 'content/instagram/images', day);
const set = JSON.parse(fs.readFileSync(setFile, 'utf8'));

// 심의 고지 — 스레드 배너(content/threads/insurance/banners/base.jpg)와 같은 내용. 심의필 번호는 승인 뒤 편마다 approval 칸에 넣는다.
const NOTICE = {
  agency: '글로벌금융판매(등록번호 2009091278)',
  agent: '보험설계사 강성대(등록번호 20190392060009)',
  opinion: ['상기 내용은 보험설계사 강성대의 의견이며,', '계약체결에 따른 이익 또는 손실은 보험계약자 등에게 귀속됩니다.'],
  replace: ['보험계약자가 기존 보험계약을 해지하고 새로운 보험계약을 체결하는 과정에서',
    '1. 질병이력, 연령증가 등으로 가입이 거절되거나 보험료가 인상될 수 있습니다.',
    '2. 가입 상품에 따라 새로운 면책기간 적용 및 보장제한 등 기타 불이익이 발생할 수 있습니다.'],
  terms: '보험사 상품별로 상이할 수 있으므로, 세부사항은 반드시 해당 약관을 참조하시기바랍니다',
  rule: '본 광고는 광고심의기준을 준수하였으며, 유효기간은 심의일로부터 1년입니다.',
  approval: '글로벌금융판매 준법감시인 심의필 제26-00-0000호(2026.00.00~2027.00.00)',
};

const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');
// setContent 페이지(about:blank)는 file:// 를 못 읽어 글꼴·그림을 base64 로 넣는다
const font = (f) => `data:font/ttf;base64,${b64(f)}`;
const img = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,${b64(f)}`;
const logo = img('content/instagram/logo.png');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hl = (t) => esc(t).replace(/\[([^\]]+)\]/g, '<em>$1</em>');
const lines = (a, cls) => (a || []).map((l) => `<div class="${cls}">${hl(l)}</div>`).join('');

const CSS = `
@font-face{font-family:Head;src:url('${font('scripts/lib/fonts/BlackHanSans-Regular.ttf')}')}
@font-face{font-family:Jua;src:url('${font('scripts/lib/fonts/Jua-Regular.ttf')}')}
@font-face{font-family:Pre;src:url('${font('scripts/threads/fonts/Pretendard-Bold.otf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;position:relative;overflow:hidden;word-break:keep-all;font-family:Pre,sans-serif;color:#fff;background:#111}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.dim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.78) 100%)}
em{font-style:normal;color:#FFD43B}
.page{position:absolute;top:40px;right:48px;font:26px Pre;background:rgba(0,0,0,.45);border-radius:30px;padding:6px 18px}
.brand{position:absolute;left:64px;right:64px;bottom:44px;display:flex;align-items:center;gap:14px;border-top:2px solid rgba(255,255,255,.55);padding-top:16px;font:28px Jua;color:#fff}
.brand img{height:54px;border-radius:8px}
.wrap{position:absolute;top:96px;left:72px;right:72px;bottom:150px;display:flex;flex-direction:column}
.h{font:76px/1.18 Head;letter-spacing:-1px;text-shadow:0 3px 10px rgba(0,0,0,.5)}
.blk{margin-top:44px;display:flex;gap:22px;align-items:flex-start}
.tag{flex:none;font:26px Pre;border:2px solid rgba(255,255,255,.8);border-radius:30px;padding:6px 18px;margin-top:6px}
.ls{display:flex;flex-direction:column}
.l{font-size:38px;line-height:1.55}
.tail{margin-top:34px;font-size:40px;line-height:1.5;color:#FFD43B}
.src{margin-top:auto;font-size:26px;color:rgba(255,255,255,.75)}
.terms{margin-top:14px;font-size:22px;line-height:1.45;color:rgba(255,255,255,.7)}
/* 표지 */
.cv .h{font-size:104px}.cv .kw{font:72px Head;color:#FFD43B;margin-bottom:18px}
.cv .sub{margin-top:46px;font:58px/1.3 Head}
.arrow{position:absolute;right:72px;bottom:150px;font:110px Jua;color:#FFD43B}
/* 체크 */
.ck{font-size:40px;line-height:1.7}.ck b{color:#FFD43B;margin-right:12px}
.cta{margin-top:40px;font-size:38px;line-height:1.7}
/* 팔로우 */
.fw{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:40px}
.fw .h{font-size:70px;line-height:1.35}.fw img{width:300px;border-radius:24px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
/* 고지 */
.nt{position:absolute;top:80px;left:56px;right:56px;bottom:130px;background:rgba(255,255,255,.94);color:#2E2620;border-radius:28px;padding:44px 44px;font-size:24px;line-height:1.55}
.nt h3{font:44px Head;color:#E0642A;margin-bottom:18px}.nt b{display:block;font-size:28px}.nt p{margin-top:14px}.nt .ap{color:#C2551E;font-size:26px}
`;

// ── C안 '잡지형' (2026-11-02 사용자 선택): 위 사진 + 아래 흰 칸, 글꼴 하나(Pretendard), 포인트 색 하나 ──
const MCSS = `
@font-face{font-family:Pre;src:url('${font('scripts/threads/fonts/Pretendard-Bold.otf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;position:relative;overflow:hidden;word-break:keep-all;font-family:Pre,sans-serif;color:#1c1c1c;background:#fff}
.ph{background-size:cover;background-repeat:no-repeat}
em{font-style:normal;color:#C2551E}
.lb{font-size:30px;color:#C2551E;letter-spacing:1px}
.hd{font-size:62px;line-height:1.3;letter-spacing:-1.5px;margin-top:18px}
.bd{font-size:36px;line-height:1.7;color:#555;margin-top:34px}
.bd p+p{margin-top:16px}
.ft{position:absolute;left:80px;right:80px;bottom:52px;display:flex;justify-content:space-between;font-size:24px;color:#a0a0a0}
.in{padding:56px 80px 0}
.st{display:flex;gap:26px;margin-top:30px;font-size:36px;line-height:1.6;color:#444}
.st b{flex:none;width:58px;height:58px;border-radius:50%;background:#C2551E;color:#fff;font-size:32px;line-height:58px;text-align:center;font-weight:normal}
.cp{display:flex;gap:24px;margin-top:36px}.cp>div{flex:1;border-radius:24px;padding:30px 32px;font-size:34px;line-height:1.6;color:#444;background:#F6F3EF}
.cp>div:last-child{background:#FBEDE4}.cp h4{font-size:32px;color:#C2551E;margin-bottom:12px;font-weight:normal}
.ck{font-size:38px;line-height:1.5;margin-top:24px;display:flex;gap:18px}.ck i{font-style:normal;color:#C2551E}
.cta{margin-top:36px;font-size:30px;color:#888;line-height:1.6}
.terms{font-size:22px;line-height:1.5;color:#a0a0a0;margin-top:26px}
.nt{padding:90px 80px;font-size:25px;line-height:1.6;color:#444}.nt h3{font-size:44px;color:#1c1c1c;margin-bottom:26px}.nt b{display:block;font-size:29px;color:#1c1c1c}.nt p{margin-top:16px}.nt .ap{color:#C2551E;font-size:27px}
`;
function mpage(photo, crop, h, inner, i, left) {
  const ph = photo && h ? `<div class="ph" style="height:${h}px;background-image:url('${photo}');background-position:${crop || 'center'}"></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${MCSS}</style></head><body>${ph}${inner}
<div class="ft"><span>${esc(left || '친근한 설계사 강성대')}</span><span>${i} / 7</span></div></body></html>`;
}
function mcard(c, photo, i) {
  const H = (a) => a.map(hl).join('<br>');
  const terms = c.terms ? `<div class="terms">${esc(NOTICE.terms)}</div>` : '';
  const src = c.src ? '근거 · ' + c.src : '';
  switch (c.type) {
    case 'cover': return mpage(photo, c.crop, 560, `<div class="in"><div class="lb">${esc(c.kw)}</div><div class="hd" style="font-size:76px">${H(c.title)}</div><div class="bd" style="margin-top:20px">${esc(c.sub || '')}</div></div>`, i);
    case 'text': return mpage(photo, c.crop, 300, `<div class="in"><div class="lb">${esc(c.label)}</div><div class="hd">${H(c.head)}</div><div class="bd">${c.body.map((t) => `<p>${hl(t)}</p>`).join('')}</div>${terms}</div>`, i, src || undefined);
    case 'steps': return mpage(photo, c.crop, 300, `<div class="in"><div class="lb">${esc(c.label)}</div><div class="hd">${H(c.head)}</div>${c.steps.map(([n, t]) => `<div class="st"><b>${esc(n)}</b><span>${hl(t)}</span></div>`).join('')}${terms}</div>`, i, src || undefined);
    case 'compare': return mpage(photo, c.crop, 300, `<div class="in"><div class="lb">${esc(c.label)}</div><div class="hd">${H(c.head)}</div><div class="cp">${[c.left, c.right].map((x) => `<div><h4>${esc(x.t)}</h4>${x.lines.map(esc).join('<br>')}</div>`).join('')}</div><div class="bd" style="font-size:30px;margin-top:26px">${esc(c.foot || '')}</div>${terms}</div>`, i, src || undefined);
    case 'check': return mpage(photo, c.crop, 300, `<div class="in"><div class="lb">${esc(c.label)}</div><div class="hd">${H(c.head)}</div>${c.checks.map((t) => `<div class="ck"><i>✓</i><span>${hl(t)}</span></div>`).join('')}<div class="cta">${esc(c.cta)}</div></div>`, i);
    default: throw new Error('모르는 카드 종류: ' + c.type);
  }
}
function mnotice(approval) {
  const N = NOTICE;
  return mpage(null, '', 0, `<div class="nt"><h3>꼭 읽어 주세요</h3><b>${esc(N.agency)}</b><b>${esc(N.agent)}</b>
<p>${N.opinion.map(esc).join('<br>')}</p><p>${N.replace.map(esc).join('<br>')}</p><p>${esc(N.terms)}</p><p>${esc(N.rule)}</p><p class="ap">${esc(approval || N.approval)}</p></div>`, 7);
}

function page(bg, inner, i) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="bg" style="background-image:url('${bg}')"></div><div class="dim"></div>${inner}
<div class="page">${i}/7</div><div class="brand"><img src="${logo}">친근한 설계사 강성대의 보험 이야기</div></body></html>`;
}

function card(c, bg, i) {
  if (c.type === 'cover') {
    return page(bg, `<div class="wrap cv"><div class="kw">${esc(c.kw)}</div><div class="h">${c.title.map(hl).join('<br>')}</div><div class="sub">${c.sub.map(hl).join('<br>')}</div></div><div class="arrow">➜</div>`, i);
  }
  if (c.type === 'check') {
    return page(bg, `<div class="wrap"><div class="h">${c.head.map(hl).join('<br>')}</div>
<div class="blk"><div class="tag">체크</div><div class="ls">${c.checks.map((t) => `<div class="ck"><b>✔</b>${hl(t)}</div>`).join('')}</div></div>
<div class="cta">${c.cta.map((t) => `📌 ${hl(t)}`).join('<br>')}</div></div>`, i);
  }
  return page(bg, `<div class="wrap"><div class="h">${c.head.map(hl).join('<br>')}</div>
<div class="blk">${c.tag ? `<div class="tag">${esc(c.tag)}</div>` : ''}<div class="ls">${lines(c.body, 'l')}</div></div>
${c.tail ? `<div class="tail">${c.tail.map(hl).join('<br>')}</div>` : ''}
${c.src ? `<div class="src">근거 · ${esc(c.src)}</div>` : ''}${c.terms ? `<div class="terms"${c.src ? '' : ' style="margin-top:auto"'}>${esc(NOTICE.terms)}</div>` : ''}</div>`, i);
}

const follow = (bg) => page(bg, `<div class="fw"><div class="h">팔로우하시면<br><em>생활 속 보험 이야기</em><br>꾸준히 알려드릴게요!</div><img src="${logo}"></div>`, 6);

function notice(bg, approval) {
  const N = NOTICE;
  return page(bg, `<div class="nt"><h3>꼭 읽어 주세요</h3><b>${esc(N.agency)}</b><b>${esc(N.agent)}</b>
<p>${N.opinion.map(esc).join('<br>')}</p><p>${N.replace.map(esc).join('<br>')}</p><p>${esc(N.terms)}</p><p>${esc(N.rule)}</p>
<p class="ap">${esc(approval || N.approval)}</p></div>`, 7);
}

const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
let made = 0;
for (const p of set.posts) {
  if (only.size && !only.has(p.no)) continue;
  const mag = p.style === 'magazine';
  const need = mag ? 6 : 5;
  if (p.cards.length !== need) throw new Error(`${p.no}편: 카드는 ${need}장이어야 해요 (나머지는 저절로) — 지금 ${p.cards.length}장`);
  const bgFile = fs.existsSync(path.join(ROOT, `content/instagram/bg/${p.slug}.png`)) ? `content/instagram/bg/${p.slug}.png` : 'content/instagram/bg/_placeholder.png';
  const bg = img(bgFile);
  const dir = path.join(outRoot, `${p.no}-${p.slug}`);
  fs.mkdirSync(dir, { recursive: true });
  const htmls = mag
    ? [...p.cards.map((c, k) => mcard(c, bg, k + 1)), mnotice(p.approval)]
    : [...p.cards.map((c, k) => card(c, bg, k + 1)), follow(bg), notice(bg, p.approval)];
  for (let k = 0; k < htmls.length; k++) {
    await pg.setContent(htmls[k], { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    // 넘침: 본문이 아래 줄(.ft)을 덮거나 칸을 넘치면 멈춘다
    const over = await pg.evaluate(() => {
      if ([...document.querySelectorAll('.wrap,.nt')].some((w) => w.scrollHeight > w.clientHeight + 2)) return true;
      const ft = document.querySelector('.ft'); const inn = document.querySelector('.in,.nt');
      return !!(ft && inn && inn.getBoundingClientRect().bottom > ft.getBoundingClientRect().top - 10);
    });
    if (over) throw new Error(`${p.no}편 ${k + 1}장: 글이 칸을 넘쳐요 — 줄을 줄여 주세요`);
    await pg.screenshot({ path: path.join(dir, String(k + 1).padStart(2, '0') + '.png') });
    made++;
  }
  console.log(`✅ ${p.no}편 ${p.slug} — 7장 (바탕 ${path.basename(bgFile)}) → ${path.relative(ROOT, dir)}`);
}
await browser.close();
console.log(`그림 ${made}장 (글자는 직접 그림 — 비용은 바탕 AI 사진 편당 1장뿐)`);
