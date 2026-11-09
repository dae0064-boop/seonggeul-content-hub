#!/usr/bin/env node
/**
 * 블로그 배너용 GPT 그림 만들기 — PC 에서만 (OpenAI 키가 PC .env 에 있다). 2026-11-09 사용자 "배너 전용 실행기로".
 *   node scripts/blog-banner/make-gpt.mjs --out <Drive ClaudeWorkspace\블로그배너> [--only soft-]
 * content/blog-banner/prompts.json 의 그림 중 아직 없는 것만 low 로 만든다(같은 그림 두 번 만들지 않기).
 */
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = A('--out', ''); const only = A('--only', '');
if (!out) { console.log('사용법: node scripts/blog-banner/make-gpt.mjs --out <폴더> [--only soft-]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/blog-banner/prompts.json'), 'utf8')).items.filter(it => !only || it.slug.startsWith(only));
let made = 0, skip = 0, fail = 0;
for (const it of items) {
  if (fs.existsSync(path.join(out, `${it.slug}.png`)) || fs.existsSync(path.join(ROOT, 'content/blog-banner/src', `${it.slug}.png`))) { skip++; continue; }
  console.log(`그림 만드는 중: ${it.slug} (${it.size || '1024x1024'}, low)`);
  try { execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), it.prompt, '--quality', 'low', '--size', it.size || '1024x1024', '--out', out, '--name', it.slug], { stdio: 'inherit' }); made++; }
  catch (e) { fail++; console.log(`  실패: ${it.slug} — ${e.message.split('\n')[0]}`); }
}
console.log(`\n끝: 새로 ${made}장 · 이미 있음 ${skip}장 · 실패 ${fail}장 → ${out}`);
process.exit(fail ? 2 : 0);
