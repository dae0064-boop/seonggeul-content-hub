#!/usr/bin/env node
/**
 * 인스타 카드뉴스 바탕 사진 만들기 — PC 에서만 (클라우드는 OpenAI 가 막혀 있다).
 *
 *   node scripts/instagram/make-bg.mjs --out <Drive ClaudeWorkspace\인스타카드뉴스\bg>
 *
 * content/instagram/sets/*.json 의 편마다 bg_prompt 로 AI 사진 1장(low, 1024x1024, 약 10원)을 만든다.
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
const dir = path.join(ROOT, 'content/instagram/sets');
let made = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).posts || []) {
    if (!p.bg_prompt) continue;
    if (fs.existsSync(path.join(ROOT, 'content/instagram/bg', `${p.slug}.png`)) || fs.existsSync(path.join(out, `${p.slug}.png`))) continue;
    console.log(`바탕 만들기: ${p.slug}`);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), p.bg_prompt, '--quality', 'low', '--size', '1024x1024', '--out', out, '--name', p.slug], { stdio: 'inherit' });
    made++;
  }
}
console.log(made ? `인스타 바탕 사진 ${made}장 만듦 → ${out}` : '');
