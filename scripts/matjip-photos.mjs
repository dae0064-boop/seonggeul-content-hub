#!/usr/bin/env node
/**
 * 맛집 글에 넣을 직접 찍은 사진을 발행 스크립트가 읽는 이름으로 맞춘다.
 *
 *   node scripts/matjip-photos.mjs <사진폴더> <원고.md>
 *   node scripts/matjip-photos.mjs <사진폴더> <원고.md> --order name   파일 이름순 (기본: 찍은 시각순)
 *
 * 결과: content/images/<슬러그>/01.jpg, 02.jpg ... (원본은 건드리지 않고 복사)
 * publish-naver.mjs --images content/images/<슬러그> 가 [이미지 N] 자리에 NN.* 를 넣는다.
 *
 * 맛집 후기는 AI 그림을 쓰지 않는다 (standards/이미지-기준.md). 이 폴더는 커밋되지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parsePost } from './lib/parse-post.mjs';

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const args = process.argv.slice(2);
const byName = args.includes('--order') && args[args.indexOf('--order') + 1] === 'name';
const [dir, postFile] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--order');
if (!dir || !postFile) {
  console.log('사용법: node scripts/matjip-photos.mjs <사진폴더> <원고.md> [--order name]');
  process.exit(1);
}

const post = parsePost(fs.readFileSync(postFile, 'utf8'));
const slots = post.blocks.filter((b) => b.type === 'image');
const files = fs.readdirSync(dir)
  .filter((f) => EXT.has(path.extname(f).toLowerCase()))
  .map((f) => ({ f, full: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => (byName ? a.f.localeCompare(b.f, 'ko', { numeric: true }) : a.t - b.t));

if (!files.length) { console.error(`❌ 사진이 없어요: ${dir} (jpg·png·webp)`); process.exit(1); }

const slug = path.basename(postFile).replace(/\.md$/, '');
const out = path.join('content', 'images', slug);
fs.mkdirSync(out, { recursive: true });
for (const old of fs.readdirSync(out)) if (/^\d{2}\.(jpe?g|png|webp)$/i.test(old)) fs.rmSync(path.join(out, old));

console.log(`📷 ${slug} — 자리 ${slots.length}개 / 사진 ${files.length}장\n`);
slots.forEach((b, i) => {
  const src = files[i];
  const label = b.lines[0].t;
  if (!src) { console.log(`  ${String(b.n).padStart(2, '0')}  (사진 없음)  ${label}`); return; }
  const name = `${String(b.n).padStart(2, '0')}${path.extname(src.f).toLowerCase().replace('.jpeg', '.jpg')}`;
  fs.copyFileSync(src.full, path.join(out, name));
  console.log(`  ${name}  ← ${src.f}   ${label}`);
});
if (files.length > slots.length) console.log(`\n  남은 사진 ${files.length - slots.length}장은 쓰지 않았어요: ${files.slice(slots.length).map((x) => x.f).join(', ')}`);
console.log(`\n순서가 다르면 사진 파일 이름을 바꾸고 --order name 으로 다시 돌리세요.`);
console.log(`저장: ${out}`);
