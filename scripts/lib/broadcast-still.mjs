/**
 * 방송사 공식 홈페이지의 드라마·예능 장면 사진을 받아 온다 (2026-11-03 사용자 — "프로그램에 나온 드라마 사진을 인용, 자동으로").
 *
 * 저작권: 방송사 사진은 자유 이용 허락이 없다. 저작권법 28조 '인용'으로만 쓴다 —
 *   본문 장면 설명 바로 옆 1~2장, 대표사진(1번)에는 쓰지 않는다, 출처 "사진: SBS 「닥터X」 공식 홈페이지 (인용)".
 *   이 조건은 lint-post.mjs 가 막는다. 대표사진은 위키미디어 등 자유 이용 사진 그대로.
 *
 * 그림 계획서 (kind: "photo" 안에 still):
 *   { "n": 2, "kind": "photo", "photo": { "still": {
 *       "page": "https://programs.sbs.co.kr/drama/doctorx/visualboards/90312",   공식 포토갤러리(목록) 또는 사진 글 하나
 *       "match": ["부승권", "장희숙"],     목록에서 이 말이 제목에 든 사진 글을 먼저 연다 (없으면 최근 글)
 *       "owner": "SBS", "program": "닥터X" } },
 *     "prompt": "…사람 없는 장면…" }     못 받으면 이 그림으로 대신 (출처 줄 빠짐)
 *
 * 클라우드에서는 방송사 사이트가 막혀 있어 PC 에서만 돈다. 실패하면 dumps/still-*.png·.html 을 남긴다 (선택자 고칠 근거).
 */
import fs from 'node:fs';
import path from 'node:path';

/** 방송사·OTT 공식 사이트만 (언론사 기사 사진은 여전히 쓰지 않는다) */
export const STILL_HOSTS = [
  'programs.sbs.co.kr', 'program.kbs.co.kr', 'program.imbc.com', 'www.imbc.com', 'tv.jtbc.co.kr', 'tv.jtbc.joins.com',
  'tvn.cjenm.com', 'www.tving.com', 'mnet.cjenm.com', 'www.mbn.co.kr', 'www.ichannela.com', 'www.tvchosun.com',
  'www.enatv.com', 'program.kbsn.co.kr', 'www.kbsjoy.co.kr', 'www.mbcplus.com', 'www.netflix.com', 'about.netflix.com',
];
export const stillHostOk = (u) => { try { return STILL_HOSTS.includes(new URL(u).hostname); } catch { return false; } };

export function stillCredit(still) {
  return `사진: ${still.owner || '방송사'} 「${still.program || ''}」 공식 홈페이지 (인용)`;
}

const BAD_IMG = /logo|icon|btn|banner|sprite|blank|thumb_s|profile_s|sns|share|ad[_-]/i;

/** 지금 화면에서 큰 사진 주소들 (가로 600px 이상) */
async function bigImages(page) {
  return page.evaluate((bad) => {
    const re = new RegExp(bad, 'i');
    const out = [];
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
      if (!/^https?:/.test(src) || re.test(src)) continue;
      if ((img.naturalWidth || 0) < 600) continue;
      out.push({ src, w: img.naturalWidth, h: img.naturalHeight, alt: img.alt || '' });
    }
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og && /^https?:/.test(og) && !re.test(og)) out.push({ src: og, w: 0, h: 0, alt: 'og:image' });
    return out;
  }, BAD_IMG.source);
}

/** 목록 화면에서 사진 글로 가는 링크 — match 말이 든 것 먼저 */
async function postLinks(page, match) {
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length >= 6 && /^https?:/.test(l.href)));
  const host = new URL(page.url()).hostname;
  const same = links.filter((l) => { try { return new URL(l.href).hostname === host && /visualboard|photo|gallery|board|still/i.test(l.href); } catch { return false; } });
  const words = [].concat(match || []).filter(Boolean);
  const hit = same.filter((l) => words.some((w) => l.text.includes(w)));
  const seen = new Set();
  return [...hit, ...same].filter((l) => !usedSet.has(l.href) && !seen.has(l.href) && seen.add(l.href)).slice(0, 8);
}

async function dump(page, tag) {
  try {
    const dir = path.resolve('dumps'); fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `still-${tag}.png`), fullPage: false });
    fs.writeFileSync(path.join(dir, `still-${tag}.html`), await page.content());
  } catch { /* 덤프 실패는 무시 */ }
}

/**
 * 공식 홈페이지에서 장면 사진 1장을 받아 { buf, url, page, credit } 로 돌려준다. 못 받으면 { photo: null, why }.
 * launchBrowser: overlay.mjs 의 launch (playwright chromium)
 */
// 이미 다른 글에 쓴 사진·영상 표지는 다시 쓰지 않는다 (2026-11-03 — 닥터X 두 번째 글에 첫 글과 같은 SBS 사진 2장이 들어감).
// PC 의 dumps/stills-used.txt 에 한 줄씩 (사진 주소 또는 yt:<영상 ID>). 한 번 실행 안에서도 겹치지 않게.
const USED_FILE = path.resolve('dumps', 'stills-used.txt');
// 저장소의 content/calendar/stills-used.txt(이미 발행한 글에 쓴 사진 글 주소 — Claude 가 적는다)도 함께 읽는다
const readLines = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#')); } catch { return []; } };
const usedSet = new Set([...readLines(USED_FILE), ...readLines(path.resolve('content', 'calendar', 'stills-used.txt'))]);
function markUsed(key) { if (usedSet.has(key)) return; usedSet.add(key); try { fs.mkdirSync(path.dirname(USED_FILE), { recursive: true }); fs.appendFileSync(USED_FILE, key + '\n'); } catch { /* 기록 실패는 무시 */ } }
const usedYoutube = { has: (id) => usedSet.has('yt:' + id), add: (id) => markUsed('yt:' + id) };

async function searchYoutube(q, launchBrowser) {
  const words = (a) => [].concat(a || []).map(String).filter(Boolean);
  const must = words(q.must), episode = words(q.episode), prefer = words(q.prefer), channels = words(q.channels);
  const browser = await launchBrowser();
  try {
    const page = await (browser.contexts?.()[0] || browser).newPage();
    await page.goto((process.env.YT_SEARCH_BASE || 'https://www.youtube.com/results') + '?search_query=' + encodeURIComponent(q.query) + '&sp=CAI%253D', { waitUntil: 'domcontentloaded', timeout: 45000 }); // 업로드 날짜순
    await page.waitForSelector('a#video-title, ytd-video-renderer', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const list = await page.evaluate(() => [...document.querySelectorAll('ytd-video-renderer')].slice(0, 30).map((r) => {
      const a = r.querySelector('a#video-title'); const ch = r.querySelector('ytd-channel-name a, #channel-name a');
      return { title: (a?.getAttribute('title') || a?.textContent || '').trim(), href: a?.href || '', channel: (ch?.textContent || '').trim() };
    }));
    const norm = (t) => t.replace(/\s+/g, '');
    const has = (t, w) => norm(t).toLowerCase().includes(norm(w).toLowerCase());
    let c = list.map((v) => ({ ...v, id: (/[?&]v=([\w-]{11})/.exec(v.href) || [])[1] })).filter((v) => v.id && !usedYoutube.has(v.id));
    c = c.filter((v) => must.every((w) => has(v.title, w)) && (!episode.length || episode.some((w) => has(v.title, w))));
    if (channels.length) c = c.filter((v) => !v.channel || channels.some((w) => has(v.channel, w)));
    if (!c.length) return { why: `검색 결과 ${list.length}개 중 맞는 제목 없음 — 앞 5개: ${list.slice(0, 5).map((v) => v.title).join(' / ')}` };
    c.sort((x, y) => prefer.filter((w) => has(y.title, w)).length - prefer.filter((w) => has(x.title, w)).length);
    usedYoutube.add(c[0].id);
    return c[0];
  } finally { await browser.close().catch(() => {}); }
}

export async function fetchStill(still = {}, launchBrowser, tag = 'x') {
  // 방송사 공식 유튜브 영상의 표지 그림 (2026-11-03 — 계약결혼은 공식 홈페이지 포토가 없어 MBC에브리원 공식 채널 영상으로). still.youtube = 영상 ID
  // 그 회차 공식 클립을 PC 가 유튜브에서 찾는다 (2026-11-03 사용자 — "사진들이 어제 회차가 아니라 지난주 회차"). 검색 사이트에 새 클립이 늦게 잡혀
  // 원고를 쓸 때 영상 ID 를 모를 수 있다. still.youtube_search = { query, must: [제목에 꼭 있을 말], episode: [회차 표시 하나라도], prefer: [있으면 먼저], channels: [채널 이름 하나라도] }
  if (still.youtube_search && !still.youtube) {
    const found = await searchYoutube(still.youtube_search, launchBrowser).catch((e) => ({ why: e.message }));
    if (found.id) { still = { ...still, youtube: found.id }; console.log(`  유튜브에서 찾음: ${found.title} (${found.channel || '채널 모름'}) — ${found.id}`); }
    else return { photo: null, why: `유튜브에서 그 회차 공식 영상을 못 찾음 (${found.why})` };
  }
  if (still.youtube) {
    const id = String(still.youtube).trim();
    if (!/^[\w-]{11}$/.test(id)) return { photo: null, why: `still.youtube 영상 ID 가 이상함: ${id}` };
    let lastErr = '';
    for (const size of ['maxresdefault', 'sddefault', 'hqdefault']) {
      const url = `https://i.ytimg.com/vi/${id}/${size}.jpg`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 5000) { lastErr = '그림이 너무 작음'; continue; }
        return { photo: { buf, url, page: `https://www.youtube.com/watch?v=${id}`, credit: `사진: ${still.owner || '방송사'} 「${still.program || ''}」 공식 유튜브 (인용)` } };
      } catch (e) { lastErr = e.message; }
    }
    if (!still.page) return { photo: null, why: `유튜브 표지 그림 받기 실패 (${lastErr})` };
  }
  if (!still.page || !stillHostOk(still.page)) return { photo: null, why: `still.page 가 방송사 공식 사이트가 아님: ${still.page || '없음'}` };
  const browser = await launchBrowser();
  try {
    const ctx = browser.contexts?.()[0] || browser;
    const page = await ctx.newPage();
    await page.goto(still.page, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const tried = [];
    // ① 사진 글로 가는 링크가 있으면(목록 화면) match 말이 든 글부터 연다
    const links = await postLinks(page, still.match);
    const pages = links.length ? links.map((l) => l.href) : [];
    let found = null, from = still.page;
    for (const href of pages) {
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const imgs = (await bigImages(page)).filter((i) => i.alt !== 'og:image' || true);
      tried.push(`${href} → 큰 사진 ${imgs.length}`);
      const fresh = imgs.filter((i) => !usedSet.has(i.src));
      if (fresh.length) { found = fresh[0]; from = href; break; }
    }
    // ② 링크가 없거나 글에서 못 찾으면 처음 화면의 큰 사진
    if (!found) {
      if (pages.length) await page.goto(still.page, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const imgs = await bigImages(page);
      tried.push(`${still.page} → 큰 사진 ${imgs.length}`);
      const fresh = imgs.filter((i) => !usedSet.has(i.src));
      if (fresh.length) { found = fresh[0]; from = still.page; }
    }
    if (!found) { await dump(page, tag); return { photo: null, why: `큰 사진을 찾지 못함 (${tried.join(' / ')}) — dumps/still-${tag}.png 확인` }; }
    // 같은 화면에서 받는다 (Referer — 바로 받으면 막는 사이트가 있다)
    let buf = null, lastErr = '';
    for (let i = 1; i <= 3 && !buf; i++) {
      try {
        const r = await page.request.get(found.src, { headers: { Referer: from }, timeout: 60000 });
        if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
        buf = Buffer.from(await r.body());
      } catch (e) { lastErr = e.message; await page.waitForTimeout(i * 3000); }
    }
    if (!buf) return { photo: null, why: `사진 내려받기 실패 ${lastErr}: ${found.src}` };
    markUsed(found.src); if (from !== still.page) markUsed(from);
    return { photo: { buf, url: found.src, page: from, credit: stillCredit(still) } };
  } catch (e) {
    return { photo: null, why: `공식 홈페이지 열기 실패: ${e.message}` };
  } finally { await browser.close().catch(() => {}); }
}
