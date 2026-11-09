#!/usr/bin/env node
/**
 * 진초록 카드 예시 3장 (2026-11-09 사용자 — "자세·표정이 항상 똑같지 말고 바뀌게, 3장 만들어 봐").
 *   node scripts/cards/green-sample.mjs --out <폴더>
 * 캐릭터는 content/mascot/img/<자세>.png (PC 가 make-mascot 으로 만든 것). 없으면 저장소의 pose-clasp.png.
 * 카드 내용은 예시 — 실제 원고에서는 그 글 본문의 말만 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { greenCardHtml, FIT_SCRIPT, KEY_SCRIPT } from '../lib/cards-green.mjs';
import { launch } from '../lib/overlay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const i = process.argv.indexOf('--out');
const out = i >= 0 ? process.argv[i + 1] : path.join(ROOT, 'dumps/green-sample');
fs.mkdirSync(out, { recursive: true });
const pose = (slug) => {
  const f = [path.join(ROOT, 'content/mascot/img', `${slug}.png`), path.join(ROOT, 'content/mascot/pose-clasp.png')].find((x) => fs.existsSync(x));
  return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
};
const cards = [
  { f: '1-lead', pose: 'pose-magnifier', c: { type: 'lead', keyword: '실비 청구', title: '언제까지\n돼요?', bubble: '청구 기한 · 서류 · 놓치기 쉬운 것', next: '실비 청구 기한 한눈에 보기' } },
  { f: '2-number', pose: 'pose-think', c: { type: 'number', titleHtml: '청구 기한은 <b>3년</b>!', sub: '숫자 하나로 먼저 봐요', big: '3년', items: ['지나면 보험금 청구권이 사라져요'], next: '3년 지난 영수증은 어떻게 하나요' } },
  { f: '3-check', pose: 'pose-thumb', c: { type: 'check', titleHtml: '실비 청구 <b>서류</b>', sub: '진료 금액에 따라 달라져요', items: ['진료비 영수증', '진료비 세부내역서', '약제비 영수증', '진단서 (필요할 때)'], hl: 1, where: '금액별로 필요한 서류' } },
];
const b = await launch();
try {
  for (const { f, pose: p, c } of cards) {
    const page = await b.newPage({ viewport: { width: 1024, height: 1024 } });
    await page.setContent(greenCardHtml(1024, c, { mascot: pose(p) }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(KEY_SCRIPT);
    await page.evaluate(FIT_SCRIPT);
    await page.screenshot({ path: path.join(out, `${f}.png`) });
    await page.close();
    console.log(`카드 예시: ${f}.png`);
  }
} finally { await b.close(); }
