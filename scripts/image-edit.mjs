#!/usr/bin/env node
/**
 * 사진 한 장을 OpenAI 로 고치기 (images/edits) — PC 에서만 (클라우드는 OpenAI 가 막혀 있다).
 *
 *   node scripts/image-edit.mjs <원본.png> "프롬프트" --quality low --size 1024x1536 --out <폴더> --name <이름>
 *
 * 얼굴을 그대로 두려고 input_fidelity=high 를 먼저 보내고, 모델이 받지 않으면 빼고 다시 보낸다.
 * 키는 OPENAI_API_KEY 환경 변수, 없으면 저장소 루트 .env (image-gen.mjs 와 같다).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };
const env = { ...process.env };
const ef = join(ROOT, '.env');
if (existsSync(ef)) for (const l of readFileSync(ef, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(l); if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const key = (env.OPENAI_API_KEY || '').trim();
if (!key) die('OPENAI_API_KEY 가 없어요');
const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  quality: { type: 'string', default: 'low' }, size: { type: 'string', default: '1024x1536' },
  out: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' } } });
const [src, prompt] = positionals;
if (!src || !prompt || !existsSync(src)) die('사용법: node scripts/image-edit.mjs <원본.png> "프롬프트" --out <폴더> --name <이름>');
const model = opt.model || env.IMAGE_MODEL || 'gpt-image-2';
const img = readFileSync(src);

async function send(m, fidelity) {
  const fd = new FormData();
  fd.append('model', m);
  fd.append('prompt', prompt);
  fd.append('size', opt.size);
  fd.append('quality', opt.quality);
  if (fidelity) fd.append('input_fidelity', 'high');
  fd.append('image[]', new Blob([img], { type: /\.jpe?g$/i.test(src) ? 'image/jpeg' : /\.webp$/i.test(src) ? 'image/webp' : 'image/png' }), 'photo' + (/\.jpe?g$/i.test(src) ? '.jpg' : /\.webp$/i.test(src) ? '.webp' : '.png'));
  const res = await fetch(`${API_BASE}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd })
    .catch((e) => die(`OpenAI 에 접속하지 못했어요 (${e.cause?.code || e.message})`));
  return { res, text: await res.text() };
}
console.log(`🖌 ${model} / ${opt.quality} / ${opt.size} — ${basename(src)} 고치기`);
let r = await send(model, true);
if (!r.res.ok && /input_fidelity/i.test(r.text)) { console.log('   input_fidelity 를 받지 않는 모델 — 빼고 다시'); r = await send(model, false); }
if (!r.res.ok && /model/i.test(r.text) && model !== 'gpt-image-1') { console.log(`   ${model} 이 고치기를 받지 않음 — gpt-image-1 로 다시`); r = await send('gpt-image-1', true); }
if (!r.res.ok) { let msg = r.text.slice(0, 300); try { msg = JSON.parse(r.text).error.message; } catch {} die(`HTTP ${r.res.status} — ${msg}`); }
const { data = [], usage } = JSON.parse(r.text);
if (!data[0]?.b64_json) die('응답에 이미지가 없어요');
const outDir = resolve(opt.out || '.');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${opt.name || 'edit'}.png`);
writeFileSync(file, Buffer.from(data[0].b64_json, 'base64'));
console.log(`✅ ${file}`);
if (usage) console.log(`   토큰: 입력 ${usage.input_tokens ?? '?'} / 출력 ${usage.output_tokens ?? '?'}`);
