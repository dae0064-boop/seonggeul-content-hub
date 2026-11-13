#!/usr/bin/env node
/**
 * 새 글 검색 순위 추적 (2026-11-13 사용자 승인 — "순위 추적도 진행해줘").
 *
 * 아침 PC(blog-stats.ps1)가 돌린다. 1·3·7일 전에 발행한 내 네이버 생활보장 글마다
 * 메인 키워드를 네이버 블로그 탭(정확도순)에 넣어 내 글이 몇 위인지, 통합검색 첫 화면에 내 블로그가 보이는지 본다. 읽기만 한다.
 * 지금까지는 nurak-check 가 '1페이지 밖' 여부만 봐서, 순위가 오르는지·떨어지는지·어떤 글이 이기는지 알 수 없었다.
 *
 *   node scripts/rank-track.mjs <블로그아이디> --out <폴더> [--log <누적 tsv>] [--date YYYY-MM-DD] [--ages 1,3,7]
 *
 * 순위: .env 의 NAVER_CLIENT_ID/SECRET 이 되면 블로그 검색 API(정확도순 100개)로, 안 되면 블로그 탭 화면 글 주소 순서로 센다.
 * 통합검색: search.naver.com 첫 화면에 blog.naver.com/<아이디>/ 주소가 있는지만 본다 (스마트블록 자리는 화면마다 달라 순위는 세지 않는다).
 * 결과: <폴더>/rank.json · rank.txt, --log 가 있으면 한 줄씩 덧붙인다 (날짜·나이·슬러그·메인 키워드·블로그 순위·통합검색).
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

/** 볼 글: [{ date, age, slug, title, keyword }] — 오늘에서 ages 일 전에 발행한 생활보장 글 */
export function collectPosts(today, ages, { root = '.' } = {}) {
  const want = new Map(ages.map((a) => [addDays(today, -a), a]));
  const out = new Map();
  try {
    for (const row of fs.readFileSync(path.join(root, 'content/archive/published.tsv'), 'utf8').split(/\r?\n/).slice(1)) {
      const c = row.split('\t');
      if (c[1] !== 'naver' || !want.has(c[0]) || !c[3] || c[6] === 'deleted' || c[6] === 'private' || (c[5] || '') !== '생활보장') continue;
      out.set(c[2], { date: c[0], age: want.get(c[0]), slug: c[2], title: c[4], keyword: c[3] });
    }
  } catch { /* 없으면 원고만 */ }
  const dir = path.join(root, 'content/posts');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const m = /^(\d{4}-\d{2}-\d{2})-.+\.md$/.exec(f);
    if (!m || !want.has(m[1])) continue;
    const slug = f.replace(/\.md$/, '');
    if (out.has(slug)) continue;
    try {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const p = parsePost(src);
      if ((p.category || '') !== '생활보장' || /^draft_only\s*:/m.test(src)) continue;
      const kw = (/^main_keyword:\s*(.+)$/m.exec(src) || [])[1];
      if (kw) out.set(slug, { date: m[1], age: want.get(m[1]), slug, title: p.title, keyword: kw.trim() });
    } catch { /* 읽지 못한 원고는 건너뜀 */ }
  }
  return [...out.values()].sort((a, b) => a.age - b.age || a.date.localeCompare(b.date));
}

/** 블로그 글 주소들을 화면 순서대로 (같은 글 중복은 한 번) — 'blogId/글번호' */
export function postOrder(html) {
  const seen = new Set();
  const order = [];
  const re = /blog\.naver\.com(?:\/|%2F)([A-Za-z0-9_-]+)(?:\/|%2F)(\d{6,})/g;
  let m;
  while ((m = re.exec(html))) {
    const k = `${m[1]}/${m[2]}`;
    if (!seen.has(k)) { seen.add(k); order.push(k); }
  }
  return order;
}

/** 순서 목록에서 내 블로그 글이 처음 나오는 자리 (1부터, 없으면 null) */
export function myRank(order, blogId) {
  const i = order.findIndex((k) => k.split('/')[0].toLowerCase() === blogId.toLowerCase());
  return i < 0 ? null : i + 1;
}

async function rankViaApi(keyword, blogId, fetchImpl) {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`;
  const res = await fetchImpl(url, {
    headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`검색 API ${res.status}`);
  const j = await res.json();
  const order = (j.items || []).map((it) => {
    const m = /blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/.exec(String(it.link || ''));
    const b = /blog\.naver\.com\/([A-Za-z0-9_-]+)/.exec(String(it.bloggerlink || ''));
    return m ? `${m[1]}/${m[2]}` : b ? `${b[1]}/0` : '?/0';
  });
  return { rank: myRank(order, blogId), seen: order.length };
}

async function fetchPage(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`검색 화면 ${res.status}`);
  const html = await res.text();
  if (html.length < 5000) throw new Error('검색 화면이 비었음 (막혔을 수 있음)');
  return html;
}

async function rankViaPage(keyword, blogId, fetchImpl) {
  const html = await fetchPage(`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(keyword)}`, fetchImpl);
  const order = postOrder(html);
  return { rank: myRank(order, blogId), seen: order.length };
}

async function inIntegrated(keyword, blogId, fetchImpl) {
  const html = await fetchPage(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`, fetchImpl);
  return myRank(postOrder(html), blogId) !== null;
}

export async function trackAll(posts, blogId, { fetchImpl = globalThis.fetch, wait = 1500, log = () => {} } = {}) {
  let method = process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET ? 'api' : 'page';
  const results = [];
  for (const p of posts) {
    let r = null, error = '';
    for (let tries = 0; tries < 2 && r === null; tries++) {
      try { r = method === 'api' ? await rankViaApi(p.keyword, blogId, fetchImpl) : await rankViaPage(p.keyword, blogId, fetchImpl); }
      catch (e) {
        error = e.message;
        if (method === 'api' && /API (401|403|429)/.test(e.message)) { log(`  검색 API 안 됨 (${e.message}) — 검색 화면으로 봅니다`); method = 'page'; continue; }
        break;
      }
    }
    await sleep(wait);
    let integrated = null;
    try { integrated = await inIntegrated(p.keyword, blogId, fetchImpl); } catch { integrated = null; }
    const row = { ...p, rank: r ? r.rank : null, seen: r ? r.seen : 0, integrated, error: r ? '' : error };
    results.push(row);
    const where = r === null ? `⚠ 확인 못 함 (${error})` : r.rank ? `블로그 ${r.rank}위` : `블로그 ${r.seen}위 밖`;
    log(`  ${p.age}일째 ${p.keyword} → ${where} · 통합검색 ${integrated === true ? '보임' : integrated === false ? '안 보임' : '?'}`);
    await sleep(wait);
  }
  return { method, results };
}

/** 사람이 읽는 줄 */
export function summaryLines(today, method, results) {
  const band = (r) => (r.rank === null ? (r.error ? '확인 못 함' : '밖') : r.rank <= 3 ? '1~3위' : r.rank <= 10 ? '4~10위' : r.rank <= 30 ? '11~30위' : '31위~');
  const lines = [`검색 순위 추적 ${today} (방법: ${method === 'api' ? '검색 API 100개' : '블로그 탭 화면'}) — 메인 키워드로 블로그 탭 정확도순`];
  for (const age of [...new Set(results.map((r) => r.age))].sort((a, b) => a - b)) {
    const rs = results.filter((r) => r.age === age);
    const cnt = {};
    for (const r of rs) cnt[band(r)] = (cnt[band(r)] || 0) + 1;
    const integ = rs.filter((r) => r.integrated === true).length;
    lines.push(`${age}일째 (${rs[0].date}) ${rs.length}편: ${['1~3위', '4~10위', '11~30위', '31위~', '밖', '확인 못 함'].filter((k) => cnt[k]).map((k) => `${k} ${cnt[k]}`).join(' · ')} · 통합검색 보임 ${integ}`);
    for (const r of rs) lines.push(`  ${r.rank ? `${String(r.rank).padStart(3)}위` : r.error ? '   ? ' : '  밖 '} ${r.integrated ? '◎' : ' '} ${r.keyword} — ${r.title}`);
  }
  lines.push('(◎ = 통합검색 첫 화면에도 보임)');
  return lines;
}

async function main() {
  if (argv.includes('--help') || !argv[0] || argv[0].startsWith('--')) {
    console.log('사용법: node scripts/rank-track.mjs <블로그아이디> --out <폴더> [--log <누적 tsv>] [--date YYYY-MM-DD] [--ages 1,3,7]');
    process.exit(argv.includes('--help') ? 0 : 1);
  }
  loadEnv();
  const blogId = argv[0];
  const today = opt('--date', ymd(new Date()));
  const out = opt('--out', `dumps/blog-stats/${today}`);
  const ages = opt('--ages', '1,3,7').split(',').map(Number).filter((n) => n > 0);
  const posts = collectPosts(today, ages);
  fs.mkdirSync(out, { recursive: true });
  console.log(`[검색 순위 추적] ${blogId} — ${ages.join('·')}일 전 글 ${posts.length}편`);
  if (!posts.length) { fs.writeFileSync(path.join(out, 'rank.txt'), '볼 글 없음\n'); return; }
  const { method, results } = await trackAll(posts, blogId, { log: console.log });
  fs.writeFileSync(path.join(out, 'rank.json'), JSON.stringify({ at: new Date().toISOString(), blogId, method, results }, null, 1));
  const lines = summaryLines(today, method, results);
  fs.writeFileSync(path.join(out, 'rank.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  const logFile = opt('--log', '');
  if (logFile) {
    const head = !fs.existsSync(logFile);
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const rows = results.map((r) => [today, r.age, r.date, r.slug, r.keyword, r.rank ?? (r.error ? '?' : 'out'), r.integrated === null ? '?' : r.integrated ? 'Y' : 'N', method].join('\t'));
    fs.appendFileSync(logFile, (head ? '측정일\t나이\t발행일\t슬러그\t메인키워드\t블로그순위\t통합검색\t방법\n' : '') + rows.join('\n') + '\n', 'utf8');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`검색 순위 추적 실패: ${e.message}`); process.exit(0); });
}
