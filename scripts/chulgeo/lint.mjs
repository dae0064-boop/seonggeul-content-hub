#!/usr/bin/env node
/**
 * 다와이철거 홍보 블로그 원고 검사기 (2026-10-26). 규칙 정본은 content/chulgeo/README.md.
 * 성글벙글 검사기(lint-post.mjs)와 따로 돈다 — 기준이 다르다.
 *
 *   node scripts/chulgeo/lint.mjs content/chulgeo/posts/<원고>.md [...]
 *   node scripts/chulgeo/lint.mjs content/chulgeo/posts/2026-10-27-*.md   하루치 (같은 날 섞기도 본다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { parsePost } from '../lib/parse-post.mjs';
import { checkCard } from '../lib/overlay.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const POSTS = path.join(ROOT, 'content', 'chulgeo', 'posts');
const PLANS = path.join(ROOT, 'content', 'chulgeo', 'image-plans');

export const GREETING = ['안녕하세요', '서울·인천·경기 철거 전문 다와이철거입니다.'];
export const CONTACT = [
  '철거 상담·견적 문의',
  '다와이철거 · 대표 박준서',
  '전화·문자 010-3503-8923',
  '서울 · 인천 · 경기(수원·시흥·안산·안양)',
];
export const PHOTO_NOTE = '글 속 사진은 이해를 돕기 위한 예시 이미지예요.';
const PHONE = '010-3503-8923';
const SLOTS = ['11:00', '13:00', '16:00', '18:00', '20:00'];
const REGIONS = ['서울', '인천', '경기', '수원', '시흥', '안산', '안양'];
const VISIT_OK = ['서울', '인천', '시흥'];

// 받지 못했거나 광고에 쓰면 안 되는 말 (README 2)
const BANNED = [
  [/최저가|최저 가격/, '최저가'], [/업계\s*1위|1등|넘버원|No\.?\s*1/i, '1위·1등'], [/최고의|최고 수준|최고예요|최고입니다/, '최고'],
  [/무조건/, '무조건'], [/100\s*%/, '100%'], [/완벽/, '완벽'], [/국내\s*유일|유일한 업체/, '유일'],
  [/무료/, '무료 (확인 안 됨)'], [/추가\s*(금|비용|요금)\s*(이\s*)?(없|0|제로|절대)/, '추가금 없음 (확인 안 됨)'],
  [/면허|허가\s*(업체|받은|를 받|번호)/, '면허·허가 (확인 안 됨)'], [/보험\s*(가입|에 가입|처리)/, '배상 보험 (확인 안 됨)'],
  [/후기/, '후기 (받은 후기가 없다)'], [/카카오톡|카톡/, '카카오톡 (ID 없음 — 전화·문자만)'],
  [/저희가 (작업|시공)한 (현장|사진)|실제 (작업|시공) 사진/, '실제 현장 사진처럼 쓰기 (예시 이미지다)'],
];
const MONEY = /\d[\d,.]*\s*(만\s*|천\s*|억\s*)?원|￦|₩/;

const noSpace = (s) => s.replace(/\s/g, '');
const count = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

function load(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const post = parsePost(raw);
  const meta = {};
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (fm) for (const l of fm[1].split(/\r?\n/)) { const m = /^([A-Za-z_]+):\s*(.*)$/.exec(l.trim()); if (m) meta[m[1]] = m[2].trim(); }
  return { raw, post, meta, slug: path.basename(file, '.md') };
}

/** 겹침 비교용 본문 (인사·연락처·사진 안내 빼고) */
function bodyText(post) {
  const fixed = new Set([...GREETING, ...CONTACT, PHOTO_NOTE]);
  return post.blocks.filter((b) => b.type !== 'image').flatMap((b) => b.lines.map((l) => l.t)).filter((t) => !fixed.has(t)).join('');
}
function shingles(s, n = 10) {
  const t = noSpace(s); const out = new Set();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
  return out;
}

export function lintOne(file, others = []) {
  const errors = [], warns = [];
  const { post, meta, slug } = load(file);
  const date = /^(\d{4}-\d{2}-\d{2})-/.exec(slug)?.[1];
  if (!date) errors.push('파일 이름은 <날짜>-<슬러그>.md');

  // 프런트매터
  if (!post.title) errors.push('title 없음');
  if (!post.mainKeyword) errors.push('main_keyword 없음');
  if (post.subKeywords.length < 2 || post.subKeywords.length > 3) errors.push(`sub_keywords 2~3개 (지금 ${post.subKeywords.length})`);
  if (post.mainKeyword && !REGIONS.some((r) => post.mainKeyword.includes(r))) errors.push(`main_keyword 에 지역이 없음 (${REGIONS.join('·')})`);
  if (post.mainKeyword && !post.title.startsWith(post.mainKeyword)) errors.push('제목은 메인 키워드로 시작');
  if (post.title.length > 40) errors.push(`제목 40자 안쪽 (지금 ${post.title.length})`);
  if (post.category) errors.push(`category 는 비워 둔다 (블로그에 카테고리를 만든 뒤 README 를 고치고 쓴다): ${post.category}`);
  if (meta.topic !== '인테리어·DIY') errors.push('topic: 인테리어·DIY');
  const pa = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(post.publishAt);
  if (!pa) errors.push('publish_at: YYYY-MM-DD HH:MM');
  else {
    if (pa[1] !== date) errors.push(`publish_at 날짜(${pa[1]})가 파일 날짜(${date})와 다름`);
    if (!SLOTS.includes(pa[2])) errors.push(`publish_at 시각은 ${SLOTS.join('·')} 중 하나`);
  }
  if (post.tags.length < 10 || post.tags.length > 15) errors.push(`태그 10~15개 (지금 ${post.tags.length})`);
  if (!post.tags.includes('다와이철거')) errors.push('태그에 다와이철거');
  if (/brandconnect|coupang|source_url|related|slot/.test(Object.keys(meta).join(' '))) errors.push('성글벙글 전용 항목(brandconnect·coupang·source_url·related·slot)은 쓰지 않는다');

  const blocks = post.blocks;
  const texts = blocks.filter((b) => b.type !== 'image').flatMap((b) => b.lines.map((l) => l.t));
  const all = texts.join('\n');

  // 첫 덩어리 + 인사
  const [b0, b1] = blocks;
  if (!(b0?.type === 'p' && b0.lines.length <= 2 && b0.lines[0].t !== '안녕하세요')) errors.push('맨 앞은 질문·사실 1~2줄 (발행 때 인용구가 된다)');
  else if (!noSpace(b0.lines.map((l) => l.t).join('')).includes(noSpace(post.mainKeyword))) errors.push('첫 1~2줄에 메인 키워드');
  if (!(b1?.type === 'p' && b1.lines.length === 2 && b1.lines[0].t === GREETING[0] && b1.lines[1].t === GREETING[1])) errors.push(`둘째 덩어리는 인사 두 줄 그대로: ${GREETING.join(' / ')}`);
  if (b0?.lines?.some((l) => l.s || l.segs)) errors.push('첫 줄에는 색 강조를 넣지 않는다');

  // 연락처 블록
  const last = blocks[blocks.length - 1];
  const lastLines = last?.lines?.map((l) => l.t) || [];
  if (JSON.stringify(lastLines) !== JSON.stringify(CONTACT)) errors.push(`맨 끝 덩어리는 연락처 블록 그대로:\n      ${CONTACT.join('\n      ')}`);
  const phones = count(all, PHONE);
  if (phones > 2) errors.push(`전화번호는 연락처 블록 + 본문 1번까지 (지금 ${phones}번)`);
  const otherPhone = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g;
  for (const m of all.matchAll(otherPhone)) if (m[0].replace(/\D/g, '') !== PHONE.replace(/\D/g, '')) errors.push(`다른 전화번호: ${m[0]}`);

  // 사진 안내
  const i1 = blocks.findIndex((b) => b.type === 'image' && b.n === 1);
  const after1 = blocks[i1 + 1];
  if (i1 < 0 || !(after1?.type === 'p' && after1.lines[0].t === PHOTO_NOTE)) errors.push(`[이미지 1] 바로 다음 줄: ${PHOTO_NOTE}`);

  // 금지어·금액·사실
  for (const t of texts) {
    for (const [re, name] of BANNED) if (re.test(t)) errors.push(`쓰면 안 되는 말 — ${name}: "${t}"`);
    if (MONEY.test(t)) errors.push(`금액은 쓰지 않는다 (받은 금액 없음): "${t}"`);
    for (const m of t.matchAll(/([\d,]+)\s*건/g)) if (m[1].replace(/,/g, '') !== '1400') errors.push(`건수는 1,400건 그대로: "${t}"`);
    for (const m of t.matchAll(/(\d+)\s*년\s*(차|경력|동안|째|넘게|간)/g)) if (m[1] !== '7') errors.push(`경력은 7년 그대로: "${t}"`);
    if (/대행/.test(t) && !/(않|안 |없|못)/.test(t)) errors.push(`관리사무소 신고·동의서는 대행하지 않는다: "${t}"`);
    if (/(방문\s*견적|현장\s*방문|찾아가)/.test(t)) {
      const bad = ['수원', '안산', '안양', '경기 전 지역', '경기 어디'].filter((r) => t.includes(r));
      if (bad.length && !/(사진|않|안 |어려)/.test(t)) errors.push(`방문 견적은 서울·인천·시흥만 (${bad.join('·')}): "${t}"`);
    }
  }
  if (/1,?400\s*건/.test(all) && !/1,?400\s*건\s*(이상|넘)/.test(all)) warns.push('1,400건은 "1,400건 이상"으로');

  // 분량
  const chars = noSpace(texts.join(''));
  if (chars.length < 1600 || chars.length > 2300) errors.push(`본문 공백 제외 1,600~2,300자 (지금 ${chars.length})`);

  // 키워드
  // 가운뎃점은 빼고 센다 ("폐기물 수거·운반" = 폐기물 수거 운반)
  const kw = (t) => noSpace(t).replace(/·/g, '');
  const flat = kw(all);
  const mk = count(flat, kw(post.mainKeyword));
  if (mk < 6) errors.push(`메인 키워드 "${post.mainKeyword}" 6회 이상 (지금 ${mk})`);
  for (const s of post.subKeywords) { const c = count(flat, kw(s)); if (c < 3) errors.push(`서브 키워드 "${s}" 3회 이상 (지금 ${c})`); }

  // 줄·덩어리
  let prev = null;
  for (const b of blocks) {
    if (b.type === 'p') {
      for (const l of b.lines) if (l.t.length > 30) errors.push(`한 줄 30자 이하 (${l.t.length}자): "${l.t}"`);
      if (b.lines.length > 4) errors.push(`덩어리 4줄 이하: "${b.lines[0].t}…"`);
      if ((prev?.type === 'quote' || (prev?.type === 'image' && prev.afterQuote)) && b.lines.length > 3) errors.push(`소제목 바로 아래 덩어리 3줄 이하: "${b.lines[0].t}…"`);
    }
    if (b.type === 'image') b.afterQuote = prev?.type === 'quote';
    prev = b;
  }

  // 소제목·그림
  const quotes = blocks.filter((b) => b.type === 'quote');
  if (quotes.length < 5 || quotes.length > 8) errors.push(`소제목 5~8개 (지금 ${quotes.length})`);
  for (const q of quotes) if (/^\d|단계/.test(q.lines[0].t)) errors.push(`소제목에 번호를 붙이지 않는다: "${q.lines[0].t}"`);
  const imgs = blocks.filter((b) => b.type === 'image');
  const ns = imgs.map((b) => b.n);
  if (JSON.stringify(ns) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8])) errors.push(`그림 자리 [이미지 1]~[이미지 8] 순서대로 (지금 ${ns.join(',')})`);
  blocks.forEach((b, i) => { if (b.type === 'image' && b.n >= 2 && blocks[i - 1]?.type !== 'quote') errors.push(`[이미지 ${b.n}] 은 소제목 바로 다음 줄`); });
  if (i1 >= 0 && blocks.slice(0, i1).some((b) => b.type === 'quote')) errors.push('[이미지 1] 은 첫 소제목 앞');

  // Q&A
  const qa = all.split('\n').filter((t) => /^Q\d+:/.test(t)).length;
  const qaA = all.split('\n').filter((t) => /^A\d+:/.test(t)).length;
  if (qa < 2 || qa > 4 || qa !== qaA) errors.push(`Q&A 2~4쌍 (Q ${qa} / A ${qaA})`);

  // 강조
  const { red, blue, yellow } = post.marks;
  if (red < 1 || red > 4) errors.push(`빨간글씨 1~4곳 (지금 ${red})`);
  if (blue < 3 || blue > 10) errors.push(`파란글씨 3~10곳 (지금 ${blue})`);
  if (yellow < 1 || yellow > 4) errors.push(`노란배경 1~4곳 (지금 ${yellow})`);
  for (const w of post.warnings) errors.push(w);

  // 그림 계획서
  const planFile = path.join(PLANS, `${slug}.json`);
  if (!fs.existsSync(planFile)) errors.push(`그림 계획서 없음: content/chulgeo/image-plans/${slug}.json`);
  else {
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    if (plan.slug !== slug) errors.push(`계획서 slug 가 ${slug} 가 아님`);
    if (plan.brand !== '다와이철거') errors.push('계획서 brand: "다와이철거"');
    const pi = plan.images || [];
    if (pi.length !== 8) errors.push(`계획서 그림 8장 (지금 ${pi.length})`);
    const cards = pi.filter((im) => im.kind === 'card');
    if (cards.length > 3) errors.push(`정보 카드 3장까지 (지금 ${cards.length})`);
    for (const im of pi) {
      const spot = imgs.find((b) => b.n === im.n);
      if (spot && spot.lines[0].t !== im.title) errors.push(`[이미지 ${im.n}] 설명과 계획서 title 이 다름`);
      if (im.kind === 'card') { const bad = checkCard(im.card); if (bad.length) errors.push(`${im.n}번 카드: ${bad.join(' / ')}`); continue; }
      const p = im.prompt || '';
      if (/clay|plasticine|pastel/i.test(p)) errors.push(`${im.n}번 그림은 실사풍 — clay·pastel 문구 금지`);
      if (!/Realistic documentary photograph/.test(p)) errors.push(`${im.n}번 그림에 실사 스타일 문장이 없음 (README 4)`);
      if (!/Do not draw any written words/.test(p)) errors.push(`${im.n}번 그림에 글자 금지 문장이 없음`);
    }
    const first = pi.find((im) => im.n === 1);
    if (first?.kind === 'card' || first?.overlay?.kind !== 'thumb') errors.push('1번은 실사 그림 + overlay thumb (대표사진)');
    else {
      const tl = String(first.overlay.title || '').split('\n');
      if (tl.length !== 2 || tl.some((t) => t.length > 10)) errors.push('대표사진 글씨는 두 줄, 한 줄 10자 안쪽');
    }
  }

  // 다른 철거 글과 겹침
  if (post.mainKeyword) for (const o of others) {
    if (o.slug === slug) continue;
    if (noSpace(o.post.mainKeyword) === noSpace(post.mainKeyword)) errors.push(`메인 키워드가 ${o.slug} 와 같음`);
  }
  // 발행이 끝나 지운 글 (content/chulgeo/published.tsv: 날짜 슬러그 메인키워드 제목)
  const pub = path.join(ROOT, 'content', 'chulgeo', 'published.tsv');
  if (post.mainKeyword && fs.existsSync(pub)) for (const row of fs.readFileSync(pub, 'utf8').split(/\r?\n/)) {
    const [, s2, k2] = row.split('\t');
    if (k2 && s2 !== slug && noSpace(k2) === noSpace(post.mainKeyword)) errors.push(`메인 키워드가 발행한 글 ${s2} 와 같음`);
  }
  const mine = shingles(bodyText(post));
  let worst = { r: 0, slug: '' };
  for (const o of others) {
    if (o.slug === slug) continue;
    const theirs = o.sh || (o.sh = shingles(bodyText(o.post)));
    let hit = 0; for (const s of mine) if (theirs.has(s)) hit++;
    const r = mine.size ? hit / mine.size : 0;
    if (r > worst.r) worst = { r, slug: o.slug };
  }
  if (worst.r > 0.2) errors.push(`본문이 ${worst.slug} 와 ${(worst.r * 100).toFixed(0)}% 겹침 (20% 이하 — 유사문서)`);

  return { file, slug, date, post, errors, warns, stats: { chars: chars.length, mk, red, blue, yellow, quotes: quotes.length, qa, overlap: Math.round(worst.r * 100) } };
}

/** 같은 날 원고 섞기 (README 3) */
function lintDay(results) {
  const errors = [];
  const byDate = {};
  for (const r of results) (byDate[r.date] ||= []).push(r);
  for (const [d, rs] of Object.entries(byDate)) {
    const all = fs.readdirSync(POSTS).filter((f) => f.startsWith(d) && f.endsWith('.md'));
    if (all.length > 5) errors.push(`${d}: 하루 5편까지 (지금 ${all.length})`);
    if (rs.length < all.length) continue; // 하루치를 다 넘겼을 때만 섞기를 본다
    const times = rs.map((r) => r.post.publishAt.slice(11));
    if (new Set(times).size !== times.length) errors.push(`${d}: 예약 시각이 겹침 (${times.join(', ')})`);
    if (rs.length >= 5) {
      const regions = new Set(rs.map((r) => REGIONS.find((g) => r.post.mainKeyword.includes(g))));
      if (regions.size < 4) errors.push(`${d}: 지역 4곳 이상 섞기 (지금 ${[...regions].join('·')})`);
      const visit = rs.filter((r) => VISIT_OK.some((g) => r.post.mainKeyword.includes(g))).length;
      if (visit < 3) errors.push(`${d}: 방문 견적 지역(서울·인천·시흥) 글 3편 이상 (지금 ${visit})`);
    }
  }
  return errors;
}

const files = process.argv.slice(2).filter((f) => f.endsWith('.md'));
if (!files.length) { console.error('사용법: node scripts/chulgeo/lint.mjs content/chulgeo/posts/<원고>.md [...]'); process.exit(1); }
const others = fs.existsSync(POSTS) ? fs.readdirSync(POSTS).filter((f) => f.endsWith('.md')).map((f) => load(path.join(POSTS, f))) : [];
let bad = 0;
const results = [];
for (const f of files) {
  const r = lintOne(f, others);
  results.push(r);
  const s = r.stats;
  console.log(`${r.errors.length ? '❌' : '✅'} ${f}`);
  console.log(`   ${s.chars}자 · 메인 ${s.mk}회 · 소제목 ${s.quotes} · Q&A ${s.qa} · 빨강 ${s.red} 파랑 ${s.blue} 노랑 ${s.yellow} · 다른 글과 겹침 ${s.overlap}%`);
  for (const e of r.errors) console.log(`   ✗ ${e}`);
  for (const w of r.warns) console.log(`   ⚠ ${w}`);
  if (r.errors.length) bad++;
}
const dayErr = lintDay(results.filter((r) => r.date));
for (const e of dayErr) console.log(`❌ ${e}`);
if (bad || dayErr.length) process.exit(1);
