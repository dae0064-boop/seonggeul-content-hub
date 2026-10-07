/**
 * 글 끝 "함께 보면 좋은 글" — 원고 related 의 제목을 내 블로그에 실제로 발행된 글의 주소로 바꾼다.
 * (2026-10-07 사용자 승인: 다른 블로그처럼 관련 글 링크를 끝에 넣는다)
 *
 * 공개된 글 목록만 본다 — 예약만 걸린 글은 목록에 없으니 저절로 빠진다.
 * 네이버 블로그 글 목록(PostTitleListAsync)을 먼저 보고, 안 되면 RSS 를 본다.
 * 찾지 못한 제목은 조용히 빠진다. 이 단계가 실패해도 발행은 막지 않는다.
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** content/research/my-blog.txt 첫 줄 (# 뒤는 설명) — blog-stats.ps1 과 같은 파일 */
export function readMyBlogId(file = 'content/research/my-blog.txt') {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).find(Boolean) || '';
  } catch { return ''; }
}

/** 제목 비교용: 띄어쓰기·문장부호를 빼고 글자·숫자만 */
export const normTitle = (t) => String(t || '').normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

const decode = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
const unxml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

/** PostTitleListAsync 응답(JSON 비슷한 글) → [{ logNo, title }]. 따옴표 이스케이프가 깨져 JSON.parse 가 안 될 때가 있어 정규식으로 읽는다. */
export function parseTitleList(text) {
  const out = [];
  const re = /"logNo"\s*:\s*"?(\d+)"?\s*,\s*"title"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) out.push({ logNo: m[1], title: decode(m[2]).trim() });
  return out;
}

/** RSS → [{ logNo, title }] */
export function parseRss(xml, blogId) {
  const out = [];
  for (const item of xml.split(/<item>/).slice(1)) {
    const title = unxml((/<title>([\s\S]*?)<\/title>/.exec(item) || [])[1] || '');
    const link = unxml((/<link>([\s\S]*?)<\/link>/.exec(item) || [])[1] || '');
    const m = new RegExp(`${blogId}/(\\d+)`).exec(link) || /logNo=(\d+)/.exec(link);
    if (title && m) out.push({ logNo: m[1], title });
  }
  return out;
}

/** 내 블로그의 공개 글 목록 (최근부터, 최대 pages×30편) */
export async function fetchPostList(blogId, { pages = 10, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const seen = new Map();
  const headers = { 'user-agent': UA, referer: `https://blog.naver.com/${blogId}` };
  try {
    for (let p = 1; p <= pages; p++) {
      const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&viewdate=&currentPage=${p}&categoryNo=0&parentCategoryNo=0&countPerPage=30`;
      const res = await fetchImpl(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseTitleList(await res.text());
      const fresh = items.filter((x) => !seen.has(x.logNo));
      fresh.forEach((x) => seen.set(x.logNo, x));
      if (!fresh.length || items.length < 30) break;
    }
  } catch (e) { log(`글 목록 읽기 실패 (${e.message}) — RSS 로 봅니다`); }
  if (!seen.size) {
    try {
      const res = await fetchImpl(`https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parseRss(await res.text(), blogId).forEach((x) => seen.set(x.logNo, x));
    } catch (e) { log(`RSS 읽기 실패 (${e.message})`); }
  }
  return [...seen.values()];
}

/** 원고의 related 제목 → [{ title, url }]. 같은 글은 한 번만, 자기 글 제목은 뺀다. */
export function matchRelated(wanted, list, blogId, selfTitle = '') {
  const self = normTitle(selfTitle);
  const out = [];
  for (const w of wanted) {
    const n = normTitle(w);
    if (!n || n === self) continue;
    let hit = list.find((x) => normTitle(x.title) === n);
    if (!hit) {
      // 제목 끝을 조금 고쳐 발행했을 수 있다 — 한쪽이 다른 쪽을 품고 길이가 80% 넘게 같을 때만
      hit = list.find((x) => {
        const m = normTitle(x.title);
        return m && (m.includes(n) || n.includes(m)) && Math.min(m.length, n.length) / Math.max(m.length, n.length) >= 0.8;
      });
    }
    if (hit && !out.some((o) => o.logNo === hit.logNo)) out.push({ from: w, title: hit.title, logNo: hit.logNo, url: `https://blog.naver.com/${blogId}/${hit.logNo}` });
  }
  return out.slice(0, 2);
}

export async function resolveRelated(post, { blogId, log = () => {}, fetchImpl } = {}) {
  const wanted = post.related || [];
  if (!wanted.length) return [];
  if (!blogId) { log('블로그 아이디를 몰라 관련 글을 넣지 않습니다 (content/research/my-blog.txt)'); return []; }
  const list = await fetchPostList(blogId, { log, fetchImpl });
  log(`내 블로그 공개 글 ${list.length}편에서 관련 글 ${wanted.length}개 찾기`);
  const found = matchRelated(wanted, list, blogId, post.title);
  for (const w of wanted) if (!found.some((f) => f.from === w)) log(`관련 글 못 찾음 (빠짐): ${w}`);
  return found;
}
