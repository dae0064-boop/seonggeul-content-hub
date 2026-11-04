#!/usr/bin/env node
/**
 * 내 네이버 블로그에 실제로 올라간 글 전부와 지금 들어 있는 카테고리를 블로그에서 직접 읽는다.
 * 2026-11-04 사용자: "내 블로그를 들어가서 한번에 확인해야지, 너가 써준 것만 하지 말고" — 저장소 기록이 아니라
 * 블로그 화면 그대로(사용자가 손으로 쓴 글·맛집 후기 포함)를 보고 카테고리를 다시 맞추려고.
 *
 * 읽기만 한다 — 아무것도 누르거나 바꾸지 않는다. 연 탭만 닫는다 (브라우저는 닫지 않는다).
 * 옮기기는 이 결과를 Claude 가 글마다 보고 정한 뒤 따로 한다. 글 관리 화면 모양을 아직 모르므로 그 화면도 글자·캡처로 남긴다.
 *
 *   node scripts/naver-category-scan.mjs seongdaeeyo --out dumps/category-scan/2026-11-04
 *
 * 남기는 것 (<out>/):
 *   categories.tsv   카테고리 번호·이름·상위 카테고리·글 수
 *   posts.tsv        글 번호(logNo)·날짜·카테고리 번호·카테고리 이름·제목·첫 문장
 *   summary.txt      카테고리별 글 수, 읽은 방법
 *   admin-*.txt/jpg  블로그 관리의 글 관리 화면 (옮기기 단계를 만들 때 본다)
 *   raw-*.json       블로그가 돌려준 원래 데이터 (처음 몇 쪽만)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith('--') && !['--out', '--cdp'].includes(argv[i - 1]));
const OUT = opt('--out', `dumps/category-scan/${new Date().toISOString().slice(0, 10)}`);
const CDP = opt('--cdp', 'http://localhost:9222');
if (!id) { console.log('사용법: node scripts/naver-category-scan.mjs <내 블로그 아이디> [--out 폴더]'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/[\t\r\n]+/g, ' ').trim();
const dec = (s) => { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch { return String(s); } };

/** 페이지 안에서(로그인 쿠키 그대로) 주소를 읽어 글자로 돌려준다 */
async function getText(page, url) {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    return { status: r.status, text: await r.text() };
  }, url);
}
/** 네이버 옛 주소는 JSON 안에 \' 같은 잘못된 이스케이프를 넣는다 — 고쳐서 읽는다 */
function looseJson(t) {
  try { return JSON.parse(t); } catch { /* 아래 */ }
  try { return JSON.parse(t.replace(/\\'/g, "'").replace(/[\u0000-\u001f]/g, ' ')); } catch { return null; }
}

// ① 모바일 블로그 API (카테고리 목록·글 목록)
async function viaMobile(page) {
  await page.goto(`https://m.blog.naver.com/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  const cr = await getText(page, `https://m.blog.naver.com/api/blogs/${id}/category-list`);
  fs.writeFileSync(path.join(OUT, 'raw-category-list.json'), cr.text.slice(0, 200000));
  const cj = looseJson(cr.text);
  const list = cj?.result?.mylogCategoryList || cj?.result?.categoryList || [];
  const cats = list.map((c) => ({ no: String(c.categoryNo), name: clean(c.categoryName), parent: String(c.parentCategoryNo ?? ''), count: c.postCnt ?? c.openPostCnt ?? '' }));
  const posts = [];
  for (let p = 1; p <= 200; p++) {
    const r = await getText(page, `https://m.blog.naver.com/api/blogs/${id}/post-list?categoryNo=0&itemCount=30&page=${p}`);
    if (p <= 2) fs.writeFileSync(path.join(OUT, `raw-post-list-${p}.json`), r.text.slice(0, 200000));
    const j = looseJson(r.text);
    const items = j?.result?.items || [];
    if (!items.length) break;
    for (const it of items) {
      posts.push({
        logNo: String(it.logNo), date: it.addDate ? new Date(it.addDate).toISOString().slice(0, 10) : '',
        categoryNo: String(it.categoryNo ?? ''), title: clean(it.titleWithInspectMessage || it.title),
        brief: clean(it.briefContents).slice(0, 80),
      });
    }
    await sleep(400);
  }
  return { cats, posts, how: '모바일 블로그 API' };
}

// ② 옛 PC 블로그 글 목록 (①이 안 될 때)
async function viaDesktop(page) {
  await page.goto(`https://blog.naver.com/PostList.naver?blogId=${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  const posts = [];
  for (let p = 1; p <= 200; p++) {
    const r = await getText(page, `https://blog.naver.com/PostTitleListAsync.naver?blogId=${id}&viewdate=&currentPage=${p}&categoryNo=0&parentCategoryNo=&countPerPage=30`);
    if (p <= 2) fs.writeFileSync(path.join(OUT, `raw-title-list-${p}.json`), r.text.slice(0, 200000));
    const j = looseJson(r.text);
    const items = j?.postList || [];
    if (!items.length) break;
    let fresh = 0;
    for (const it of items) {
      if (posts.some((x) => x.logNo === String(it.logNo))) continue;
      fresh++;
      posts.push({ logNo: String(it.logNo), date: clean(it.addDate), categoryNo: String(it.categoryNo ?? ''), title: clean(dec(it.title)), brief: '' });
    }
    if (!fresh) break; // 마지막 쪽을 넘기면 같은 쪽을 되돌려 준다
    await sleep(400);
  }
  return { cats: [], posts, how: 'PC 블로그 글 목록' };
}

// ③ 블로그 관리 — 글 관리 화면을 글자·캡처로 남긴다 (옮기기 단계를 만들 근거). 누르는 것은 메뉴 링크 따라가기뿐.
async function dumpAdmin(page) {
  const shots = [];
  const save = async (name) => {
    try {
      fs.writeFileSync(path.join(OUT, `admin-${name}.txt`), (await page.evaluate(() => document.body.innerText)).slice(0, 100000));
      await page.screenshot({ path: path.join(OUT, `admin-${name}.jpg`), type: 'jpeg', quality: 60, fullPage: true });
      // 화면 안 iframe 글자도
      let n = 0;
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        try { const t = await f.evaluate(() => document.body?.innerText || ''); if (t.trim()) fs.writeFileSync(path.join(OUT, `admin-${name}-frame${++n}.txt`), `${f.url()}\n\n${t.slice(0, 100000)}`); } catch { /* 다른 출처 */ }
      }
      shots.push({ name, url: page.url() });
    } catch (e) { shots.push({ name, error: e.message.split('\n')[0] }); }
  };
  try {
    await page.goto(`https://admin.blog.naver.com/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2500);
    await save('01-home');
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => ({ t: (a.innerText || '').trim(), h: a.href })).filter((x) => x.h && x.t));
    fs.writeFileSync(path.join(OUT, 'admin-links.json'), JSON.stringify(links, null, 1));
    const want = ['글 관리', '게시글 관리', '글배치', '글 배치', '카테고리 관리', '메뉴·글·동영상 관리', '메뉴 관리'];
    const seen = new Set();
    let n = 1;
    for (const w of want) {
      const l = links.find((x) => x.t.replace(/\s+/g, ' ').includes(w) && !seen.has(x.h));
      if (!l) continue;
      seen.add(l.h);
      await page.goto(l.h, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2500);
      await save(`${String(++n).padStart(2, '0')}-${w.replace(/[^가-힣A-Za-z]/g, '')}`);
    }
  } catch (e) { shots.push({ error: e.message.split('\n')[0] }); }
  return shots;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  let res = { cats: [], posts: [], how: '' };
  const notes = [];
  try {
    try { res = await viaMobile(page); } catch (e) { notes.push(`모바일 API 실패: ${e.message.split('\n')[0]}`); }
    if (!res.posts.length) {
      notes.push('모바일 API 로 글을 못 읽어 PC 글 목록으로 다시 읽음');
      try { const d = await viaDesktop(page); res = { ...d, cats: res.cats }; } catch (e) { notes.push(`PC 글 목록 실패: ${e.message.split('\n')[0]}`); }
    }
    const name = Object.fromEntries(res.cats.map((c) => [c.no, c.name]));
    fs.writeFileSync(path.join(OUT, 'categories.tsv'),
      ['categoryNo\tname\tparentNo\tcount', ...res.cats.map((c) => `${c.no}\t${c.name}\t${c.parent}\t${c.count}`)].join('\n') + '\n');
    fs.writeFileSync(path.join(OUT, 'posts.tsv'),
      ['logNo\tdate\tcategoryNo\tcategory\ttitle\tbrief', ...res.posts.map((p) => `${p.logNo}\t${p.date}\t${p.categoryNo}\t${name[p.categoryNo] || ''}\t${p.title}\t${p.brief}`)].join('\n') + '\n');
    const by = {};
    for (const p of res.posts) { const k = name[p.categoryNo] || `번호 ${p.categoryNo}`; by[k] = (by[k] || 0) + 1; }
    const admin = await dumpAdmin(page);
    const summary = [
      `[블로그 카테고리 확인] ${id} — ${new Date().toISOString()}`,
      `읽은 방법: ${res.how || '없음'}`, ...notes,
      `글 ${res.posts.length}편, 카테고리 ${res.cats.length}개`, '',
      ...Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}편`), '',
      `글 관리 화면: ${admin.map((a) => a.name || a.error).join(', ')}`,
    ].join('\n');
    fs.writeFileSync(path.join(OUT, 'summary.txt'), summary + '\n');
    console.log(summary);
    if (!res.posts.length) process.exitCode = 2;
  } finally {
    await Promise.race([page.close().catch(() => {}), sleep(3000)]);
    // 사용자의 브라우저 — 끄지 않고 연결만 끊는다
  }
}
main().then(() => process.exit(process.exitCode || 0), (e) => { console.error(e); process.exit(1); });
