#!/usr/bin/env node
/**
 * 인스타 카드뉴스 자동 게시 — GOMS 심의 '적격' 받은 편을 번호 순서대로, 심의필 번호를 넣은 그림으로 올린다.
 * (2026-11-02 사용자 — "인스타 카드뉴스를 진행해보자. 보험심의를 자동으로 올리는 걸 진행해보자")
 *
 *   node scripts/instagram/insta-post.mjs --word-dir <Drive 인스타심의> --approved <goms-approved-insta.tsv> --posted <posted.tsv>          시험: 올릴 편만 보여 줌
 *   node scripts/instagram/insta-post.mjs ... --post                                                                                       실제로 한 편 올림
 *   node scripts/instagram/insta-post.mjs --check                        연결 키 확인 (계정 이름만 읽음)
 *   node scripts/instagram/insta-post.mjs --refresh-out <파일>            60일 키를 새로 받아 파일에 씀 (insta-post.ps1 이 1주마다)
 *
 * 한 번 실행 = 많아야 한 편. 하나라도 어긋나면 올리지 않는다 (경고로 낮추지 않는다):
 *   - 멈춤 파일 content/instagram/PAUSE 가 없다
 *   - goms-approved-insta.tsv 에 그 편이 '적격'이고 오늘이 유효기간 안이다
 *   - 글(캡션)은 심의받은 Word(「인스타 카드뉴스 N편.docx」의 [게시물 본문] 아래)에서 그대로 읽는다 — 원고 json 이 아니라 Word 가 정본
 *   - 그림은 main 의 content/instagram/final/<N>/01~NN.jpg 공개 주소에서 모두 열리고, 장 수가 Word 의 카드 수와 같고,
 *     approval.txt 가 표의 심의필 번호·기간과 같다 (클라우드 아침 확인이 finalize.mjs 로 만든다)
 *   - 이미 올린 편이 아니다 — 게시 기록(posted.tsv) + 내 인스타 최근 게시물 캡션 첫 줄을 되읽어 본다 (두 PC 가 함께 돌아도 두 번 안 올리게)
 *   - 오늘(한국시간) 올린 편이 하루 상한(기본 1)보다 적고, 지금이 올리는 시간대(기본 18~22시) 안이다
 *   - 앞 번호 중 승인 결과를 아직 못 읽은 편이 있으면 기다린다 (반려 편은 건너뜀)
 *
 * 연결 키: Windows 사용자 환경 변수 INSTAGRAM_ACCESS_TOKEN (launchers/insta-key.cmd 로 넣는다). 저장소·Drive 에 두지 않는다.
 * 종료 코드: 0 = 올림 또는 올릴 것 없음, 1 = 설정 문제(키·파일), 2 = 올리다 실패
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip, content } from '../threads/word-fix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (n, d = '') => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const doPost = argv.includes('--post');
const wordDir = arg('--word-dir');
const approvedTsv = arg('--approved');
const postedTsv = arg('--posted');
const maxPerDay = Number(arg('--max-per-day', process.env.INSTAGRAM_PER_DAY || '1'));
const fromHour = Number(arg('--from-hour', '18'));
const toHour = Number(arg('--to-hour', '22'));
const API = (process.env.INSTAGRAM_API_BASE || 'https://graph.instagram.com').replace(/\/$/, '');
const RAW = process.env.INSTAGRAM_IMAGE_BASE
  || 'https://raw.githubusercontent.com/dae0064-boop/seonggeul-content-hub/main/content/instagram/final';
const TOKEN = (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
const PAUSE = path.join(ROOT, 'content/instagram/PAUSE');
const PREFIX = '인스타 카드뉴스';

const KST = 9 * 3600 * 1000;
const kstNow = () => new Date(Date.now() + KST);
const today = kstNow().toISOString().slice(0, 10);
const stamp = () => kstNow().toISOString().slice(0, 16).replace('T', ' ');
const log = (...m) => console.log(...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 올린 글인지 볼 때 쓰는 머리 — 캡션 첫 줄의 글자·숫자만 (이모지·문장부호·공백을 인스타가 바꿔도 같게) */
const head = (t) => String(t || '').normalize('NFC').split('\n').find((l) => l.trim())?.replace(/[^\p{L}\p{N}]/gu, '') || '';

async function api(method, endpoint, params = {}) {
  const url = new URL(API + endpoint);
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  let res;
  if (method === 'GET') { for (const [k, v] of body) url.searchParams.set(k, v); res = await fetch(url, { signal: AbortSignal.timeout(30000) }); }
  else res = await fetch(url, { method, body, signal: AbortSignal.timeout(60000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const e = j.error || {};
    throw new Error(`인스타 API ${method} ${endpoint} 실패 (${res.status}) ${e.message || ''} [code ${e.code ?? '?'}${e.error_subcode ? '/' + e.error_subcode : ''}]`);
  }
  return j;
}

if (argv.includes('--refresh-out')) {
  if (!TOKEN) { log('❌ INSTAGRAM_ACCESS_TOKEN 이 없어요'); process.exit(1); }
  const r = await api('GET', '/refresh_access_token', { grant_type: 'ig_refresh_token' });
  fs.writeFileSync(arg('--refresh-out'), r.access_token, { mode: 0o600 });
  log(`✅ 새 키 받음 — ${Math.round((r.expires_in || 0) / 86400)}일 남음`);
  process.exit(0);
}
if (!TOKEN) { log('❌ 이 PC 에 인스타 연결 키(INSTAGRAM_ACCESS_TOKEN)가 없어요 — launchers\\insta-key.cmd 를 더블클릭해 넣어 주세요 (docs/INSTAGRAM.md)'); process.exit(1); }
const me = await api('GET', '/me', { fields: 'user_id,username,account_type' }).catch((e) => { log(`❌ 연결 키가 맞지 않아요 — ${e.message}`); process.exit(1); });
const IG = me.user_id || me.id;
log(`인스타 계정 @${me.username} (${me.account_type || '?'})`);
if (argv.includes('--check')) process.exit(0);

if (fs.existsSync(PAUSE)) { log(`⏸ 멈춤 파일(content/instagram/PAUSE)이 있어 올리지 않아요`); process.exit(0); }
for (const [name, f] of [['--word-dir', wordDir], ['--approved', approvedTsv]]) {
  if (!f || !fs.existsSync(f)) { log(`${name} 위치가 없어요 (${f || '비어 있음'}) — 아직 승인 난 편이 없으면 정상이에요`); process.exit(0); }
}

// ── 승인표: 편마다 마지막 줄이 지금 상태 ──
const approvals = new Map();
for (const line of fs.readFileSync(approvedTsv, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const c = line.split('\t').map((x) => x.trim());
  if (/^\d+$/.test(c[0] || '') && c.length >= 5) approvals.set(Number(c[0]), { no: c[1], start: c[2], end: c[3], result: c[4] });
}
// ── 게시 기록: 시각 · 편 · 심의필 · 첫 줄 · 주소 ──
const posted = [];
if (postedTsv && fs.existsSync(postedTsv)) {
  for (const line of fs.readFileSync(postedTsv, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const c = line.split('\t');
    if (/^\d+$/.test((c[1] || '').trim())) posted.push({ at: c[0].trim(), n: Number(c[1]) });
  }
}

/** 심의받은 Word 에서 카드 수와 [게시물 본문] 아래 글을 그대로 읽는다. */
function readWord(n) {
  const file = path.join(wordDir, `${PREFIX} ${n}편.docx`);
  if (!fs.existsSync(file)) return null;
  const xml = content(readZip(fs.readFileSync(file)).find((e) => e.name === 'word/document.xml')).toString('utf8');
  const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const paras = [...xml.slice(xml.indexOf('<w:body')).matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)]
    .map((m) => m[0]).filter((p) => !p.includes('<w:drawing') && !p.includes('<w:pict'))
    .map((p) => unxml([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')));
  const cards = paras.map((t) => t.match(/^\[카드 \d+\/(\d+)\]$/)).find(Boolean);
  const at = paras.findIndex((t) => t.trim() === '[게시물 본문]');
  if (at < 0) return { file, error: 'Word 에서 [게시물 본문] 줄을 찾지 못했어요' };
  const lines = paras.slice(at + 1);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return { file, cards: cards ? Number(cards[1]) : 0, caption: lines.join('\n') };
}

async function opens(url, type) {
  try {
    const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    if (type && !(r.headers.get('content-type') || '').includes(type)) return null;
    return type ? true : (await r.text());
  } catch { return null; }
}

// ── 오늘 몇 편 올렸나 · 시간대 ──
const hour = kstNow().getUTCHours();
const todayCount = posted.filter((p) => p.at.slice(0, 10) === today).length;
log(`오늘(${today}) 올린 편 ${todayCount} / 하루 ${maxPerDay} · 지금 ${hour}시 (올리는 시간 ${fromHour}~${toHour}시)`);
if (todayCount >= maxPerDay) { log('오늘 몫은 다 올렸어요.'); process.exit(0); }
if (doPost && (hour < fromHour || hour > toHour)) { log('올리는 시간대가 아니라 쉬어요.'); process.exit(0); }

// ── 내 인스타 최근 게시물 (두 번 올리지 않게) ──
const recent = (await api('GET', `/${IG}/media`, { fields: 'id,caption,timestamp,permalink', limit: '50' })).data || [];
const recentHeads = new Set(recent.map((m) => head(m.caption)));
const done = new Set(posted.map((p) => p.n));

// ── 다음 편 고르기: 번호 순서, 반려는 건너뛰고, 결과 모르는 앞 번호가 있으면 기다린다 ──
const words = fs.readdirSync(wordDir).map((f) => f.match(/^인스타 카드뉴스 (\d+)편\.docx$/)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
let pick = null;
for (const n of words) {
  if (done.has(n)) continue;
  const a = approvals.get(n);
  if (!a) { log(`${n}편: 아직 심의 결과를 못 읽었어요 — 이 편이 나올 때까지 뒤 번호도 기다려요`); break; }
  if (a.result !== '적격') { log(`${n}편: ${a.result || '결과 없음'} — 건너뜀`); continue; }
  if (!(a.start <= today && today <= a.end)) { log(`${n}편: 유효기간(${a.start}~${a.end}) 밖 — 건너뜀`); continue; }
  const w = readWord(n);
  if (!w || w.error) { log(`${n}편: ${w ? w.error : 'Word 가 없어요'} — 건너뜀`); continue; }
  if (recentHeads.has(head(w.caption))) { log(`${n}편: 인스타에 이미 같은 첫 줄 게시물이 있어요 — 올린 것으로 봐요`); continue; }
  pick = { n, a, w };
  break;
}
if (!pick) { log('지금 올릴 편이 없어요.'); process.exit(0); }

const { n, a, w } = pick;
const approvalText = `글로벌금융판매 준법감시인 심의필 ${a.no}(${a.start.replace(/-/g, '.')}~${a.end.replace(/-/g, '.')})`;
log(`\n▶ ${PREFIX} ${n}편 — 심의필 ${a.no} (${a.start}~${a.end})`);
const problems = [];
if (!w.cards || w.cards < 2 || w.cards > 10) problems.push(`Word 의 카드 수(${w.cards})가 이상해요 (2~10장)`);
if (!w.caption) problems.push('Word 의 게시물 본문이 비었어요');
if (w.caption.length > 2200) problems.push(`본문이 ${w.caption.length}자예요 — 인스타는 2,200자까지`);
if ((w.caption.match(/#[^\s#]+/g) || []).length > 30) problems.push('해시태그가 30개를 넘어요');
const remoteMark = await opens(`${RAW}/${n}/approval.txt`);
if (!remoteMark) { log('  ⏳ 심의필 번호를 넣은 그림(final)이 아직 공개 주소(main)에 없어요 — 클라우드 아침 확인이 만들어 main 에 합치면 다음 차례에 올라가요'); process.exit(0); }
if (remoteMark.trim() !== approvalText) problems.push(`공개 주소의 심의필 문구가 승인표와 달라요 (${remoteMark.trim()})`);
const urls = Array.from({ length: w.cards }, (_, i) => `${RAW}/${n}/${String(i + 1).padStart(2, '0')}.jpg`);
for (const u of urls) if (!(await opens(u, 'image/jpeg'))) problems.push(`그림이 열리지 않아요: ${u}`);
if (await opens(`${RAW}/${n}/${String(w.cards + 1).padStart(2, '0')}.jpg`, 'image/jpeg')) problems.push(`공개 주소에 그림이 Word(${w.cards}장)보다 많아요`);
if (problems.length) { problems.forEach((p) => log(`  ❌ ${p}`)); log('  올리지 않았어요.'); process.exit(2); }
log(`  확인 ✓ 그림 ${urls.length}장 · 본문 ${w.caption.length}자 · 첫 줄 "${w.caption.split('\n')[0]}"`);
if (!doPost) { log('  시험이라 올리지 않아요 (--post 를 붙이면 올림).'); process.exit(0); }

// 올리기 직전에 한 번 더 되읽는다 (다른 PC 가 막 올렸을 수 있다)
const again = (await api('GET', `/${IG}/media`, { fields: 'id,caption', limit: '10' })).data || [];
if (again.some((m) => head(m.caption) === head(w.caption))) { log('  다른 PC 가 막 올렸어요 — 건너뜀'); process.exit(0); }

try {
  const children = [];
  for (const u of urls) {
    const c = await api('POST', `/${IG}/media`, { image_url: u, is_carousel_item: 'true' });
    children.push(c.id);
  }
  log(`  카드 ${children.length}장 받음`);
  const box = await api('POST', `/${IG}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: w.caption });
  let status = '';
  for (let i = 0; i < 30; i++) {
    status = (await api('GET', `/${box.id}`, { fields: 'status_code' })).status_code;
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`게시물 준비 실패 (${status})`);
    await sleep(4000);
  }
  if (status !== 'FINISHED') throw new Error(`게시물 준비가 2분 안에 끝나지 않았어요 (${status})`);
  const pub = await api('POST', `/${IG}/media_publish`, { creation_id: box.id });
  const info = await api('GET', `/${pub.id}`, { fields: 'permalink' }).catch(() => ({}));
  log(`  ✅ 올림 — ${info.permalink || pub.id}`);
  if (postedTsv) {
    fs.mkdirSync(path.dirname(postedTsv), { recursive: true });
    const first = w.caption.split('\n')[0].replace(/\t/g, ' ');
    fs.appendFileSync(postedTsv, `${stamp()}\t${n}\t${a.no}\t${first}\t${info.permalink || pub.id}\n`, 'utf8');
  }
} catch (e) {
  log(`  ❌ 올리다 멈춤 — ${e.message}`);
  process.exit(2);
}
