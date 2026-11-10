#!/usr/bin/env node
/**
 * 인스타 카드뉴스 — GOMS 승인(적격) 난 편의 "올릴 그림" 만들기 (2026-11-02 사용자 — "보험심의를 자동으로 올리는 걸 진행").
 *
 *   node scripts/instagram/finalize.mjs --approved <goms-approved-insta.tsv>
 *
 * tsv 한 줄: 번호<TAB>제26-11-0123호<TAB>2026-11-05<TAB>2027-11-04<TAB>적격<TAB>읽은 날  (PC 의 goms-ad.mjs --prefix "인스타 카드뉴스" --approved 가 적는다)
 * 편마다 content/instagram/final/<번호>/ 에:
 *   - 01~(N-1).jpg = 심의받은 Word 에 들어간 그림(content/instagram/images/<날짜>/<번호>-<slug>/*.png) 그대로 JPEG 로만 바꿈
 *     (인스타 API 는 JPEG 만 받는다). 다시 그리지 않는다 — 심의받은 그림과 한 글자도 달라지면 안 된다.
 *   - 마지막 장(심의 고지)만 그 편의 심의필 번호·유효기간을 넣어 다시 그린다 (스레드 배너와 같은 방식).
 *   - approval.txt = 넣은 심의필 문구. 표의 번호·기간이 바뀌면 그 편을 다시 만든다.
 * 클라우드 아침 확인(routines/morning-check.md 5-3)이 돌려 PR → main. PC 는 main 의 공개 주소로 그림을 가져가 올린다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (n, d = '') => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const tsv = arg('--approved');
if (!tsv || !fs.existsSync(tsv)) { console.error('--approved <goms-approved-insta.tsv> 파일이 필요해요'); process.exit(1); }

const dot = (d) => d.replace(/-/g, '.');
const approvals = new Map(); // 편마다 마지막 줄이 지금 상태
for (const line of fs.readFileSync(tsv, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const c = line.split('\t').map((x) => x.trim());
  if (/^\d+$/.test(c[0] || '') && c.length >= 5) approvals.set(Number(c[0]), { no: c[1], start: c[2], end: c[3], result: c[4] });
}

// 편 번호 → 원고 (sets/*.json 전부에서 찾는다 — 편 번호는 날짜가 바뀌어도 이어 붙인다)
const setsDir = path.join(ROOT, 'content/instagram/sets');
const posts = new Map();
for (const f of fs.readdirSync(setsDir).filter((x) => x.endsWith('.json')).sort()) {
  const set = JSON.parse(fs.readFileSync(path.join(setsDir, f), 'utf8'));
  for (const p of set.posts) {
    if (posts.has(p.no)) { console.error(`❌ ${p.no}편 번호가 두 원고에 있어요 (${posts.get(p.no).day}, ${f}) — 편 번호는 겹치면 안 돼요`); process.exit(1); }
    posts.set(p.no, { day: path.basename(f, '.json'), post: p, set });
  }
}

let browser; let made = 0;
for (const [n, a] of [...approvals].sort((x, y) => x[0] - y[0])) {
  if (a.result !== '적격' || !/^제\d{2}-\d{2}-\d{3,5}호$/.test(a.no) || !a.start || !a.end) continue;
  const hit = posts.get(n);
  if (!hit) { console.log(`⚠ ${n}편: 원고(sets/*.json)에 없어요 — 건너뜀`); continue; }
  const text = `글로벌금융판매 준법감시인 심의필 ${a.no}(${dot(a.start)}~${dot(a.end)})`;
  const dir = path.join(ROOT, 'content/instagram/final', String(n));
  const mark = path.join(dir, 'approval.txt');
  if (fs.existsSync(mark) && fs.readFileSync(mark, 'utf8').trim() === text) continue;
  const src = path.join(ROOT, 'content/instagram/images', hit.day, `${n}-${hit.post.slug}`);
  const pngs = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => /^\d{2}\.png$/.test(f)).sort() : [];
  if (pngs.length < 7) { console.log(`⚠ ${n}편: 심의받은 카드 그림이 ${pngs.length}장이에요 (${path.relative(ROOT, src)}) — 건너뜀`); continue; }

  // 마지막 장만 심의필 번호를 넣어 다시 그린다 — 그 편만 담은 임시 원고로 render-cards.mjs 를 돌린다
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-final-'));
  const one = { ...hit.set, posts: [{ ...hit.post, approval: text }] };
  fs.writeFileSync(path.join(tmp, 'set.json'), JSON.stringify(one));
  // 2026-11-10: 한 편이 그리기 검사(옛 원고 bg_prompt 등)에 걸려도 뒤 편은 계속 만든다 — 1~6편 때문에 8~10편이 막혔다
  try {
    execFileSync('node', [path.join(ROOT, 'scripts/instagram/render-cards.mjs'), path.join(tmp, 'set.json'), '--out', path.join(tmp, 'out')], { stdio: ['ignore', 'inherit', 'pipe'] });
  } catch (e) {
    const why = String(e.stderr || e.message).split('\n').find((l) => /Error:/.test(l)) || e.message;
    console.log(`⚠ ${n}편: 마지막 장을 다시 그리지 못했어요 — ${why.trim()} — 건너뜀`);
    continue;
  }
  const redrawn = path.join(tmp, 'out', `${n}-${hit.post.slug}`);
  const last = pngs[pngs.length - 1];
  if (!fs.existsSync(path.join(redrawn, last))) throw new Error(`${n}편: 다시 그린 마지막 장(${last})이 없어요`);

  browser ||= await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const f of pngs) {
    const from = f === last ? path.join(redrawn, f) : path.join(src, f);
    const b64 = fs.readFileSync(from).toString('base64');
    await pg.setContent(`<html><body style="margin:0"><img src="data:image/png;base64,${b64}" style="display:block;width:1080px;height:1080px"></body></html>`, { waitUntil: 'load' });
    await pg.screenshot({ path: path.join(dir, f.replace('.png', '.jpg')), type: 'jpeg', quality: 92 });
  }
  await pg.close();
  fs.writeFileSync(mark, text + '\n', 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✅ ${n}편 ${hit.post.slug} — ${pngs.length}장 JPEG, 마지막 장에 ${text} → ${path.relative(ROOT, dir)}`);
  made++;
}
if (browser) await browser.close();
console.log(made ? `올릴 그림 ${made}편 만듦 — 같은 PR 에 content/instagram/final/ 을 넣어 main 에 합쳐 주세요` : '새로 만들 편 없음');
