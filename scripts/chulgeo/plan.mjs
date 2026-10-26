#!/usr/bin/env node
/**
 * 다와이철거 그림 계획서 채우기 (2026-10-26). 계획서에는 장면(scene)만 짧게 적고, 이 스크립트가
 * 원고의 [이미지 N] 설명을 title 로, 실사 스타일 문장을 붙인 prompt 를 채운다 (content/chulgeo/README.md 4).
 *
 *   node scripts/chulgeo/plan.mjs content/chulgeo/image-plans/<슬러그>.json [...]
 *
 * 계획서 모양:
 *   { "slug": "...", "brand": "다와이철거",
 *     "images": [
 *       { "n": 1, "scene": "wide view of ...", "overlay": { "kind": "thumb", "title": "인천 아파트\n철거 기간" } },
 *       { "n": 4, "kind": "card", "card": { "type": "steps", "title": "...", "items": [...] } }, ... ] }
 * 다시 돌려도 된다 (scene 이 그대로면 prompt 도 같다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parsePost } from '../lib/parse-post.mjs';

export const STYLE = 'Realistic documentary photograph taken with a full-frame camera, natural daylight mixed with a work lamp, true-to-life textures of cement, dust, tile and wood, honest on-site look, Korean apartments and shops.';
export const PEOPLE = 'If workers appear, show them only from behind or from the side wearing safety helmets and work gloves, never as recognizable faces; nobody is hurt and the work looks safe and orderly.';
export const NO_TEXT = 'Do not draw any written words, letters, numbers or logos anywhere in the image; signs, labels, papers and uniforms stay blank. No company names or brand marks.';
const THUMB = 'Keep the top third of the image as plain, calm, slightly out-of-focus wall or ceiling with nothing in it, so a title can be placed there later. Put all subjects in the lower two thirds.';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const files = process.argv.slice(2);
if (!files.length) { console.error('사용법: node scripts/chulgeo/plan.mjs content/chulgeo/image-plans/<슬러그>.json'); process.exit(1); }

for (const f of files) {
  const plan = JSON.parse(fs.readFileSync(f, 'utf8'));
  const md = path.join(ROOT, 'content', 'chulgeo', 'posts', `${plan.slug}.md`);
  if (!fs.existsSync(md)) { console.error(`❌ 원고 없음: ${md}`); process.exitCode = 1; continue; }
  const spots = Object.fromEntries(parsePost(fs.readFileSync(md, 'utf8')).blocks.filter((b) => b.type === 'image').map((b) => [b.n, b.lines[0].t]));
  plan.brand = '다와이철거';
  plan.images = plan.images.map((im) => {
    const out = { n: im.n, file: `${String(im.n).padStart(2, '0')}.png`, title: spots[im.n] || im.title || '' };
    if (im.kind === 'card') return { ...out, kind: 'card', card: im.card };
    const scene = im.scene || '';
    out.scene = scene;
    out.prompt = [`Camera and composition: ${scene}`, im.overlay?.kind === 'thumb' ? THUMB : '', STYLE, PEOPLE, NO_TEXT].filter(Boolean).join(' ');
    if (im.overlay) out.overlay = im.overlay;
    return out;
  });
  fs.writeFileSync(f, JSON.stringify(plan, null, 2) + '\n');
  console.log(`✅ ${f} (${plan.images.length}장)`);
}
