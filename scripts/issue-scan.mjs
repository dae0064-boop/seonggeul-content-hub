#!/usr/bin/env node
/**
 * 아침 이슈 모으기 (2026-11-02 사용자 — "오전 7~8시에 기사가 가장 많이 나온다, 연예·이슈 중 노출 잘 되고 검색량 많은 걸 가져와 블로그에").
 *
 * 사용자 PC 에서 07:50 에 돈다 (작업 스케줄러 SeonggeulIssueScan → launchers/tools/issue-scan.ps1).
 * 클라우드에서는 뉴스·트렌드 사이트가 모두 막혀 있어서, PC 가 읽어 Drive 로 올리고 08:17 클라우드 작업(routines/issue-morning.md)이 읽어 글을 쓴다.
 *
 * 읽는 곳 (로그인 없이 공개 화면만):
 *   ① 구글 트렌드 한국 실시간 (RSS) — 검색량(approx_traffic) + 관련 기사
 *   ② 네이버 연예 랭킹 (많이 본 뉴스)
 *   ③ 네이버 뉴스 많이 본 뉴스 (언론사별)
 * 그리고 위에서 겹치거나 순위 높은 기사 최대 24개는 본문 앞부분(사실 확인용, 2,000자)을 같이 저장한다.
 * 기사 글·사진을 블로그에 그대로 옮기지 않는다 — 클라우드 작업이 사실만 확인해 우리 말로 새로 쓴다(언론사 저작권).
 *
 *   node scripts/issue-scan.mjs [--out dumps/issues-2026-11-03] [--articles 24]
 * 결과: <out>.json, <out>.txt
 */
import fs from 'node:fs';
import { launch } from './lib/overlay.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const out = opt('--out', `dumps/issues-${today}`);
const maxArticles = Number(opt('--articles', 24));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const clean = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const notes = [];

// ① 구글 트렌드 RSS
async function googleTrends() {
  const r = await fetch('https://trends.google.com/trending/rss?geo=KR', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m, i) => {
    const it = m[1];
    const tag = (t) => clean((new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(it) || [])[1]);
    const news = [...it.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map((n) => {
      const g = (t) => clean((new RegExp(`<ht:${t}>([\\s\\S]*?)</ht:${t}>`).exec(n[1]) || [])[1]);
      return { title: g('news_item_title'), url: g('news_item_url'), press: g('news_item_source') };
    });
    return { rank: i + 1, keyword: tag('title'), traffic: tag('ht:approx_traffic'), started: tag('pubDate'), news };
  });
}

// ②③ 네이버 랭킹 화면 — 기사 링크 글자를 모은다 (화면 모양이 바뀌어도 기사 주소 모양으로 찾는다)
async function rankingLinks(page, url, linkRe) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const links = await page.evaluate((src) => {
    const re = new RegExp(src);
    const seen = new Set(); const outL = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href;
      const t = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!re.test(href) || t.length < 8 || seen.has(href)) continue;
      seen.add(href);
      const box = a.closest('li, div');
      const press = (box?.querySelector('[class*="press"], [class*="office"], [class*="source"]')?.textContent || '').replace(/\s+/g, ' ').trim();
      outL.push({ title: t.slice(0, 120), url: href, press: press.slice(0, 30) });
    }
    return outL;
  }, linkRe.source);
  return links.slice(0, 40).map((x, i) => ({ rank: i + 1, ...x }));
}

// 기사 본문 앞부분 (사실 확인용)
async function articleText(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const pick = ['#dic_area', '#articeBody', '#newsEndContents', '.article_body', '#articleBodyContents', '[itemprop="articleBody"]', 'article', '#content'];
    let el = null;
    for (const s of pick) { el = document.querySelector(s); if (el && el.innerText.trim().length > 200) break; el = null; }
    const body = (el?.innerText || document.body.innerText || '').replace(/\n{2,}/g, '\n').trim().slice(0, 2000);
    const time = document.querySelector('[data-date-time], .media_end_head_info_datestamp_time, time, [class*="date"]')?.getAttribute?.('data-date-time')
      || document.querySelector('time, [class*="date"]')?.textContent?.trim() || '';
    const press = document.querySelector('meta[property="og:article:author"], meta[name="twitter:creator"]')?.content
      || document.querySelector('.media_end_head_top_logo img, [class*="press_logo"] img')?.alt || '';
    return { title: document.querySelector('meta[property="og:title"]')?.content || document.title, press, time: String(time).slice(0, 40), body };
  });
}

const result = { date: today, scannedAt: new Date().toISOString(), trends: [], naverEnt: [], naverNews: [], articles: [], notes };
try { result.trends = await googleTrends(); } catch (e) { notes.push(`구글 트렌드 실패: ${e.message}`); }

const browser = await launch();
try {
  const ctx = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await ctx.newPage();
  try { result.naverEnt = await rankingLinks(page, 'https://m.entertain.naver.com/ranking', /entertain\.naver\.com\/(home\/)?article\//); }
  catch (e) { notes.push(`네이버 연예 랭킹 실패: ${e.message.split('\n')[0]}`); }
  if (!result.naverEnt.length) {
    try { result.naverEnt = await rankingLinks(page, 'https://entertain.naver.com/ranking', /entertain\.naver\.com\/(home\/)?article\//); }
    catch (e) { notes.push(`네이버 연예 랭킹(PC) 실패: ${e.message.split('\n')[0]}`); }
  }
  try { result.naverNews = await rankingLinks(page, 'https://news.naver.com/main/ranking/popularDay.naver', /n\.news\.naver\.com\/(mnews\/)?article\//); }
  catch (e) { notes.push(`네이버 많이 본 뉴스 실패: ${e.message.split('\n')[0]}`); }
  if (!result.naverEnt.length) notes.push('네이버 연예 랭킹에서 기사를 못 찾음 — 화면 모양이 바뀌었을 수 있음');
  if (!result.naverNews.length) notes.push('네이버 많이 본 뉴스에서 기사를 못 찾음 — 화면 모양이 바뀌었을 수 있음');

  // 본문을 읽을 기사: 트렌드 상위 키워드의 기사 + 연예 랭킹 상위 + 많이 본 뉴스 상위 (번갈아)
  const queue = [];
  const trendNews = result.trends.slice(0, 10).flatMap((t) => t.news.slice(0, 2).map((n) => ({ ...n, from: `트렌드 ${t.rank}위 ${t.keyword} (${t.traffic})` })));
  const lists = [trendNews, result.naverEnt.slice(0, 12).map((x) => ({ ...x, from: `연예 랭킹 ${x.rank}위` })), result.naverNews.slice(0, 12).map((x) => ({ ...x, from: `많이 본 뉴스 ${x.rank}위` }))];
  for (let i = 0; queue.length < maxArticles && i < 20; i++) for (const l of lists) if (l[i] && queue.length < maxArticles && !queue.some((q) => q.url === l[i].url)) queue.push(l[i]);
  for (const a of queue) {
    try { result.articles.push({ ...a, ...(await articleText(page, a.url)), url: a.url, from: a.from }); }
    catch (e) { result.articles.push({ ...a, error: e.message.split('\n')[0] }); }
  }
} finally { await browser.close(); }

fs.mkdirSync(out.replace(/[^/\\]+$/, '') || '.', { recursive: true });
fs.writeFileSync(`${out}.json`, JSON.stringify(result, null, 2));
const txt = [
  `# 아침 이슈 ${today} (모은 시각 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`,
  '', '## 구글 트렌드 (한국, 검색량)', ...result.trends.slice(0, 20).map((t) => `${t.rank}. ${t.keyword} — ${t.traffic} · ${t.news.map((n) => `${n.press}「${n.title}」`).join(' / ')}`),
  '', '## 네이버 연예 랭킹', ...result.naverEnt.slice(0, 20).map((x) => `${x.rank}. ${x.title} ${x.press ? `(${x.press})` : ''}`),
  '', '## 네이버 많이 본 뉴스', ...result.naverNews.slice(0, 20).map((x) => `${x.rank}. ${x.title} ${x.press ? `(${x.press})` : ''}`),
  '', `## 본문 저장한 기사 ${result.articles.filter((a) => a.body).length}개`, ...result.articles.map((a) => `- [${a.from}] ${a.title}${a.error ? ` ⚠ ${a.error}` : ''}`),
  ...(notes.length ? ['', '## 알림', ...notes] : []),
].join('\n');
fs.writeFileSync(`${out}.txt`, txt + '\n');
console.log(txt);
