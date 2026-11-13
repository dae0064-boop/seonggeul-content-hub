#!/usr/bin/env node
/**
 * 예약발행 해 둔 네이버 글을 찾는다 (읽기만 — 아무것도 누르지 않는다, 브라우저는 닫지 않는다).
 * 2026-11-13 사용자: "16일부터 다시 진행할거야, 모두 수정해" — 11/16~18 원고 30편이 11/10~11/11 에 옛 그림으로 예약돼 있다.
 * 예약 글을 지우고 새 그림으로 다시 예약하려면 먼저 예약 글이 블로그 어디에 어떤 모양으로 보이는지 알아야 한다(아직 본 적 없음).
 *
 *   node scripts/naver-reserved.mjs seongdaeeyo --look --out dumps/reserved-look
 *
 * 남기는 것: 후보 화면마다 글자(앞 8000자)·글 링크(logNo + 글자)·'예약' 이 들어간 줄·화면 캡처, 관리 화면 메뉴 링크 전부.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith('--') && !['--out', '--cdp'].includes(argv[i - 1]));
const OUT = opt('--out', 'dumps/reserved-look');
const CDP = opt('--cdp', 'http://localhost:9222');
if (!id) { console.log('사용법: node scripts/naver-reserved.mjs <블로그 아이디> --look [--out 폴더]'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };

async function dump(page, name) {
  const all = [];
  for (const f of [page.mainFrame(), ...page.frames()]) {
    try {
      all.push(await f.evaluate((bid) => {
        const t = (document.body?.innerText || '');
        const links = [...document.querySelectorAll('a[href]')].map((a) => {
          const m = /logNo=(\d{9,})/.exec(a.href) || new RegExp(`/${bid}/(\\d{9,})`).exec(a.href);
          return { href: a.href.slice(0, 200), logNo: m ? m[1] : '', text: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
        });
        return { url: location.href, text: t.slice(0, 8000), reserveLines: t.split('\n').filter((l) => /예약/.test(l)).slice(0, 60), links };
      }, id));
    } catch { /* 다른 출처 프레임 */ }
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(all, null, 1));
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }).catch(() => {});
  const posts = all.flatMap((x) => x.links.filter((l) => l.logNo));
  const res = all.flatMap((x) => x.reserveLines);
  log(`${name}: 프레임 ${all.length} · 글 링크 ${posts.length} · '예약' 줄 ${res.length}${res.length ? ` — ${res.slice(0, 5).join(' | ')}` : ''}`);
  return all;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  try {
    log(`[예약 글 찾기] ${id} — 읽기만`);
    const go = async (u, name, wait = 3500) => { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => log(`  열기 실패 ${u}: ${e.message.split('\n')[0]}`)); await sleep(wait); return dump(page, name); };
    // ① 관리 첫 화면 — 메뉴 링크 전부 (글 관리·예약 메뉴 주소를 찾는다)
    const admin = await go(`https://admin.blog.naver.com/${id}`, '01-admin-home');
    const menu = admin.flatMap((x) => x.links).filter((l) => /글|예약|관리|post/i.test(l.text + l.href));
    fs.writeFileSync(path.join(OUT, '01-admin-menu.txt'), menu.map((l) => `${l.text}\t${l.href}`).join('\n'));
    // ② 관리 메뉴 중 '글 관리'·'예약' 이 든 주소를 열어 본다 (최대 6곳, 누르지 않고 주소로만)
    let k = 0;
    for (const l of menu.filter((l) => /글\s*관리|예약|postmanage|post\/list|PostManage/i.test(l.text + l.href)).slice(0, 6)) {
      await go(l.href, `02-admin-${++k}`);
    }
    // ③ 내 블로그 글 목록 (주인으로 볼 때 예약 글이 보이는지)
    await go(`https://blog.naver.com/PostList.naver?blogId=${id}&categoryNo=0&from=postList`, '03-postlist');
    // ④ 모바일 글 목록 API (주인 쿠키로) — 예약 글 표시가 있는지
    for (const p of [1, 2]) {
      const t = await page.evaluate(async (u) => (await fetch(u, { credentials: 'include' })).text(), `https://m.blog.naver.com/api/blogs/${id}/post-list?categoryNo=0&itemCount=30&page=${p}`).catch((e) => `ERR ${e.message}`);
      fs.writeFileSync(path.join(OUT, `04-mobile-api-${p}.json`), t);
      log(`04-mobile-api-${p}: ${t.length}자 · '예약'·reserve 글자 ${(t.match(/예약|reserv/gi) || []).length}`);
    }
    // ⑤ 글쓰기 화면 (예약·임시저장 목록 단추 글자만 읽는다 — 누르지 않음)
    await go(`https://blog.naver.com/${id}?Redirect=Write&`, '05-write', 7000);
    log('\n끝 — 아무것도 바꾸지 않았어요.');
  } catch (e) { log(`✖ 오류: ${e.message.split('\n')[0]}`); }
  finally {
    fs.writeFileSync(path.join(OUT, 'reserved-look-log.txt'), lines.join('\n') + '\n');
    await Promise.race([page.close().catch(() => {}), sleep(3000)]);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
