#!/usr/bin/env node
/**
 * 이슈 글감을 고르기 전에 "보기 좋은 고화질 사진이 있는가"를 먼저 본다 (2026-11-04 사용자 — "사진이 제일 중요", "이런 좋은 사진이 있는데 왜 이상한 사진을 고르냐").
 * 크기만 보고 고르지 않는다 — 후보를 여러 장 작게 받아 두고, 원고를 쓰는 Claude 가 Read 로 **직접 눈으로 보고** 고른다:
 * 웃거나 밝은 표정 · 얼굴이 정면에 가깝고 크게 · 배경이 깔끔 · 최근 사진 · 흔들림·눈 감음·입 벌림·어두운 조명 없는 것.
 * 클라우드에서 돈다(위키미디어 공용은 열려 있다). 유튜브는 클라우드에서 막혀 있어 WebSearch 로 공식 클립이 있는지 따로 본다.
 *
 *   node scripts/photo-check.mjs "Son Ye-jin" "손예진"            ← 인물 (혼자 나온 사진)
 *   node scripts/photo-check.mjs --scene "honey jar" "꿀병"        ← 사물·장소
 *   [--out <폴더>]  후보 작은 그림을 둘 곳 (기본: 임시 폴더 photo-check/<이름>)
 *
 * 결과: 후보마다 번호·파일 이름·원본 크기·라이선스·작은 그림 경로. 쓸 수 있는 후보가 없으면 종료 코드 1 → 그 글감은 뒤로.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const scene = argv.includes('--scene');
const oi = argv.indexOf('--out');
const outArg = oi >= 0 ? argv[oi + 1] : '';
const words = argv.filter((a, i) => a !== '--scene' && a !== '--out' && i !== oi + 1);
if (!words.length) { console.log('사용법: node scripts/photo-check.mjs [--scene] "<영어 이름>" "<한글 이름>" [--out 폴더]'); process.exit(2); }
const [en, ko] = [words[0], words[1] || words[0]];
const UA = 'SeonggeulBlogPhotoBot/1.0 (https://github.com/dae0064-boop/seonggeul-content-hub; personal blog tool)';
const MIN = scene ? 1200 : 1000;
const OK_LIC = /^(CC0|Public domain|CC BY(-SA)? [\d.]+|CC BY [\d.]+|KOGL Type 1)/i;
const GROUP = /\b(group|members|cast|and|with|&)\b|단체|멤버|출연진|일동/i;
const out = outArg || path.join(os.tmpdir(), 'photo-check', (en || ko).replace(/[^\w가-힣]+/g, '_'));
fs.mkdirSync(out, { recursive: true });

const api = (params) => 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params });
async function getJson(u) { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const seen = new Map();
for (const q of [...new Set([en, ko].filter(Boolean))]) {
  const d = await getJson(api({ action: 'query', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '500' }));
  for (const p of Object.values(d?.query?.pages || {})) {
    const ii = p.imageinfo?.[0]; if (!ii || seen.has(p.title)) continue;
    const md = ii.extmetadata || {}; const lic = strip(md.LicenseShortName?.value);
    if (!OK_LIC.test(lic) || String(md.NonFree?.value) === 'true') continue;
    const name = p.title.replace(/^File:/, '');
    if (!scene) {
      const t = name.toLowerCase().replace(/_/g, ' ');
      if (![en, ko].some((n) => n && t.includes(n.toLowerCase()))) continue; // 파일 이름에 그 사람 이름
      if (GROUP.test(name.replace(/_/g, ' '))) continue; // 단체 사진 빼기
    }
    let w = ii.width, h = ii.height, use = p.title;
    if (Math.min(w, h) < MIN && /\(cropped\)/i.test(name)) { // 잘린 파일이 작으면 원본 크기를 본다
      const orig = p.title.replace(/\s*\(cropped\)(?=\.\w+$)/i, '');
      const o = await getJson(api({ action: 'query', titles: orig, prop: 'imageinfo', iiprop: 'size' })).catch(() => null);
      const oi2 = Object.values(o?.query?.pages || {})[0]?.imageinfo?.[0];
      if (oi2 && Math.min(oi2.width, oi2.height) >= MIN) { w = oi2.width; h = oi2.height; use = orig; }
    }
    if (Math.min(w, h) < (scene ? MIN : 700)) continue;
    seen.set(p.title, { use, w, h, lic, thumb: ii.thumburl, desc: strip(md.ImageDescription?.value).slice(0, 80), date: strip(md.DateTimeOriginal?.value).slice(0, 10) });
  }
}
const list = [...seen.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
if (!list.length) { console.log(`❌ ${ko}: 쓸 만한 고화질 ${scene ? '사진' : '단독 인물 사진'} 없음 — 공식 유튜브 클립(WebSearch)도 없으면 이 글감은 뒤로 미룬다`); process.exit(1); }
console.log(`후보 ${list.length}장 — 작은 그림을 Read 로 열어 보고 가장 보기 좋은 것(밝은 표정·정면·깔끔한 배경·최근)을 고른다:`);
for (const [i, c] of list.entries()) {
  const f = path.join(out, `${i + 1}.jpg`);
  try { const r = await fetch(String(c.thumb).replace('//thumb.wikimedia.org/', '//upload.wikimedia.org/'), { headers: { 'User-Agent': UA } }); if (r.ok) fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); } catch { /* 작은 그림 못 받음 */ }
  console.log(`${i + 1}. ${c.use}  ${c.w}×${c.h}  ${c.lic}  ${c.date || ''}  ${c.desc}\n   작은 그림: ${fs.existsSync(f) ? f : '(못 받음)'}`);
}
// 한 장으로 모아 보기 (contact.png) — Read 한 번으로 후보를 모두 눈으로 비교한다
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const cells = list.map((c, i) => { const f = path.join(out, `${i + 1}.jpg`); return fs.existsSync(f) ? `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${i + 1} · ${c.w}×${c.h}</figcaption></figure>` : ''; }).join('');
  await pg.setContent(`<style>body{margin:0;display:flex;flex-wrap:wrap;background:#fff;font:bold 18px sans-serif}figure{margin:4px;text-align:center}img{height:280px}</style>${cells}`);
  await pg.screenshot({ path: path.join(out, 'contact.png'), fullPage: true });
  await b.close();
  console.log(`\n모아 보기: ${path.join(out, 'contact.png')} ← 이것을 Read 로 열어 고른다`);
} catch (e) { console.log(`(모아 보기 못 만듦: ${e.message.split('\n')[0]} — 작은 그림을 하나씩 연다)`); }
console.log(`\n고른 뒤 계획서: "photo": {"file": "<위 파일 이름>", "query": "${ko}", "query_en": "${en}"${scene ? '' : `, "person": ["${en}", "${ko}"]`}} — 얼굴이 가운데가 아니면 overlay.focus 로 맞춘다`);
