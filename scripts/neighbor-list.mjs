#!/usr/bin/env node
/**
 * 이웃 소통 목록 (2026-11-10 사용자 — "1번 목록 매일 아침 보고에 넣어줘").
 *
 * 사용자가 본인 아이디 하나로 직접 찾아가 공감·댓글을 남길 블로그 글 15편을 매일 아침 골라 준다.
 * 여러 아이디로 내 글에 공감·댓글을 다는 것은 하지 않는다(네이버 어뷰징 — 사용자에게 거절함). 이 스크립트는 읽기만 한다.
 *
 *   node scripts/neighbor-list.mjs <내 블로그아이디> --out <폴더> [--date 2026-11-10] [--max 15] [--queries 8]
 *
 * 고르는 법: 최근 7일 내 생활보장 글의 메인 키워드(주제가 같은 독자·블로거) 몇 개를 네이버 블로그 검색에
 * '최신순 · 1일 안'으로 넣어, 다른 개인 블로그의 새 글을 블로거마다 1편씩 모은다.
 * 빼는 것: 내 블로그·철거 블로그·비교 블로그(한다팀장), 같은 블로거 두 번.
 * 검색 방법은 nurak-check 와 같다 (.env 검색 API → 안 되면 검색 화면 글자).
 * 결과: <폴더>/neighbors.json · neighbors.txt  (blog-stats.ps1 이 Drive blog-stats/<날짜>/ 로 같이 올린다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePost } from './lib/parse-post.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;|&[a-z]+;/g, '').replace(/\s+/g, ' ').trim();

// 찾아가지 않을 블로그 (내 블로그·철거 블로그·비교 대상)
export const SKIP_IDS = new Set(['seongdaeeyo', 'breakandbuild', 'rich_grandmom']);

function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    if (!fs.existsSync(f)) continue;
    let s = fs.readFileSync(f);
    s = (s[0] === 0xff && s[1] === 0xfe) ? s.subarray(2).toString('utf16le') : s.toString('utf8').replace(/^﻿/, '');
    for (let line of s.split(/\r?\n/)) {
      line = line.replace(/[\r\u0000]/g, '').trim();
      const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m || line.startsWith('#')) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

/** 검색어: 최근 7일 내 생활보장 네이버 글의 메인 키워드 (오늘·어제 원고 포함), 날짜마다 돌려 가며 n 개 */
export function pickQueries(today, n, { root = '.' } = {}) {
  const since = addDays(today, -7);
  const kws = [];
  try {
    for (const row of fs.readFileSync(path.join(root, 'content/archive/published.tsv'), 'utf8').split(/\r?\n/).slice(1)) {
      const c = row.split('\t');
      if (c[1] === 'naver' && c[0] >= since && c[3] && c[5] === '생활보장' && c[6] !== 'deleted' && c[6] !== 'private') kws.push(c[3]);
    }
  } catch { /* 없으면 원고만 */ }
  const dir = path.join(root, 'content/posts');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    const m = /^(\d{4}-\d{2}-\d{2})-.+\.md$/.exec(f);
    if (!m || m[1] < since || m[1] > today) continue;
    try {
      const p = parsePost(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (p.category === '생활보장' && p.mainKeyword) kws.push(p.mainKeyword);
    } catch { /* 건너뜀 */ }
  }
  const uniq = [...new Set(kws.map((k) => k.trim()).filter(Boolean))];
  if (!uniq.length) return [];
  const start = Number(today.replace(/-/g, '')) % uniq.length; // 날마다 다른 말부터
  return Array.from({ length: Math.min(n, uniq.length) }, (_, i) => uniq[(start + i) % uniq.length]);
}

/** 블로그 글 주소 → { id, logNo } (blog.naver.com/<id>/<번호> 또는 PostView.naver?blogId=..&logNo=..) */
export function parseBlogUrl(u) {
  const s = String(u || '');
  let m = /blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/.exec(s);
  if (m) return { id: m[1], logNo: m[2] };
  m = /blogId=([A-Za-z0-9_-]+)[^"']*?logNo=(\d{6,})/.exec(s);
  if (m) return { id: m[1], logNo: m[2] };
  return null;
}

async function viaApi(q, fetchImpl) {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(q)}&display=30&sort=date`;
  const res = await fetchImpl(url, {
    headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`검색 API ${res.status}`);
  const j = await res.json();
  return (j.items || []).map((it) => ({ ...parseBlogUrl(it.link), title: strip(it.title), blogger: strip(it.bloggername), date: String(it.postdate || '') }));
}

/** 검색 화면 글자에서 블로그 글 링크와 그 링크 글자(제목 후보)를 뽑는다 — 화면 모양이 바뀌어도 주소로만 잡는다 */
export function itemsFromHtml(html) {
  const byUrl = new Map();
  const re = /<a\b[^>]*href="([^"]*blog\.naver\.com[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const b = parseBlogUrl(m[1].replace(/&amp;/g, '&'));
    if (!b) continue;
    const key = `${b.id}/${b.logNo}`;
    const t = strip(m[2]);
    const cur = byUrl.get(key);
    if (!cur) byUrl.set(key, { ...b, title: t, blogger: '', date: '' });
    else if (t.length > cur.title.length && t.length <= 80) cur.title = t;
  }
  return [...byUrl.values()];
}

async function viaPage(q, fetchImpl) {
  // 최신순 · 1일 안 (nso=so:dd,p:1d) — 막 쓴 글이라 댓글이 눈에 띄고 답방이 오기 쉽다
  const url = `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(q)}&sm=tab_opt&nso=so%3Add%2Cp%3A1d`;
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`검색 화면 ${res.status}`);
  const html = await res.text();
  if (html.length < 5000) throw new Error('검색 화면이 비었음 (막혔을 수 있음)');
  return itemsFromHtml(html);
}

/** 블로거마다 1편, 내·제외 블로그 빼고, 제목이 있는 글만 max 편 */
export function pickNeighbors(found, { max = 15, today, skip = SKIP_IDS } = {}) {
  const seen = new Set();
  const out = [];
  const oldest = today ? addDays(today, -3).replace(/-/g, '') : '';
  for (const it of found) {
    if (!it.id || !it.logNo || skip.has(it.id) || seen.has(it.id)) continue;
    if (!it.title || it.title.length < 6) continue;
    if (it.date && oldest && it.date < oldest) continue; // API 결과는 날짜가 있다 — 3일 넘은 글은 뺀다
    seen.add(it.id);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

export async function collect(queries, { fetchImpl = globalThis.fetch, wait = 1500, log = () => {} } = {}) {
  let method = process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET ? 'api' : 'page';
  const found = [];
  for (const q of queries) {
    let items = null;
    for (let tries = 0; tries < 2 && items === null; tries++) {
      try {
        items = method === 'api' ? await viaApi(q, fetchImpl) : await viaPage(q, fetchImpl);
      } catch (e) {
        if (method === 'api' && /API (401|403|429)/.test(e.message)) { log(`  검색 API 안 됨 (${e.message}) — 검색 화면으로 봅니다`); method = 'page'; continue; }
        log(`  ⚠ ${q}: ${e.message}`);
        break;
      }
    }
    for (const it of items || []) found.push({ ...it, query: q });
    log(`  ${q}: 글 ${(items || []).length}편`);
    await sleep(wait);
  }
  return { method, found };
}

async function main() {
  if (argv.includes('--help') || !argv[0] || argv[0].startsWith('--')) {
    console.log('사용법: node scripts/neighbor-list.mjs <블로그아이디> --out <폴더> [--date YYYY-MM-DD] [--max 15] [--queries 8]');
    process.exit(argv.includes('--help') ? 0 : 1);
  }
  loadEnv();
  const blogId = argv[0];
  const today = opt('--date', ymd(new Date()));
  const out = opt('--out', `dumps/blog-stats/${today}`);
  const max = Number(opt('--max', '15'));
  fs.mkdirSync(out, { recursive: true });
  const queries = pickQueries(today, Number(opt('--queries', '8')));
  console.log(`[이웃 소통 목록] 검색어 ${queries.length}개: ${queries.join(' · ')}`);
  if (!queries.length) { fs.writeFileSync(path.join(out, 'neighbors.txt'), '검색어 없음 (최근 7일 생활보장 글이 없음)\n'); return; }
  const { method, found } = await collect(queries, { log: console.log });
  const picked = pickNeighbors(found, { max, today, skip: new Set([...SKIP_IDS, blogId]) });
  fs.writeFileSync(path.join(out, 'neighbors.json'), JSON.stringify({ at: new Date().toISOString(), method, queries, picked }, null, 1));
  const lines = [
    `이웃 소통 목록 ${today} (방법: ${method === 'api' ? '검색 API' : '검색 화면'}) — ${picked.length}편`,
    ...picked.map((p, i) => `${i + 1}. ${p.title}${p.blogger ? ` — ${p.blogger}` : ''} · [${p.query}] https://blog.naver.com/${p.id}/${p.logNo}`),
  ];
  fs.writeFileSync(path.join(out, 'neighbors.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`이웃 소통 목록 실패: ${e.message}`); process.exit(0); });
}
