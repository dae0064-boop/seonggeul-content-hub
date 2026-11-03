/**
 * 티스토리 글 끝 "함께 보면 좋은 글" (2026-11-03 사용자 승인 — 색인 안 된 옛 글로 가는 길을 만들어 구글이 찾아가게).
 * 원고 related 의 제목(발행이 끝난 티스토리 글)을 실제 주소로 바꾼다.
 *
 * 주소 찾기: RSS(제목+주소, 최근 글) → sitemap.xml(/entry/<제목> 주소를 제목처럼 읽음).
 * 찾지 못한 제목은 조용히 빠진다. 네트워크가 막힌 곳(클라우드)에서는 모두 빠지고, 아침 PC 가 발행 직전에 다시 만든다.
 * 이 단계가 실패해도 발행은 막지 않는다.
 */
import { normTitle } from './naver-related.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const unxml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** RSS → [{ title, url }] */
export function parseTistoryRss(xml) {
  const out = [];
  for (const item of String(xml).split(/<item>/).slice(1)) {
    const title = unxml((/<title>([\s\S]*?)<\/title>/.exec(item) || [])[1] || '');
    const url = unxml((/<link>([\s\S]*?)<\/link>/.exec(item) || [])[1] || '');
    if (title && /^https?:\/\//.test(url)) out.push({ title, url });
  }
  return out;
}

/** sitemap.xml → [{ title, url }] — /entry/<제목> 주소만 (제목은 주소에서 읽은 것, 비교용) */
export function parseTistorySitemap(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/g)) {
    const url = unxml(m[1]);
    const e = /\/entry\/([^/?#]+)/.exec(url);
    if (e) out.push({ title: decode(e[1]).replace(/-/g, ' '), url });
  }
  return out;
}

async function get(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 블로그에 개인 도메인이 연결돼 있다 (seongdaeeyo.com — 티스토리 주소 글도 canonical 이 이쪽, 서치 콘솔 속성도 이쪽).
// 링크는 개인 도메인 주소로 넣어야 구글이 넘김 없이 바로 그 글로 간다
export const TISTORY_DOMAIN = process.env.TISTORY_DOMAIN || 'https://seongdaeeyo.com';

export async function fetchTistoryList(blog, { fetchImpl = globalThis.fetch, log = () => {}, base = TISTORY_DOMAIN || `https://${blog}.tistory.com` } = {}) {
  const list = [];
  try { list.push(...parseTistoryRss(await get(`${base}/rss`, fetchImpl))); } catch (e) { log(`RSS 읽기 실패 (${e.message})`); }
  try {
    let xml = await get(`${base}/sitemap.xml`, fetchImpl);
    // 사이트맵 묶음이면 안의 사이트맵을 한 번 더 읽는다
    if (/<sitemapindex/i.test(xml)) {
      const subs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => unxml(m[1])).slice(0, 10);
      xml = '';
      for (const s of subs) { try { xml += await get(s, fetchImpl); } catch { /* 다음 것 */ } }
    }
    list.push(...parseTistorySitemap(xml));
  } catch (e) { log(`사이트맵 읽기 실패 (${e.message})`); }
  return list;
}

/** related 제목 → [{ from, title, url }] (최대 3개, 자기 글·같은 주소 빼고) */
export function matchTistoryRelated(wanted, list, selfTitle = '') {
  const self = normTitle(selfTitle);
  const out = [];
  for (const w of wanted) {
    const n = normTitle(w);
    if (!n || n === self) continue;
    let hit = list.find((x) => normTitle(x.title) === n);
    if (!hit) {
      // 주소가 제목 일부를 빼고 만들어졌을 수 있다 — 한쪽이 다른 쪽을 품고 길이가 80% 넘게 같을 때만
      hit = list.find((x) => {
        const m = normTitle(x.title);
        return m && (m.includes(n) || n.includes(m)) && Math.min(m.length, n.length) / Math.max(m.length, n.length) >= 0.8;
      });
    }
    if (hit && !out.some((o) => o.url === hit.url)) out.push({ from: w, title: w, url: hit.url });
  }
  return out.slice(0, 3);
}

export async function resolveTistoryRelated(post, { blog, log = () => {}, fetchImpl } = {}) {
  const wanted = post.related || [];
  if (!wanted.length) return [];
  if (!blog) { log('블로그 이름(TISTORY_BLOG)을 몰라 함께 보면 좋은 글을 넣지 않습니다'); return []; }
  const list = await fetchTistoryList(blog, { log, fetchImpl });
  const found = matchTistoryRelated(wanted, list, post.title);
  for (const w of wanted) if (!found.some((f) => f.from === w)) log(`함께 볼 글 못 찾음 (빠짐): ${w}`);
  return found;
}
