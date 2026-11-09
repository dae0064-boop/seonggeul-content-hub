#!/usr/bin/env node
/**
 * 블로그 배너용 GPT 그림 만들기 — PC 에서만 (OpenAI 키가 PC .env 에 있다). 2026-11-09 사용자 "배너 전용 실행기로".
 *   node scripts/blog-banner/make-gpt.mjs --out <Drive ClaudeWorkspace\블로그배너> [--only soft-]
 * content/blog-banner/prompts.json 의 그림 중 아직 없는 것만 만든다(품질은 그림마다, 기본 low)(같은 그림 두 번 만들지 않기).
 */
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = A('--out', ''); const only = A('--only', '');
if (!out) { console.log('사용법: node scripts/blog-banner/make-gpt.mjs --out <폴더> [--only soft-]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/blog-banner/prompts.json'), 'utf8')).items.filter(it => !only || it.slug.startsWith(only));
// 사진: Drive 블로그배너/ 에 사진.png·사진.jpg·profile.png 가 있으면 그 사진으로 고쳐 그린다(얼굴 그대로)
const photo = fs.readdirSync(out).filter(f => /^(사진|profile)/i.test(f.normalize('NFC')) && /\.(png|jpe?g|webp)$/i.test(f)).sort().map(f => path.join(out, f))[0]; // '사진.jpg.jpg' 처럼 이름이 겹쳐도
let made = 0, skip = 0, fail = 0;
for (const it of items) {
  if (fs.existsSync(path.join(out, `${it.slug}.png`)) || fs.existsSync(path.join(ROOT, 'content/blog-banner/src', `${it.slug}.png`))) { skip++; continue; }
  // 2026-11-09 사용자 "항상 low 로만" — 프롬프트에 quality 가 적혀 있어도 늘 low
  const q = 'low', size = it.size || '1024x1024';
  const srcImg = it.source ? path.join(out, it.source) : '';
  if (it.source && !fs.existsSync(srcImg)) { console.log(`건너뜀: ${it.slug} — ${it.source} 가 없어요`); fail++; continue; }
  const usePhoto = it.photo && photo;
  if (it.photo_required && !photo) { console.log(`건너뜀: ${it.slug} — Drive 블로그배너 폴더에 사진.jpg(또는 사진.png)를 먼저 넣어 주세요.`); fail++; continue; }
  console.log(`그림 만드는 중: ${it.slug} (${size}, ${q}${it.photo ? (usePhoto ? ', 사진: ' + path.basename(photo) : ', 사진 없음 — 비슷한 사람으로') : ''})`);
  const args = srcImg ? [path.join(ROOT, 'scripts/image-edit.mjs'), srcImg, it.prompt] : usePhoto ? [path.join(ROOT, 'scripts/image-edit.mjs'), photo, it.prompt] : [path.join(ROOT, 'scripts/image-gen.mjs'), it.prompt_no_photo || it.prompt];
  try { execFileSync(process.execPath, [...args, '--quality', q, '--size', size, '--out', out, '--name', it.slug], { stdio: 'inherit' }); made++; }
  catch (e) { fail++; console.log(`  실패: ${it.slug} — ${e.message.split('\n')[0]}`); }
}
console.log(`\n끝: 새로 ${made}장 · 이미 있음 ${skip}장 · 실패 ${fail}장 → ${out}`);
process.exit(fail ? 2 : 0);
