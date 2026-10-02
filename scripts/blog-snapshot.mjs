#!/usr/bin/env node
/**
 * 다른 네이버 블로그(공개 글)의 최근 글 모양을 기록한다. 홈판에 잘 걸리는 블로그와 우리 블로그를 견주려고 만들었다
 * (2026-10-02 사용자 요청: "rich_grandmom 은 홈판에 많이 노출된다, 이유를 알아볼 수 있을까").
 *
 * 클라우드 세션은 네이버에 들어갈 수 없어서, 사용자 PC 의 자동화용 크롬(9222)에 붙어 읽는다.
 * 글을 쓰거나 누르지 않는다. 읽기만 하고, 연 탭만 닫는다 (브라우저는 닫지 않는다).
 *
 *   node scripts/blog-snapshot.mjs rich_grandmom seongdaeeyo --out dumps/blog-snapshot/2026-10-03
 *
 * 남기는 것 (<out>/<블로그>/):
 *   list.json      최근 글 목록 (제목·날짜·공감·댓글·카테고리 — 네이버가 주는 그대로)
 *   posts.json     최근 글 몇 편의 모양 (본문 글자 수, 사진·인용구·스티커·동영상 수, 첫머리, 태그)
 *   NN-<글번호>.jpg 각 글 첫 화면 (작게)
 *   summary.md     사람이 읽기 쉬운 요약
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const ids = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out' && argv[i - 1] !== '--cdp' && argv[i - 1] !== '--posts');
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = opt('--out', `dumps/blog-snapshot/${new Date().toISOString().slice(0, 10)}`);
const CDP = opt('--cdp', 'http://localhost:9222');
const N = +opt('--posts', 12);
if (!ids.length) { console.log('사용법: node scripts/blog-snapshot.mjs <블로그아이디> [...] [--out 폴더] [--posts 12]'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

/** 글 화면에서 모양을 센다 (스마트에디터 ONE 기준, 없으면 옛 에디터 기준) */
function measure() {
  const root = document.querySelector('.se-main-container') || document.querySelector('#postViewArea') || document.body;
  const txt = (el) => (el?.textContent || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
  const paras = [...root.querySelectorAll('.se-text-paragraph')].map(txt);
  const body = paras.length ? paras.join('\n') : txt(root);
  const lines = paras.filter(Boolean);
  const emoji = (body.match(/\p{Extended_Pictographic}/gu) || []).length;
  const tags = [...document.querySelectorAll('.post_tag a, a[href*="/tags/"], .tag_area a, .wrap_tag a')].map(txt).filter(Boolean);
  return {
    title: txt(document.querySelector('.se-title-text, .se_title, h3.tit_h3, .pcol1')) || document.title,
    chars: body.replace(/\s/g, '').length,
    lines: lines.length,
    avgLine: lines.length ? Math.round(lines.reduce((a, l) => a + l.length, 0) / lines.length) : 0,
    blankParas: paras.filter((p) => !p).length,
    images: root.querySelectorAll('img.se-image-resource').length || root.querySelectorAll('.se-component.se-image, .se-imageGroup img, .se-imageStrip img').length,
    imageGroups: root.querySelectorAll('.se-imageGroup, .se-imageStrip').length,
    quotes: root.querySelectorAll('.se-quotation').length,
    stickers: root.querySelectorAll('.se-sticker').length,
    videos: root.querySelectorAll('.se-video, .se-oembed').length,
    maps: root.querySelectorAll('.se-placesMap, .se-map').length,
    links: root.querySelectorAll('.se-oglink').length,
    horizontal: root.querySelectorAll('.se-horizontalLine').length,
    emoji,
    head: lines.slice(0, 8),
    tail: lines.slice(-4),
    tags: [...new Set(tags)].slice(0, 30),
    sympathy: txt(document.querySelector('.u_likeit_text._count, .u_cnt._count, .like_cnt')),
    comments: txt(document.querySelector('.comment_count, ._commentCount, .num_comment')),
  };
}

async function readList(page, id) {
  await page.goto(`https://m.blog.naver.com/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  // 모바일 블로그가 쓰는 목록 주소. 모양이 바뀌면 아래 화면 읽기로 넘어간다.
  const api = await page.evaluate(async (id) => {
    try {
      const r = await fetch(`/api/blogs/${id}/post-list?categoryNo=0&itemCount=30&page=1`, { credentials: 'include' });
      return r.ok ? await r.json() : { error: r.status };
    } catch (e) { return { error: String(e) }; }
  }, id);
  const items = api?.result?.items || api?.result?.postList || [];
  if (items.length) {
    return {
      raw: api,
      posts: items.map((p) => ({
        logNo: String(p.logNo ?? p.postNo ?? ''),
        title: p.titleWithInspectMessage ?? p.title ?? '',
        date: p.addDate ?? p.addDateTime ?? '',
        category: p.categoryName ?? '',
        sympathy: p.sympathyCnt ?? p.likeCnt ?? null,
        comments: p.commentCnt ?? null,
        brief: (p.briefContents ?? '').slice(0, 120),
        hasThumb: !!(p.thumbnailUrl || p.thumbnailList?.length),
      })).filter((p) => p.logNo),
    };
  }
  // 화면에서 글 링크를 모은다
  const posts = await page.evaluate((id) => {
    const seen = new Set(), out = [];
    for (const a of document.querySelectorAll(`a[href*="/${id}/"]`)) {
      const m = a.href.match(new RegExp(`/${id}/(\\d{6,})`));
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ logNo: m[1], title: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
    }
    return out;
  }, id);
  return { raw: api, posts };
}

async function main() {
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  try {
    for (const id of ids) {
      const dir = path.join(OUT, id);
      fs.mkdirSync(dir, { recursive: true });
      log(`\n▶ ${id}`);
      let list;
      try { list = await readList(page, id); }
      catch (e) { log(`  목록을 읽지 못함: ${e.message.split('\n')[0]}`); continue; }
      fs.writeFileSync(path.join(dir, 'list.json'), JSON.stringify(list, null, 2));
      log(`  최근 글 ${list.posts.length}편`);

      const measured = [];
      for (const [i, p] of list.posts.slice(0, N).entries()) {
        try {
          await page.goto(`https://m.blog.naver.com/${id}/${p.logNo}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(2500);
          await page.evaluate(() => window.scrollTo(0, 0));
          const m = await page.evaluate(measure);
          await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, '0')}-${p.logNo}.jpg`), type: 'jpeg', quality: 55 });
          measured.push({ ...p, ...m });
          log(`  ${i + 1}. ${m.title.slice(0, 40)} — ${m.chars}자 · 사진 ${m.images} · 인용구 ${m.quotes} · 스티커 ${m.stickers}`);
        } catch (e) { log(`  ${i + 1}. ${p.logNo} 읽지 못함: ${e.message.split('\n')[0]}`); }
      }
      fs.writeFileSync(path.join(dir, 'posts.json'), JSON.stringify(measured, null, 2));

      const avg = (k) => measured.length ? Math.round(measured.reduce((a, m) => a + (+m[k] || 0), 0) / measured.length) : 0;
      const md = [
        `# ${id} — 최근 글 ${measured.length}편`,
        '',
        `평균: 본문 ${avg('chars')}자 · 줄 ${avg('lines')} (평균 ${avg('avgLine')}자) · 사진 ${avg('images')} · 인용구 ${avg('quotes')} · 스티커 ${avg('stickers')} · 동영상 ${avg('videos')} · 이모지 ${avg('emoji')}`,
        '',
        '| # | 제목 | 날짜 | 카테고리 | 공감 | 댓글 | 글자 | 사진 | 인용구 | 스티커 |',
        '|---|---|---|---|---|---|---|---|---|---|',
        ...measured.map((m, i) => `| ${i + 1} | ${m.title.replace(/\|/g, '/')} | ${m.date} | ${m.category} | ${m.sympathy ?? ''} | ${m.comments ?? ''} | ${m.chars} | ${m.images} | ${m.quotes} | ${m.stickers} |`),
        '',
        ...measured.map((m, i) => [`## ${i + 1}. ${m.title}`, '', '첫머리:', ...m.head.map((l) => `> ${l}`), '', `태그: ${m.tags.join(', ')}`, ''].join('\n')),
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'summary.md'), md);
    }
  } finally {
    await page.close().catch(() => {});
    // 사용자의 브라우저는 닫지 않는다 — 연결만 끊는다
  }
  log(`\n✅ 저장: ${OUT}`);
  process.exit(0);
}
main();
