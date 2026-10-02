#!/usr/bin/env node
/**
 * 맛집 방문 메모 → 원고 초안(.md).
 *
 *   node scripts/matjip-draft.mjs content/matjip/notes/<슬러그>.txt
 *   node scripts/matjip-draft.mjs <메모> --force     이미 있는 원고를 덮어쓴다
 *
 * 메모 양식: content/matjip/TEMPLATE.txt
 * 결과: content/posts/<발행일>-<슬러그>.md
 *
 * 메모에 있는 사실(가게 정보·메뉴·가격·좋았던 점·아쉬운 점·팁)만 원고에 옮긴다.
 * 이야기를 이어 줄 문장이 필요한 자리는 [채우기: …] 로 남긴다. 검사기가 이 표시를 막으므로
 * 다 채워야 발행할 수 있다. 채울 때도 메모에 없는 맛·분위기를 지어 넣지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';

const MAX = 28; // 한 줄 글자수 (검사기 한도 30, 여유 2)
const FIXED_TAGS = ['서이추', '이웃추가', '서이추환영'];

const args = process.argv.slice(2);
const force = args.includes('--force');
const file = args.find((a) => !a.startsWith('--'));
if (!file || args.includes('--help') || args.includes('-h')) {
  console.log('사용법: node scripts/matjip-draft.mjs content/matjip/notes/<슬러그>.txt [--force]');
  process.exit(file ? 0 : 1);
}

// ── 메모 읽기 ──────────────────────────────────────────────
function parseMemo(raw) {
  const kv = {}, lists = {};
  let section = null;
  for (let line of raw.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    line = line.replace(/\s+#\s.*$/, '').trim(); // 줄 끝 주석
    if (!line) continue;
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) { section = sec[1].trim(); lists[section] = []; continue; }
    if (section) {
      const item = line.replace(/^-\s*/, '').trim();
      if (item) lists[section].push(item);
      continue;
    }
    const m = /^([^:：]+)[:：]\s*(.*)$/.exec(line);
    if (m) kv[m[1].replace(/\s/g, '')] = m[2].trim();
  }
  return { kv, lists };
}

const { kv, lists } = parseMemo(fs.readFileSync(file, 'utf8'));
const need = (k) => kv[k] || '';
const todo = (what) => `[채우기: ${what}]`;

const shop = need('가게');
const region = need('지역');
const menuMain = need('대표메뉴');
const visited = need('방문일');
const slug = need('슬러그');
const missing = [['가게', shop], ['지역', region], ['대표메뉴', menuMain], ['방문일', visited], ['슬러그', slug]]
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`❌ 메모에 꼭 있어야 하는 칸이 비었어요: ${missing.join(', ')}`); process.exit(1); }
if (!/^\d{4}-\d{2}-\d{2}$/.test(visited)) { console.error(`❌ 방문일 형식: 2026-09-28 처럼 (지금 "${visited}")`); process.exit(1); }
if (!/^[a-z0-9-]+$/.test(slug)) { console.error(`❌ 슬러그는 영문 소문자·숫자·하이픈만 (지금 "${slug}")`); process.exit(1); }

const nextDay = (d) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const pubDate = need('발행일') || nextDay(visited);
if (!/^\d{4}-\d{2}-\d{2}$/.test(pubDate)) { console.error(`❌ 발행일 형식: 2026-10-05 처럼 (지금 "${pubDate}")`); process.exit(1); }
if (pubDate < visited) { console.error(`❌ 발행일(${pubDate})이 방문일(${visited})보다 빠릅니다`); process.exit(1); }

const town = region.split(/\s+/).pop();
const mainKw = need('메인키워드') || `${town} ${menuMain}`;
const subKws = need('서브키워드') ? need('서브키워드').split(',').map((s) => s.trim()).filter(Boolean) : [`${town}맛집`, '메뉴', '주차'];
const sponsorRaw = need('협찬');
const sponsored = sponsorRaw && !/^없음/.test(sponsorRaw);
const sponsorWhat = sponsorRaw.replace(/^있음\s*[:：]?\s*/, '');

// ── 줄 나누기 ──────────────────────────────────────────────
// 글자수로 자르지 않고 어절 경계에서 끊는다. 한 줄에 들어가면 끊지 않고,
// 넘치면 줄 길이를 고르게 맞추되 쉼표 뒤를 먼저 끊는다. 괄호 안은 한 덩어리로 둔다.
function wrap(text) {
  text = String(text).trim();
  if (text.length <= MAX) return [text];
  const toks = [];
  let depth = 0;
  for (const w of text.split(/\s+/)) {
    if (depth > 0) toks[toks.length - 1] += ' ' + w; else toks.push(w);
    depth += (w.match(/\(/g) || []).length - (w.match(/\)/g) || []).length;
  }
  const target = Math.ceil(text.length / Math.ceil(text.length / MAX));
  const out = [];
  let cur = '';
  for (const w of toks) {
    if (!cur) { cur = w; continue; }
    const full = (cur + ' ' + w).length > MAX;
    const comma = /[,，]$/.test(cur) && cur.length >= target - 8;
    if (full || comma || cur.length >= target) { out.push(cur); cur = w; } else cur += ' ' + w;
  }
  if (cur) out.push(cur);
  return out;
}
// 줄 묶음을 3줄 이하 덩어리로 (검사기 한도 4줄). 1줄만 남으면 앞 덩어리에 붙인다.
function blocks(lines, size = 3) {
  const out = [];
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size));
  if (out.length > 1 && out[out.length - 1].length === 1 && out[out.length - 2].length < 4) out[out.length - 2].push(out.pop()[0]);
  return out.map((b) => b.join('\n'));
}

// ── 원고 조립 ──────────────────────────────────────────────
const photos = lists['사진'] || [];
let imgN = 0;
const img = (fallback) => {
  imgN++;
  const d = photos[imgN - 1] || todo(fallback);
  return `[이미지 ${imgN}] ${d}${imgN === 1 ? ' (대표사진)' : ''}`;
};
const field = (label, v) => wrap(`${label} ${v || todo(`${label} — 메모에 없음`)}`);
const items = (name) => (lists[name] || []).filter((s) => s && s !== '-');

const menus = items('메뉴').map((s) => s.split('|').map((x) => x.trim()));
const goods = items('좋았던 점');
const bads = items('아쉬운 점');
const tips = items('팁');

const title = `${mainKw} ${shop}, ${subKws.slice(1, 3).join('·')}까지 정리`;
const out = [];
const push = (...b) => out.push(...b.filter(Boolean));

push('안녕하세요\n매일매일 좋은 날을 나누는 성글벙글입니다😊');
// 공정위 추천·보증 심사지침: 대가를 받았으면 글 첫머리에 밝힌다
if (sponsored) push(blocks(wrap(`이 글은 ${shop}에서 ${sponsorWhat || todo('제공받은 내용')}을 제공받아 직접 먹어 보고 솔직하게 작성했어요.`)).join('\n\n'));
push(...blocks([
  ...wrap(`오늘은 ${mainKw} ${shop}에 다녀온 이야기를 포스팅으로 정리해 볼게요.`),
  ...wrap(need('방문계기') ? `${need('방문계기')}` : todo('이 집을 찾게 된 이유 1~2줄 (방문계기)')),
]));
push(img('가게 외관'));

push(`인용구(소제목) ${mainKw}, ${shop} 기본 정보`);
push(...blocks([...field('상호', shop), ...field('주소', need('주소')), ...field('영업시간', need('영업시간'))]));
push(...blocks([...field('휴무', need('휴무')), ...field('주차', need('주차')), ...field('예약', need('예약'))]));
if (need('가격대')) push(...blocks(wrap(`가격대는 [파란글씨]${need('가격대')}[/파란글씨] 정도였어요.`)));
push(img('메뉴판'));

push(`인용구(소제목) ${mainKw} 메뉴와 가격`);
if (menus.length) {
  for (const [name, price, note] of menus) {
    const head = `${name}${price ? ` [파란글씨]${price}[/파란글씨]` : ` ${todo('가격')}`}`;
    push(...blocks([head, ...(note ? wrap(note) : [todo(`${name} 먹어 본 느낌`)])]));
  }
} else push(todo('메뉴 | 가격 | 느낌 — 메모의 [메뉴]가 비었음'));
push(img(`${menuMain} 상차림`));

push(`인용구(소제목) ${mainKw}, 직접 먹어 보니`);
push(...blocks(goods.length ? goods.flatMap(wrap) : [todo('좋았던 점 — 메모에 없음')]));
push(img(`${menuMain} 가까이`));

push(`인용구(소제목) ${shop}, 아쉬웠던 점도 있어요`);
push(...blocks(bads.length ? bads.flatMap(wrap) : [todo('아쉬운 점 — 장점만 쓰지 않는다')]));
push(img('매장 내부'));

push(`인용구(소제목) ${mainKw} 가기 전 체크포인트`);
const checks = [...(need('웨이팅') ? [`웨이팅: ${need('웨이팅')}`] : []), ...tips];
push(...blocks(checks.length ? checks.flatMap(wrap) : [todo('웨이팅·팁 — 메모에 없음')]));
push(img('곁들임 메뉴'));

// 맛집 글은 Q&A 형식 대신 소제목 아래 이야기로 풀어 쓴다 (2026-10-02 사용자 지시)
push(`인용구(소제목) ${shop} 주차·예약·쉬는 날`);
push(...blocks([
  ...wrap(`주차는 ${need('주차') || todo('주차')}`),
  ...wrap(`예약은 ${need('예약') || todo('예약')}`),
  ...wrap(`쉬는 날은 ${need('휴무') || todo('휴무')}`),
]));
push(img('계산대·영수증 또는 가게 앞'));
while (imgN < Math.max(8, photos.length)) push(img('사진 설명'));

push(`인용구(소제목) ${mainKw} 한눈에 정리`);
push(todo('결론 1~2줄, 빨간글씨로'));
push(todo('독자가 바로 할 행동 하나'));
push('영업시간과 가격은 바뀔 수 있어요.\n가기 전에 가게에 한 번 확인해 보세요.');
const [y, mo, d] = visited.split('-').map(Number);
push(`이 글은 ${y}년 ${mo}월 ${d}일 직접 방문한 내용을\n기준으로 정리했습니다.`);
push('좋아요·공감과 이웃추가 부탁드려요💙\n이상 성글벙글의 맛집 포스팅이었습니다😎');

// ── 태그 ───────────────────────────────────────────────────
const ns = (s) => s.replace(/\s/g, '');
const tagSet = new Set([
  ns(mainKw), `${town}맛집`, `${ns(menuMain)}맛집`, `${town}${ns(menuMain)}맛집`, ns(shop),
  ...region.split(/\s+/).map((r) => `${r}맛집`),
  `${ns(region)}맛집`, `${town}밥집`, `${town}점심`, `${town}저녁`, ns(menuMain),
  ...menus.map(([n]) => ns(n)).filter((n) => n && n.length <= 15),
  ...(lists['태그'] || []).flatMap((s) => s.split(',')).map(ns).filter(Boolean),
  '맛집', '맛집추천', '내돈내산',
]);
if (sponsored) tagSet.delete('내돈내산');
for (const t of FIXED_TAGS) tagSet.delete(t);
const tags = [...tagSet, ...FIXED_TAGS];

const front = [
  '---',
  `title: ${title}`,
  'category: 맛집',
  `main_keyword: ${mainKw}`,
  `sub_keywords: ${subKws.join(', ')}`,
  `visited: ${visited}`,
  `sponsored: ${sponsored ? sponsorRaw.replace(/^있음\s*[:：]?\s*/, '') || '있음' : '없음'}`,
  ...(need('예약발행') ? [`publish_at: ${pubDate} ${need('예약발행')}`] : []),
  `tags: ${tags.join(', ')}`,
  '---',
  '',
].join('\n');

const dest = path.join('content', 'posts', `${pubDate}-${slug}.md`);
if (fs.existsSync(dest) && !force) { console.error(`❌ 이미 있어요: ${dest}  (덮어쓰려면 --force)`); process.exit(1); }
fs.writeFileSync(dest, front + out.join('\n\n') + '\n');

const holes = (front + out.join('\n')).match(/\[채우기:/g)?.length || 0;
console.log(`✅ ${dest}`);
console.log(`   제목: ${title}`);
console.log(`   메인 "${mainKw}" / 서브 ${subKws.join(', ')}${sponsored ? ' / 협찬 표기 넣음' : ''}`);
console.log(`   채울 자리 ${holes}곳 — [채우기: …] 를 메모에 있는 사실로만 채우세요`);
console.log(`\n다음: 채운 뒤  node scripts/lint-post.mjs ${dest}`);
console.log(`      통과하면 node scripts/build-post.mjs ${dest}`);
