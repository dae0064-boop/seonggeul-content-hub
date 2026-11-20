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
 *
 * 2026-11-23 원고부터 (2026-11-20 사용자 — "철거 글이 너무 똑같은 느낌"):
 *   계획서 "mood" (글 전체 빛·분위기, MOODS 중 하나) · 1번 "shot" (대표사진 구도, SHOTS 중 하나)
 *   · 1번 overlay look/style/theme (대표사진 글씨 모양 — content/chulgeo/README.md 4 "돌려 쓰기") 를 적는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePost } from '../lib/parse-post.mjs';

export { MOODS, SHOTS, styleFor } from './vary.mjs';
import { SHOTS, styleFor } from './vary.mjs';
export const STYLE = styleFor('day');
export const PEOPLE = 'If workers appear, show them only from behind or from the side wearing safety helmets and work gloves, never as recognizable faces; nobody is hurt and the work looks safe and orderly.';
export const NO_TEXT = 'Do not draw any written words, letters, numbers or logos anywhere in the image; signs, labels, papers and uniforms stay blank. No company names or brand marks.';
const THUMB = 'Keep the top third of the image as plain, calm, slightly out-of-focus wall or ceiling with nothing in it, so a title can be placed there later. Put all subjects in the lower two thirds.';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
    if (im.shot) out.shot = im.shot;
    const shot = im.shot && SHOTS[im.shot] ? `Shot type: ${SHOTS[im.shot]}` : '';
    out.prompt = [`Camera and composition: ${scene}`, shot, im.overlay?.kind === 'thumb' ? THUMB : '', styleFor(plan.mood), PEOPLE, NO_TEXT].filter(Boolean).join(' ');
    if (im.overlay) out.overlay = im.overlay;
    return out;
  });
  fs.writeFileSync(f, JSON.stringify(plan, null, 2) + '\n');
  console.log(`✅ ${f} (${plan.images.length}장)`);
}
