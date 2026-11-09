#!/usr/bin/env node
/**
 * 정보 카드 캐릭터 '강팀장' 만들기 — PC 에서만 (클라우드는 OpenAI 가 막혀 있다). 2026-11-09 사용자 승인.
 *
 *   node scripts/cards/make-mascot.mjs --out <Drive ClaudeWorkspace\mascot>
 *
 * content/mascot/prompts.json 을 읽는다.
 *   1단계: chosen 이 비어 있으면 후보(candidates) 3장 — low 1024x1536, 약 30원.
 *   2단계: chosen 에 후보 slug 가 적히면 그 그림을 바탕으로 자세(poses) 6장을 '사진 고치기'로 — 같은 얼굴·옷이 유지된다. low, 약 60원.
 * 이미 --out 이나 content/mascot/img 에 있는 그림은 다시 만들지 않는다. 만든 그림은 둘 다에 둔다
 * (카드는 PC 의 post-images 가 그리므로 content/mascot/img 에 있으면 된다 — 저장소에는 올리지 않는다).
 * --out 폴더에 있는데 img 에 없으면 복사만 한다 (다른 PC).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const i = process.argv.indexOf('--out');
const out = i >= 0 ? process.argv[i + 1] : '';
if (!out) { console.log('사용법: node scripts/cards/make-mascot.mjs --out <폴더>'); process.exit(1); }
const img = path.join(ROOT, 'content/mascot/img');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(img, { recursive: true });
const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/mascot/prompts.json'), 'utf8'));

const have = (slug) => {
  const a = path.join(out, `${slug}.png`), b = path.join(img, `${slug}.png`);
  if (fs.existsSync(a) && !fs.existsSync(b)) fs.copyFileSync(a, b);
  if (fs.existsSync(b) && !fs.existsSync(a)) fs.copyFileSync(b, a);
  return fs.existsSync(b);
};
const keep = (slug) => { const a = path.join(out, `${slug}.png`); if (fs.existsSync(a)) fs.copyFileSync(a, path.join(img, `${slug}.png`)); };

let made = 0;
if (!c.chosen) {
  for (const it of c.candidates) {
    if (have(it.slug)) continue;
    console.log(`캐릭터 후보 만들기: ${it.slug}`);
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), `${c.style} ${it.who}`, '--raw', '--quality', 'low', '--size', '1024x1536', '--out', out, '--name', it.slug], { stdio: 'inherit' });
      keep(it.slug); made++;
    } catch { console.log(`⚠ ${it.slug} 실패 — 다음 실행 때 다시`); }
  }
} else {
  const base = path.join(img, `${c.chosen}.png`);
  if (!have(c.chosen)) { console.log(`⚠ 고른 후보 ${c.chosen}.png 가 없어요 — Drive mascot 폴더를 확인`); process.exit(0); }
  for (const p of c.poses) {
    if (have(p.slug)) continue;
    console.log(`캐릭터 자세 만들기: ${p.slug}`);
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-edit.mjs'), base, c.pose_prompt.replace('{pose}', p.pose), '--quality', 'low', '--size', '1024x1536', '--out', out, '--name', p.slug], { stdio: 'inherit' });
      keep(p.slug); made++;
    } catch { console.log(`⚠ ${p.slug} 실패 — 다음 실행 때 다시`); }
  }
}
console.log(made ? `캐릭터 그림 ${made}장 만듦` : '캐릭터 그림 — 새로 만들 것 없음');
