#!/usr/bin/env node
/**
 * 내 블로그에 달린 댓글을 읽어 답글 초안 재료로 남긴다 (2026-11-13 사용자 "다 진행해줘" — 댓글 답글 초안 매일).
 *
 * 클라우드 세션은 네이버에 들어갈 수 없어서, 사용자 PC 의 자동화용 크롬(9222)에 붙어 읽는다.
 * 읽기만 한다 — 답글을 쓰거나 누르지 않는다(답글은 사용자가 단다). 연 탭만 닫고 브라우저는 닫지 않는다.
 *
 *   node scripts/blog-comments.mjs seongdaeeyo --out dumps/blog-comments/2026-11-13 [--pages 4] [--max 25]
 *
 * 남기는 것 (<out>/):
 *   comments.json  댓글 있는 글마다 [{ nick, text, date, reply, owner }]
 *   comments.md    사람이 읽기 쉬운 모양 — 아침 확인(routines/morning-check.md)이 이걸 읽어 답글 초안을 쓴다
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) || 'seongdaeeyo';
const OUT = opt('--out', `dumps/blog-comments/${new Date().toISOString().slice(0, 10)}`);
const CDP = opt('--cdp', 'http://localhost:9222');
const PAGES = +opt('--pages', 4);   // 한 쪽 30편 — 하루 10편이면 약 12일 치
const MAX = +opt('--max', 25);      // 댓글 있는 글을 몇 편까지 열지
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 댓글 화면(네이버 cbox)에서 댓글을 읽는다. 모양이 바뀌면 글자만이라도 남긴다 */
function readComments() {
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const items = [...document.querySelectorAll('li.u_cbox_comment')].map((li) => ({
    nick: txt(li.querySelector('.u_cbox_nick')),
    text: txt(li.querySelector('.u_cbox_contents')) || txt(li.querySelector('.u_cbox_text_wrap')),
    date: txt(li.querySelector('.u_cbox_date')),
    reply: /reply/.test(li.className) || !!li.closest('.u_cbox_reply_area'),
    owner: /owner|editor|blogger/i.test(li.innerHTML.slice(0, 3000).match(/class="[^"]*ico[^"]*"/g)?.join(' ') || ''),
  })).filter((c) => c.text);
  const raw = items.length ? '' : txt(document.querySelector('.u_cbox, #naverComment, .comment_area, body')).slice(0, 3000);
  return { items, raw };
}

async function main() {
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  const result = [];
  try {
    await page.goto(`https://m.blog.naver.com/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    const posts = [];
    for (let p = 1; p <= PAGES; p++) {
      const api = await page.evaluate(async ({ id, p }) => {
        try {
          const r = await fetch(`/api/blogs/${id}/post-list?categoryNo=0&itemCount=30&page=${p}`, { credentials: 'include' });
          return r.ok ? await r.json() : { error: r.status };
        } catch (e) { return { error: String(e) }; }
      }, { id, p });
      const items = api?.result?.items || api?.result?.postList || [];
      if (!items.length) { if (p === 1) console.log(`글 목록을 읽지 못함: ${JSON.stringify(api).slice(0, 200)}`); break; }
      for (const it of items) posts.push({ logNo: String(it.logNo ?? ''), title: it.titleWithInspectMessage ?? it.title ?? '', date: it.addDate ?? '', comments: +(it.commentCnt ?? 0) });
    }
    const withC = posts.filter((x) => x.logNo && x.comments > 0).slice(0, MAX);
    console.log(`최근 글 ${posts.length}편 중 댓글 있는 글 ${withC.length}편`);
    for (const po of withC) {
      try {
        await page.goto(`https://m.blog.naver.com/CommentList.naver?blogId=${id}&logNo=${po.logNo}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2500);
        const r = await page.evaluate(readComments);
        result.push({ ...po, ...r });
        console.log(`  ${po.title.slice(0, 30)} — 댓글 ${r.items.length}개${r.raw ? ' (모양을 못 읽어 글자만 남김)' : ''}`);
      } catch (e) { console.log(`  ${po.logNo} 읽지 못함: ${e.message.split('\n')[0]}`); }
    }
  } finally {
    await page.close().catch(() => {});
    // 사용자의 브라우저는 닫지 않는다 — 연결만 끊는다
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'comments.json'), JSON.stringify(result, null, 2));
  const md = [`# 내 블로그 댓글 (${new Date().toISOString().slice(0, 10)}) — 댓글 있는 글 ${result.length}편`, ''];
  for (const r of result) {
    md.push(`## ${r.title} (${r.date}, 글번호 ${r.logNo})`, `https://blog.naver.com/${id}/${r.logNo}`, '');
    for (const c of r.items) md.push(`- ${c.reply ? '  ↳ ' : ''}${c.owner ? '[블로그 주인] ' : ''}${c.nick} (${c.date}): ${c.text}`);
    if (r.raw) md.push('', '(댓글 모양을 못 읽음 — 화면 글자)', '', r.raw);
    md.push('');
  }
  fs.writeFileSync(path.join(OUT, 'comments.md'), md.join('\n'));
  console.log(`✅ 저장: ${OUT}`);
  process.exit(0);
}
main();
