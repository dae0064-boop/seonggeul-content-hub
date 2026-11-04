#!/usr/bin/env node
/**
 * 맛집 후기 원고 → 네이버 임시저장 (사무실 PC 에서만 돈다. 2026-11-04 사용자 — "사진을 보내주면 블로그 열어서 너가 직접 써 줄 수 없어?")
 *
 *   node scripts/matjip-draft.mjs content/matjip/posts/<원고>.md --photos "<Drive>/ClaudeWorkspace/맛집사진/<가게>"
 *   node scripts/matjip-draft.mjs content/matjip/posts/<원고>.md --drive "G:\\내 드라이브"   (원고의 photo_dir: 폴더)
 *   PC 에서는 launchers/matjip.cmd 더블클릭 (가장 최근 맛집 원고)
 *
 * 하는 일: 원고의 [사진 N] 을 사진 파일로, [지도] 를 '장소' 지도로 바꿔 넣고 임시저장까지만 한다 (발행은 사용자가 확인하고 직접).
 * - 사진 순서는 원고 프런트매터 `photos: 파일1.jpg | 파일2.jpg | …` ([사진 1]부터 차례로). 없으면 폴더의 사진을 이름 순서로.
 * - 지도는 프런트매터 `place: 검색어 | 주소에 들어 있는 말` (예: `place: 불란서찐빵 | 대부황금로 1488`).
 *   검색 결과 중 이름에 검색어가 있고 주소에 둘째 말이 들어 있는 곳 하나만 고른다. 못 고르면 [지도] 줄을 남기고 사용자가 넣는다.
 * - 카테고리는 맛집·나들이 > 맛집·카페 후기 (`subcategory:` 로 바꿀 수 있다), 주제는 맛집.
 * 실제 입력·확인은 publish-naver.mjs --save-draft 가 한다 (같은 안전장치: 글이 사라지면 되돌리고 멈춘다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePost } from './lib/parse-post.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const argv = process.argv.slice(2);
const md = argv.find((a) => a.endsWith('.md'));
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
let photoDir = opt('--photos');
const passOn = []; // publish-naver 로 그대로 넘길 것
for (const k of ['--cdp', '--blog-id']) if (opt(k)) passOn.push(k, opt(k));
if (argv.includes('--dump')) passOn.push('--dump');

if (!md || argv.includes('--help')) {
  console.log('사용법: node scripts/matjip-draft.mjs <맛집 원고.md> (--photos <사진 폴더> | --drive <내 드라이브>) [--dump] [--cdp http://localhost:9222]');
  process.exit(md ? 0 : 1);
}

const raw = fs.readFileSync(md, 'utf8');
const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
if (!fm) throw new Error('프런트매터(--- … ---)가 없습니다.');
const meta = Object.fromEntries(fm[1].split(/\r?\n/).map((l) => /^([A-Za-z_]+):\s*(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].trim()]));

// 사진 폴더: --photos, 없으면 <내 드라이브>/ClaudeWorkspace/맛집사진/<photo_dir>
if (!photoDir && opt('--drive') && meta.photo_dir) photoDir = path.join(opt('--drive'), 'ClaudeWorkspace', '맛집사진', meta.photo_dir);
if (!photoDir || !fs.existsSync(photoDir)) throw new Error(`사진 폴더가 없습니다: ${photoDir || '(원고에 photo_dir: 이 없음)'}`);

// [사진 N] → [이미지 N] (publish-naver 가 아는 표시). 본문은 그대로.
const body = raw.slice(fm[0].length).replace(/^\[사진\s*(\d+)\]/gm, '[이미지 $1]');
const post = parsePost(`---\ntitle: ${meta.title}\ntags: ${meta.tags || ''}\n---\n${body}`);
const imageNs = post.blocks.filter((b) => b.type === 'image').map((b) => b.n);

// 사진 파일 고르기
const isPhoto = (f) => /\.(jpe?g|png|heic|webp)$/i.test(f);
if (/^\(/.test(meta.photos || '')) throw new Error('원고에 사진 순서(photos:)가 아직 없어요. Claude 에게 "맛집사진 올렸어" 라고 말해 주세요.');
const listed = (meta.photos || '').split('|').map((s) => s.trim()).filter(Boolean);
const files = listed.length ? listed : fs.readdirSync(photoDir).filter(isPhoto).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
const slug = path.basename(md, '.md');
const work = path.join(repo, 'dumps', 'matjip', slug);
const imgDir = path.join(work, 'img');
fs.mkdirSync(imgDir, { recursive: true });
for (const f of fs.readdirSync(imgDir)) fs.unlinkSync(path.join(imgDir, f));
const missing = [];
for (const n of imageNs) {
  const f = files[n - 1];
  const src = f && path.join(photoDir, f);
  if (!src || !fs.existsSync(src)) { missing.push(`사진 ${n}${f ? ` (${f})` : ''}`); continue; }
  if (/\.heic$/i.test(src)) { missing.push(`사진 ${n} (${f} — HEIC 는 못 넣어요. 휴대폰에서 '가장 호환성 높음'으로 찍거나 JPG 로 올려 주세요)`); continue; }
  fs.copyFileSync(src, path.join(imgDir, `${String(n).padStart(2, '0')}${path.extname(src).toLowerCase()}`));
}
if (missing.length) console.log(`⚠ 못 찾은 사진: ${missing.join(', ')} — 그 자리는 표시 줄로 남아요 (직접 넣기)`);

const [query, addr] = (meta.place || meta.shop || '').split('|').map((s) => s.trim());
const json = {
  slug,
  title: meta.title,
  category: '맛집·나들이',
  matjip: true,
  subcategory: meta.subcategory || '맛집·카페 후기',
  topic: '맛집',
  tags: post.tags,
  place: query ? { query, addr: addr || '' } : undefined,
  blocks: post.blocks,
};
const jsonPath = path.join(work, 'post.json');
fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + '\n');
console.log(`✅ ${jsonPath} (사진 ${imageNs.length - missing.length}/${imageNs.length}장, 지도 ${json.place ? `"${query}"${addr ? ` · ${addr}` : ''}` : '없음'})`);

const r = spawnSync(process.execPath, [path.join(here, 'publish-naver.mjs'), '--post', jsonPath, '--images', imgDir,
  '--format', '--save-draft', '--no-related', '--no-source-link', ...passOn], { stdio: 'inherit' });
process.exit(r.status ?? 1);
