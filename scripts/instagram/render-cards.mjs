#!/usr/bin/env node
/**
 * 인스타 카드뉴스 그림 만들기 — 글자 카드라 OpenAI 를 쓰지 않는다 (비용 0).
 *
 *   node scripts/instagram/render-cards.mjs [content/instagram/sets/<날짜>.json] [--out <폴더>]
 *
 * 편마다 1080×1080 PNG 7장: 원고 cards 6장 + 7장째 심의 고지(설계사 정보·심의필 자리표시·약관 참조 문구).
 * 기본 출력: content/instagram/images/<날짜>/<번호>-<slug>/01.png …
 * 글 안 [대괄호] 는 주황 형광펜으로 칠한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const outArg = oi >= 0 ? argv[oi + 1] : '';
const setFile = argv.find((a, i) => a.endsWith('.json') && argv[i - 1] !== '--out')
  || path.join(ROOT, 'content/instagram/sets', fs.readdirSync(path.join(ROOT, 'content/instagram/sets')).filter((f) => f.endsWith('.json')).sort().pop());
const day = path.basename(setFile, '.json');
const outRoot = outArg || path.join(ROOT, 'content/instagram/images', day);
const set = JSON.parse(fs.readFileSync(setFile, 'utf8'));

// 심의 고지 — 스레드 배너(content/threads/insurance/banners/base.jpg)와 같은 내용. 심의필 번호는 승인 뒤 바꾼다.
const NOTICE = {
  agency: '글로벌금융판매(등록번호 2009091278)',
  agent: '보험설계사 강성대(등록번호 20190392060009)',
  opinion: ['상기 내용은 보험설계사 강성대의 의견이며,', '계약체결에 따른 이익 또는 손실은 보험계약자 등에게 귀속됩니다.'],
  replace: ['보험계약자가 기존 보험계약을 해지하고 새로운 보험계약을 체결하는 과정에서',
    '1. 질병이력, 연령증가 등으로 가입이 거절되거나 보험료가 인상될 수 있습니다.',
    '2. 가입 상품에 따라 새로운 면책기간 적용 및 보장제한 등 기타 불이익이 발생할 수 있습니다.'],
  terms: '보험사 상품별로 상이할 수 있으므로, 세부사항은 반드시 해당 약관을 참조하시기바랍니다',
  rule: '본 광고는 광고심의기준을 준수하였으며, 유효기간은 심의일로부터 1년입니다.',
  approval: process.env.APPROVAL || '글로벌금융판매 준법감시인 심의필 제26-00-0000호(2026.00.00~2027.00.00)',
};
const TERMS = NOTICE.terms;

// setContent 페이지(about:blank)는 file:// 글꼴을 못 읽어 base64 로 넣는다
const font = (f) => `data:font/${f.endsWith('.otf') ? 'otf' : 'ttf'};base64,` + fs.readFileSync(path.join(ROOT, f)).toString('base64');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'content/instagram/logo.png')).toString('base64');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hl = (t) => esc(t).replace(/\[([^\]]+)\]/g, '<mark>$1</mark>');

const CSS = `
@font-face{font-family:Jua;src:url('${font('scripts/lib/fonts/Jua-Regular.ttf')}')}
@font-face{font-family:Pre;src:url('${font('scripts/threads/fonts/Pretendard-Bold.otf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;background:#FFF4E8;font-family:Pre,sans-serif;color:#3A2A1F;position:relative;overflow:hidden;word-break:keep-all}
.page{position:absolute;top:44px;right:56px;font:28px Pre;color:#B08B70}
.foot{position:absolute;left:0;right:0;bottom:0;height:96px;display:flex;align-items:center;gap:16px;padding:0 64px;border-top:3px solid #F3D9C3;background:#FFEBD8}
.foot img{height:72px;border-radius:10px}.foot span{font:30px Jua;color:#C2551E}
.wrap{position:absolute;top:110px;left:72px;right:72px;bottom:130px;display:flex;flex-direction:column}
h2{font:58px/1.25 Jua;color:#E0642A;margin-bottom:34px}
p.l{font-size:42px;line-height:1.6}
mark{background:linear-gradient(transparent 52%,#FFC79A 52%);color:inherit;padding:0 4px}
.src{margin-top:auto;align-self:flex-start;font-size:30px;color:#fff;background:#E0642A;border-radius:40px;padding:12px 28px}
.terms{margin-top:auto;font-size:25px;line-height:1.5;color:#7A6252;border-top:2px dashed #E8C7AC;padding-top:18px}
/* 표지 */
.cover{position:absolute;inset:0;background:#E9672B;color:#fff;padding:120px 80px}
.cover .kw{display:inline-block;font:64px Jua;background:#FFF4E8;color:#E0642A;border-radius:18px;padding:10px 28px;margin-bottom:40px}
.cover h1{font:112px/1.22 Jua}
.cover .sub{margin-top:46px;font-size:46px;display:inline-block;border-bottom:6px solid #FFD2AE;padding-bottom:6px}
.cover .arrow{position:absolute;right:80px;bottom:150px;font:120px Jua;color:#FFD2AE}
.cover .page{color:#FFD2AE}.cover .foot{background:#D85A20;border-top:none}.cover .foot span{color:#fff}
/* 말풍선 */
.q{background:#fff;border:3px solid #F1CFB3;border-radius:36px 36px 36px 8px;padding:26px 34px;font-size:40px;line-height:1.45;margin-bottom:26px;max-width:880px}
.a{margin-top:20px;align-self:flex-end;background:#E9672B;color:#fff;border-radius:36px 36px 8px 36px;padding:28px 36px;font-size:42px;line-height:1.5;max-width:880px}
/* 예시 */
.row{background:#fff;border-radius:28px;padding:28px 34px;margin-bottom:26px;border-left:14px solid #F2A06E}
.row b{display:block;font-size:34px;color:#8A6A55;margin-bottom:8px;font-weight:normal}
.row div{font-size:40px;line-height:1.45}.row .r{color:#C2551E;margin-top:10px}
.fx{margin-top:auto;font-size:32px;color:#8A6A55}
/* 체크 */
.ck{display:flex;gap:22px;align-items:flex-start;background:#fff;border-radius:26px;padding:24px 30px;margin-bottom:22px;font-size:40px;line-height:1.4}
.ck i{flex:none;width:52px;height:52px;border-radius:14px;background:#E9672B;color:#fff;font:40px/52px Jua;text-align:center;font-style:normal}
.cta{margin-top:auto;font-size:34px;line-height:1.6;color:#C2551E}
/* 고지 */
.n{font-size:24px;line-height:1.5;color:#4A3A2E}.n b{font-size:29px;display:block}
.n .g{margin-top:14px}.n .ap{margin-top:18px;font-size:26px;color:#C2551E}
`;

function page(inner, i, extra = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body${extra}>${inner}
<div class="page">${i}/7</div><div class="foot"><img src="${logo}"><span>친근한 설계사 강성대 · 보험보다 안부를 먼저 묻는 사람</span></div></body></html>`;
}

function card(c, i) {
  const terms = c.terms ? `<div class="terms">${esc(TERMS)}</div>` : '';
  switch (c.type) {
    case 'cover':
      return page(`<div class="cover"><div class="kw">${esc(c.kw)}</div><h1>${c.title.map(esc).join('<br>')}</h1><div class="sub">${esc(c.sub)}</div><div class="arrow">→</div></div>`, i);
    case 'talk':
      return page(`<div class="wrap"><h2>${esc(c.head)}</h2>${c.quotes.map((q) => `<div class="q">“${esc(q)}”</div>`).join('')}<div class="a">${c.answer.map(hl).join('<br>')}</div></div>`, i);
    case 'fact': case 'note':
      return page(`<div class="wrap"><h2>${esc(c.head)}</h2>${c.lines.map((l) => `<p class="l">${hl(l)}</p>`).join('')}${c.source ? `<div class="src">근거 · ${esc(c.source)}</div>` : ''}${terms}</div>`, i);
    case 'example':
      return page(`<div class="wrap"><h2>${esc(c.head)}</h2>${c.rows.map((r) => `<div class="row"><b>${esc(r[0])}</b><div>${esc(r[1])}</div><div class="r">→ ${esc(r[2])}</div></div>`).join('')}<div class="fx">${esc(c.foot || '')}</div>${terms}</div>`, i);
    case 'check':
      return page(`<div class="wrap"><h2>${esc(c.head)}</h2>${c.items.map((t) => `<div class="ck"><i>✓</i><span>${esc(t)}</span></div>`).join('')}<div class="cta">${c.cta.map(esc).join('<br>')}</div></div>`, i);
    default: throw new Error('모르는 카드 종류: ' + c.type);
  }
}

function notice(i) {
  const N = NOTICE;
  return page(`<div class="wrap" style="top:96px"><h2 style="font-size:48px;margin-bottom:20px">꼭 읽어 주세요</h2><div class="n"><b>${esc(N.agency)}</b><b>${esc(N.agent)}</b>
<div class="g">${N.opinion.map(esc).join('<br>')}</div><div class="g">${N.replace.map(esc).join('<br>')}</div>
<div class="g">${esc(N.terms)}</div><div class="g">${esc(N.rule)}</div><div class="ap">${esc(N.approval)}</div></div></div>`, i);
}

const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
let made = 0;
for (const p of set.posts) {
  if (p.cards.length !== 6) throw new Error(`${p.no}편: 카드는 6장이어야 해요 (7장째는 고지) — 지금 ${p.cards.length}장`);
  const dir = path.join(outRoot, `${p.no}-${p.slug}`);
  fs.mkdirSync(dir, { recursive: true });
  const htmls = [...p.cards.map((c, k) => card(c, k + 1)), notice(7)];
  for (let k = 0; k < htmls.length; k++) {
    await pg.setContent(htmls[k], { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    // 넘침 검사: 본문 칸이 아래 띠를 덮으면 멈춘다
    const over = await pg.evaluate(() => { const w = document.querySelector('.wrap'); return w ? w.scrollHeight > w.clientHeight + 2 : false; });
    if (over) throw new Error(`${p.no}편 ${k + 1}장: 글이 칸을 넘쳐요 — 줄을 줄여 주세요`);
    await pg.screenshot({ path: path.join(dir, String(k + 1).padStart(2, '0') + '.png') });
    made++;
  }
  console.log(`✅ ${p.no}편 ${p.slug} — 7장 → ${path.relative(ROOT, dir)}`);
}
await browser.close();
console.log(`그림 ${made}장 (글자 카드, OpenAI 비용 0원)`);
