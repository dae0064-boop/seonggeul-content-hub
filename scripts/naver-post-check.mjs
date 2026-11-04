#!/usr/bin/env node
/**
 * 블로그 '전체보기' 목록에 안 나오는 발행 글을 하나씩 찾아, 지금 어느 카테고리·어떤 상태인지 읽는다 (읽기만).
 * 2026-11-04 사용자: "연예·방송 글 안 보여" — 11/2~11/4 이슈·연예 글 18편이 전체보기·모바일 글 목록에 없는데
 * 통계에는 조회가 찍힌다(100일의 거짓말 41·닥터X 23, 11/4 09시). 어디에 들어가 있는지부터 본다.
 *
 *   node scripts/naver-post-check.mjs seongdaeeyo --out dumps/post-check [--list content/archive/missing-posts.tsv]
 *
 * 찾는 순서: ① 블로그 관리 '조회수 순위' 화면의 글 링크 ② 블로그 안 검색(제목). 찾은 글은 글 화면을 열어
 * 카테고리 이름·공개 상태 글자를 남긴다. 아무것도 누르거나 바꾸지 않는다. 브라우저는 닫지 않는다.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith('--') && !['--out', '--cdp', '--list'].includes(argv[i - 1]));
const OUT = opt('--out', 'dumps/post-check');
const CDP = opt('--cdp', 'http://localhost:9222');
const LIST = opt('--list', 'content/archive/missing-posts.tsv');
if (!id) { console.log('사용법: node scripts/naver-post-check.mjs <블로그 아이디> [--out 폴더]'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };

/** 페이지와 그 안 프레임에서 글 링크(logNo)와 글자를 모은다 */
async function links(page) {
  const out = [];
  for (const f of [page.mainFrame(), ...page.frames()]) {
    try {
      out.push(...await f.evaluate((bid) => [...document.querySelectorAll('a[href]')].map((a) => {
        const m = /logNo=(\d{9,})/.exec(a.href) || new RegExp(`/${bid}/(\\d{9,})`).exec(a.href) || /\/article\/(\d{9,})/.exec(a.href);
        return m ? { logNo: m[1], text: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim() } : null;
      }).filter(Boolean), id));
    } catch { /* 다른 출처 */ }
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const want = fs.readFileSync(LIST, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const [d, t] = l.split('\t'); return { date: d, title: norm(t) }; });
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  const found = new Map();
  const key = (t) => norm(t).replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 18);
  const match = (text) => want.find((w) => key(text) && key(w.title).startsWith(key(text).slice(0, 12)));
  try {
    log(`[글 찾기] ${id} — 찾을 글 ${want.length}편`);
    // ① 조회수 순위 (어제·오늘)
    for (const u of [`https://admin.blog.naver.com/${id}/stat/rank_pv`]) {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); await sleep(3500);
      const ls = await links(page);
      for (const l of ls) { const w = match(l.text); if (w && !found.has(w.title)) found.set(w.title, l.logNo); }
      log(`조회수 순위 화면: 글 링크 ${ls.length}개, 찾은 글 ${found.size}편`);
    }
    // ② 블로그 안 검색
    for (const w of want) {
      if (found.has(w.title)) continue;
      const q = encodeURIComponent(w.title.split(/[,?]/)[0]);
      await page.goto(`https://blog.naver.com/PostSearchList.naver?blogId=${id}&orderType=sim&searchText=${q}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await sleep(2000);
      const ls = await links(page);
      const hit = ls.find((l) => match(l.text) === w);
      if (hit) found.set(w.title, hit.logNo);
      await sleep(500);
    }
    log(`블로그 안 검색까지 찾은 글 ${found.size}/${want.length}편\n`);
    // ③ 글 화면에서 카테고리·상태 읽기
    const rows = ['date\tlogNo\tcategory\topen\ttitle'];
    let n = 0;
    for (const w of want) {
      const no = found.get(w.title);
      if (!no) { log(`✖ 못 찾음: ${w.date} ${w.title}`); rows.push(`${w.date}\t\t\t\t${w.title}`); continue; }
      await page.goto(`https://blog.naver.com/PostView.naver?blogId=${id}&logNo=${no}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await sleep(2500);
      const info = await page.evaluate(() => {
        const t = document.body?.innerText || '';
        const cat = (document.querySelector('.blog2_series a, .pcol2 .blog2_series, a.pcol2[href*="categoryNo"], .se_series a, .blog_category a') || {}).innerText || '';
        const html = document.documentElement.outerHTML;
        const cno = (/categoryNo\s*[=:]\s*['"]?(\d+)/.exec(html) || [])[1] || '';
        const open = /비공개|이웃공개|서로이웃공개/.exec(t.slice(0, 3000))?.[0] || '';
        const blocked = /게시중단|임시조치|권리침해|볼 수 없|삭제되었|존재하지 않/.exec(t)?.[0] || '';
        return { cat: cat.trim(), cno, open, blocked, head: t.replace(/\s+/g, ' ').slice(0, 300) };
      }).catch((e) => ({ err: e.message }));
      if (n++ < 3) fs.writeFileSync(path.join(OUT, `post-${no}.txt`), JSON.stringify(info, null, 1));
      log(`${w.date} [${info.cat || '?'}${info.cno ? ` #${info.cno}` : ''}]${info.open ? ` ${info.open}` : ''}${info.blocked ? ` ⚠ ${info.blocked}` : ''} ${w.title} (${no})`);
      rows.push(`${w.date}\t${no}\t${info.cat}#${info.cno}\t${info.open}${info.blocked ? ` ⚠${info.blocked}` : ''}\t${w.title}`);
    }
    fs.writeFileSync(path.join(OUT, 'post-check.tsv'), rows.join('\n') + '\n');
  } catch (e) { log(`✖ 오류: ${e.message.split('\n')[0]}`); }
  finally {
    fs.writeFileSync(path.join(OUT, 'post-check-log.txt'), lines.join('\n') + '\n');
    await Promise.race([page.close().catch(() => {}), sleep(3000)]);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
