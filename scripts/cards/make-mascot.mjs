#!/usr/bin/env node
/**
 * 정보 카드 캐릭터 '강팀장' 만들기 — PC 에서만 (클라우드는 OpenAI 가 막혀 있다). 2026-11-09 사용자 승인.
 *
 *   node scripts/cards/make-mascot.mjs --out <Drive ClaudeWorkspace\mascot>
 *
 * content/mascot/prompts.json 을 읽는다.
 *   1단계: chosen 이 비어 있으면 후보(candidates) 3장 — low 1024x1536, 약 30원. source 가 있으면 그 사진을 클레이 3D 로 고친다.
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
      // source 가 있으면 그 사진을 바탕으로 '사진 고치기' (2026-11-09 사용자 — 배너 속 본인과 닮게)
      if (it.source) execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-edit.mjs'), path.join(ROOT, it.source), it.who, '--quality', 'low', '--size', '1024x1536', '--out', out, '--name', it.slug], { stdio: 'inherit' });
      else execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-gen.mjs'), `${c.style} ${it.who}`, '--raw', '--quality', 'low', '--size', '1024x1536', '--out', out, '--name', it.slug], { stdio: 'inherit' });
      keep(it.slug); made++;
    } catch { console.log(`⚠ ${it.slug} 실패 — 다음 실행 때 다시`); }
  }
} else {
  // chosen_source: 저장소에 넣어 둔 확정 캐릭터 그림 (2026-11-09 사용자가 대화로 보낸 것)
  const base = c.chosen_source ? path.join(ROOT, c.chosen_source) : path.join(img, `${c.chosen}.png`);
  if (!(c.chosen_source ? fs.existsSync(base) : have(c.chosen))) { console.log(`⚠ 고른 캐릭터 그림이 없어요 — ${base}`); process.exit(0); }
  for (const p of c.poses) {
    if (have(p.slug)) continue;
    console.log(`캐릭터 자세 만들기: ${p.slug}`);
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts/image-edit.mjs'), base, c.pose_prompt.replace('{pose}', p.pose), '--quality', 'low', '--size', '1024x1536', '--out', out, '--name', p.slug], { stdio: 'inherit' });
      keep(p.slug); made++;
    } catch { console.log(`⚠ ${p.slug} 실패 — 다음 실행 때 다시`); }
  }
}
// 자세가 다 있으면 진초록 카드 예시를 Drive mascot/sample 로 (없을 때만) — 사용자가 휴대폰으로 본다
if (c.chosen && c.poses.every((p) => fs.existsSync(path.join(img, `${p.slug}.png`)))) {
  const sd = path.join(out, 'sample');
  if (!fs.existsSync(path.join(sd, '3-check.png'))) {
    try { execFileSync(process.execPath, [path.join(ROOT, 'scripts/cards/green-sample.mjs'), '--out', sd], { stdio: 'inherit' }); console.log('카드 예시 3장 만듦 (Drive mascot/sample)'); }
    catch { console.log('⚠ 카드 예시 그리기 실패'); }
  }
}
console.log(made ? `캐릭터 그림 ${made}장 만듦` : '캐릭터 그림 — 새로 만들 것 없음');
