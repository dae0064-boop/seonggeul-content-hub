#!/usr/bin/env node
/**
 * 네이버 검색 누락 검사 (2026-11-03 사용자 승인 — 하루 20~25편을 올리는 동안 검색에서 빠지는 글이 생기는지 지켜본다).
 *
 * 아침 PC(blog-stats.ps1)가 돌린다. 어제·그제 발행한 내 네이버 글 제목을 네이버 블로그 검색에 하나씩 넣어
 * 결과에 내 블로그(blog.naver.com/<아이디>) 글이 나오는지 본다. 읽기만 한다.
 *
 *   node scripts/nurak-check.mjs <블로그아이디> --out <폴더> [--days 2] [--date 2026-11-04] [--max 60]
 *
 * 제목 출처: 그제 이전은 content/archive/published.tsv(naver), 어제는 content/posts/<어제>-*.md (아침 확인이 지우기 전).
 * 검색 방법: .env 의 NAVER_CLIENT_ID/SECRET 이 되면 검색 API, 안 되면 네이버 블로그 검색 화면 글자를 본다.
 * 결과: <폴더>/nurak.json · nurak.txt  (Drive blog-stats/<날짜>/ 로 같이 올라간다)
 * 발행 직후 몇 시간은 검색에 안 잡히는 게 보통이라, 오늘 글은 보지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePost } from './lib/parse-post.mjs';
import { normTitle } from './lib/naver-related.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };

/** 검사할 글: [{ date, title, slug }] — 오늘보다 앞 days 일 */
export function collectTitles(today, days, { root = '.' } = {}) {
  const want = new Set(Array.from({ length: days }, (_, i) => addDays(today, -(i + 1))));
  const out = new Map();
  try {
    for (const row of fs.readFileSync(path.join(root, 'content/archive/published.tsv'), 'utf8').split(/\r?\n/).slice(1)) {
      const c = row.split('\t');
      if (c[1] === 'naver' && want.has(c[0]) && c[4] && c[6] !== 'deleted') out.set(c[2], { date: c[0], title: c[4], slug: c[2] });
    }
  } catch { /* 없으면 원고만 */ }
  const dir = path.join(root, 'content/posts');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const m = /^(\d{4}-\d{2}-\d{2})-.+\.md$/.exec(f);
    if (!m || !want.has(m[1])) continue;
    const slug = f.replace(/\.md$/, '');
    if (out.has(slug)) continue;
    try {
      const p = parsePost(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (p.title && !/^draft_only\s*:/m.test(fs.readFileSync(path.join(dir, f), 'utf8'))) out.set(slug, { date: m[1], title: p.title, slug });
    } catch { /* 읽지 못한 원고는 건너뜀 */ }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 검색 결과에 내 글이 있는지 — 링크에 블로그 아이디가 있고, 제목이 같거나 거의 같으면 찾음 */
export function hitInItems(items, blogId, title) {
  const n = normTitle(title);
  const strip = (s) => normTitle(String(s || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, ''));
  return items.some((it) => {
    const mine = String(it.link || '').includes(`/${blogId}/`) || String(it.bloggerlink || '').includes(`/${blogId}`) || String(it.link || '').includes(`blogId=${blogId}`);
    if (!mine) return false;
    const t = strip(it.title);
    return t === n || (t && (t.includes(n) || n.includes(t)) && Math.min(t.length, n.length) / Math.max(t.length, n.length) >= 0.7);
  });
}

async function viaApi(title, blogId, fetchImpl) {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(title)}&display=30&sort=sim`;
  const res = await fetchImpl(url, {
    headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`검색 API ${res.status}`);
  const j = await res.json();
  return hitInItems(j.items || [], blogId, title);
}

async function viaPage(title, blogId, fetchImpl) {
  const url = `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(title)}`;
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`검색 화면 ${res.status}`);
  const html = await res.text();
  if (html.length < 5000) throw new Error('검색 화면이 비었음 (막혔을 수 있음)');
  // 블로그 탭 화면: 우리 글 주소가 있으면 찾음 (제목 비교는 화면 모양이 자주 바뀌어 주소로만)
  return html.includes(`blog.naver.com/${blogId}/`) || html.includes(`blog.naver.com%2F${blogId}%2F`);
}

export async function checkAll(posts, blogId, { fetchImpl = globalThis.fetch, wait = 1200, log = () => {} } = {}) {
  let method = process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET ? 'api' : 'page';
  const results = [];
  for (const p of posts) {
    let found = null, error = '';
    for (let tries = 0; tries < 2 && found === null; tries++) {
      try {
        found = method === 'api' ? await viaApi(p.title, blogId, fetchImpl) : await viaPage(p.title, blogId, fetchImpl);
      } catch (e) {
        error = e.message;
        if (method === 'api' && /API (401|403|429)/.test(e.message)) { log(`  검색 API 안 됨 (${e.message}) — 검색 화면으로 봅니다`); method = 'page'; continue; }
        break;
      }
    }
    results.push({ ...p, found, error: found === null ? error : '' });
    log(`  ${found === true ? '✅' : found === false ? '❌ 누락?' : '⚠ 확인 못 함'} ${p.date} ${p.title}${found === null ? ` (${error})` : ''}`);
    await sleep(wait);
  }
  return { method, results };
}

async function main() {
  if (argv.includes('--help') || !argv[0] || argv[0].startsWith('--')) {
    console.log('사용법: node scripts/nurak-check.mjs <블로그아이디> --out <폴더> [--days 2] [--date YYYY-MM-DD] [--max 60]');
    process.exit(argv.includes('--help') ? 0 : 1);
  }
  loadEnv();
  const blogId = argv[0];
  const today = opt('--date', ymd(new Date()));
  const out = opt('--out', `dumps/blog-stats/${today}`);
  const posts = collectTitles(today, Number(opt('--days', '2'))).slice(-Number(opt('--max', '60')));
  fs.mkdirSync(out, { recursive: true });
  console.log(`[검색 누락 검사] ${blogId} — 어제·그제 글 ${posts.length}편`);
  if (!posts.length) { fs.writeFileSync(path.join(out, 'nurak.txt'), '검사할 글 없음\n'); return; }
  const { method, results } = await checkAll(posts, blogId, { log: console.log });
  const byDate = {};
  for (const r of results) {
    const d = (byDate[r.date] ||= { checked: 0, found: 0, missing: 0, unknown: 0 });
    d.checked++; if (r.found === true) d.found++; else if (r.found === false) d.missing++; else d.unknown++;
  }
  const missing = results.filter((r) => r.found === false);
  const sure = results.filter((r) => r.found !== null).length;
  const rate = sure ? Math.round((missing.length / sure) * 100) : null;
  fs.writeFileSync(path.join(out, 'nurak.json'), JSON.stringify({ at: new Date().toISOString(), blogId, method, byDate, missingRate: rate, results }, null, 1));
  const lines = [
    `검색 누락 검사 ${today} (방법: ${method === 'api' ? '검색 API' : '검색 화면'})`,
    ...Object.entries(byDate).map(([d, v]) => `${d}: ${v.checked}편 중 검색됨 ${v.found} · 안 보임 ${v.missing} · 확인 못 함 ${v.unknown}`),
    `안 보인 비율 ${rate === null ? '—' : `${rate}%`}`,
    ...missing.map((r) => `❌ ${r.date} ${r.title}`),
  ];
  fs.writeFileSync(path.join(out, 'nurak.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`검색 누락 검사 실패: ${e.message}`); process.exit(0); });
}
