#!/usr/bin/env node
/**
 * 인스타 카드뉴스 바탕 사진 만들기 — PC 에서만 (클라우드는 OpenAI 가 막혀 있다).
 *
 *   node scripts/instagram/make-bg.mjs --out <Drive ClaudeWorkspace\인스타카드뉴스\bg>
 *
 * content/instagram/sets/*.json·examples/*.json 의 편마다 bg_prompt 로 AI 사진 1장(low, 1024x1024, 약 10원)을 만든다.
 * 저장소에 content/instagram/bg/<slug>.png 가 이미 있거나 --out 폴더에 <slug>.png 가 있으면 만들지 않는다(같은 그림 두 번 만들지 않기).
 * 클라우드 대화가 Drive 에서 그 사진을 받아 저장소 bg/ 에 넣고 카드를 다시 그린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const i = process.argv.indexOf('--out');
const out = i >= 0 ? process.argv[i + 1] : '';
if (!out) { console.log('사용법: node scripts/instagram/make-bg.mjs --out <폴더>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
// 예시(examples/)도 그린다 (2026-11-05 사용자 — "배경을 항상 주제에 맞게 GPT 로 그려 와야지". 임시 바탕으로 보여 주지 않는다)
const files = ['sets', 'examples'].flatMap((d) => { const dir = path.join(ROOT, 'content/instagram', d); return fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort().map((x) => path.join(dir, x)) : []; });
let made = 0;
for (const f of files) {
  for (const p of JSON.parse(fs.readFileSync(f, 'utf8')).posts || []) {
    if (!p.bg_prompt) continue;
    if (fs.existsSync(path.join(ROOT, 'content/instagram/bg', `${p.slug}.png`)) || fs.existsSync(path.join(out, `${p.slug}.png`))) continue;
    console.log(`바탕 만들기: ${p.slug}`);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), p.bg_prompt, '--quality', 'low', '--size', '1024x1024', '--out', out, '--name', p.slug], { stdio: 'inherit' });
    made++;
  }
}
// 캐릭터 (2026-11-02 사용자 승인) — content/instagram/character/prompts.json → <out>/../character/<slug>.png
const cf = path.join(ROOT, 'content/instagram/character/prompts.json');
if (fs.existsSync(cf)) {
  const c = JSON.parse(fs.readFileSync(cf, 'utf8'));
  const cout = path.join(path.dirname(out), 'character');
  fs.mkdirSync(cout, { recursive: true });
  for (const it of c.items || []) {
    if (fs.existsSync(path.join(cout, `${it.slug}.png`))) continue;
    console.log(`캐릭터 만들기: ${it.slug}`);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), `${c.base} ${it.pose}`, '--quality', 'low', '--size', '1024x1024', '--out', cout, '--name', it.slug], { stdio: 'inherit' });
    made++;
  }
  // v2: 그림체 4가지 (item 마다 prompt 전체)
  for (const it of c.items_v2 || []) {
    if (fs.existsSync(path.join(cout, `${it.slug}.png`))) continue;
    console.log(`캐릭터 만들기: ${it.slug}`);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), it.prompt, '--quality', 'low', '--size', '1024x1024', '--out', cout, '--name', it.slug], { stdio: 'inherit' });
    made++;
  }
  // 사진 고치기 (2026-11-02 사용자 — 프로필 사진에서 글자만 빼고 사람은 그대로): source 사진 → images/edits
  for (const it of c.items_edit || []) {
    if (fs.existsSync(path.join(cout, `${it.slug}.png`))) continue;
    console.log(`사진 고치기: ${it.slug}`);
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-edit.mjs'), path.join(ROOT, it.source), it.prompt, '--quality', it.quality || 'low', '--size', it.size || '1024x1536', '--out', cout, '--name', it.slug], { stdio: 'inherit' });
      made++;
    } catch { console.log(`⚠ ${it.slug} 고치기 실패 — 다음 실행 때 다시`); }
  }
}
// 블로그 배너 시안 (2026-11-02 사용자 — "GPT 에 요청해서 만들어와 봐") — content/blog-banner/prompts.json → ClaudeWorkspace/블로그배너/<slug>.png
const bf = path.join(ROOT, 'content/blog-banner/prompts.json');
if (fs.existsSync(bf)) {
  const b = JSON.parse(fs.readFileSync(bf, 'utf8'));
  const bout = path.join(path.dirname(path.dirname(out)), '블로그배너');
  fs.mkdirSync(bout, { recursive: true });
  for (const it of b.items || []) {
    if (fs.existsSync(path.join(bout, `${it.slug}.png`)) || fs.existsSync(path.join(ROOT, 'content/blog-banner/src', `${it.slug}.png`))) continue;
    console.log(`배너 그림 만들기: ${it.slug}`);
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), it.prompt, '--quality', 'low', '--size', it.size || '1024x1024', '--out', bout, '--name', it.slug], { stdio: 'inherit' });
      made++;
    } catch (e) { console.log(`배너 그림 실패: ${it.slug} — ${e.message}`); }
  }
}
console.log(made ? `인스타 바탕·캐릭터 사진 ${made}장 만듦 → ${out}` : '');
