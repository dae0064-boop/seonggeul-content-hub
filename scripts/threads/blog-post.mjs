#!/usr/bin/env node
/**
 * 스레드 블로그 유입 글 올리기 — 그날 묶음(content/threads/blog/<오늘>.md)에서 한 편.
 * 규칙 정본: content/threads/blog.md. 2026-11-02 사용자: "보험 심의글 전에 이런 식으로 생활보장에는 올려보자".
 *
 *   node scripts/threads/blog-post.mjs            시험: 올릴 글만 보여 줌
 *   node scripts/threads/blog-post.mjs --post     실제로 한 편 (본문 + 바로 아래 답글에 블로그 주소)
 *
 * 한 번 실행 = 많아야 한 편. 하나라도 어긋나면 올리지 않는다:
 *   - 멈춤: content/threads/PAUSE-BLOG 파일, THREADS_PAUSED. (보험 심의글 멈춤 PAUSE 와는 따로 — 사용자가 이것만 켰다)
 *   - 묶음 검사(blog-set.mjs)가 통과한다
 *   - '바로' 갈래만. '심의' 갈래는 GOMS 적격·심의필 흐름을 붙이기 전까지 올리지 않는다
 *   - 묶음의 '시각'이 지났다
 *   - 그 네이버 글이 내 블로그 공개 글 목록에 있다 (예약만 된 글은 목록에 없다 → 주소가 열릴 때만)
 *   - 이미 올린 글이 아니다 — 상태 파일 없이 내 스레드를 되읽어 첫 줄로 본다 (두 PC 가 함께 돌아도 두 번 올리지 않게)
 *   - 마지막 블로그 유입 글이 40분보다 오래됐다, 오늘 3편보다 적다
 *   - 본문이 올라갔는데 답글이 빠졌으면 새 글보다 그 답글을 먼저 붙인다
 *
 * 종료 코드: 0 = 올림 또는 올릴 것 없음, 1 = 설정 문제, 2 = 올리다 실패
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DIR, loadEnv, kstStamp, kstDayStartUnix, isMain, log, step, warn } from './config.mjs';
import { threadsApi } from './api.mjs';
import { checkSet } from './blog-set.mjs';
import { fetchPostList, readMyBlogId, normTitle } from '../lib/naver-related.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const doPost = argv.includes('--post');
const postedTsv = arg('--posted'); // Drive run-logs/threads/blog-posted.tsv (있으면 기록만)
const maxPerDay = Number(arg('--max-per-day', '5')); // 2026-11-02 사용자 "매일 5개씩"
const gapMin = Number(arg('--gap-min', '40'));
const PAUSE_BLOG = path.join(DIR, 'PAUSE-BLOG');

export const head = (t) => String(t || '').normalize('NFC').split('\n').filter((l) => l.trim())[0]?.replace(/[^\p{L}\p{N}]/gu, '') || '';

function paused() {
  if (fs.existsSync(PAUSE_BLOG)) return `PAUSE-BLOG 파일이 있어요 — ${fs.readFileSync(PAUSE_BLOG, 'utf8').trim()}`;
  if (['1', 'true', 'yes', 'on'].includes(String(process.env.THREADS_PAUSED || '').toLowerCase())) return 'THREADS_PAUSED 가 켜져 있어요';
  return null;
}

function postTitle(slug) {
  const f = [path.join(ROOT, 'content', 'posts', `${slug}.md`), path.join(DIR, 'blog', 'src', `${slug}.md`)].find((x) => fs.existsSync(x));
  if (!f) return '';
  const raw = fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
  return (/^title:\s*(.+)$/m.exec(raw) || [])[1]?.trim() || '';
}

function record(it, url1, url2) {
  if (!postedTsv) return;
  try { fs.appendFileSync(postedTsv, [kstStamp().slice(0, 16), it['원고'], head(it.body).slice(0, 30), url1 || '', url2 || ''].join('\t') + '\n', 'utf8'); }
  catch (e) { warn(`게시 기록을 남기지 못했어요: ${e.message}`); }
}

async function main() {
  loadEnv();
  const now = arg('--now') || kstStamp(); // "YYYY-MM-DD HH:MM (KST)" — --now 는 시험용
  const today = now.slice(0, 10), hhmm = now.slice(11, 16);
  step(`스레드 블로그 유입 글 ${doPost ? '올리기' : '시험 (올리지 않음)'} — ${now}`);
  const p = paused();
  if (p) { log(`멈춤: ${p}`); return 0; }
  const file = path.join(DIR, 'blog', `${today}.md`);
  if (!fs.existsSync(file)) { log(`오늘 묶음이 없어요 (content/threads/blog/${today}.md)`); return 0; }

  const { errors, items } = checkSet(file);
  if (errors.length) { log(`묶음 검사 불통과 — 올리지 않아요:\n     ${errors.join('\n     ')}`); return 1; }
  const direct = items.filter((it) => it['갈래'] === '바로' && !it.gone);
  const skipped = items.length - direct.length;
  if (skipped) log(`'심의' 갈래 ${skipped}편은 아직 올리지 않아요 (GOMS 적격 흐름을 붙인 뒤)`);
  const due = direct.filter((it) => it['시각'] <= hhmm);
  log(`오늘 '바로' ${direct.length}편 · 시각 지난 것 ${due.length}편`);
  if (!due.length) return 0;

  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) { log('스레드 연결 키(THREADS_ACCESS_TOKEN)가 이 PC 에 없어요 — launchers\\threads-key.cmd'); return 1; }
  const blogId = readMyBlogId(path.join(ROOT, 'content', 'research', 'my-blog.txt'));
  if (!blogId) { log('내 블로그 아이디(content/research/my-blog.txt)가 없어요'); return 1; }

  // 내 블로그 공개 글 목록 → 그 원고의 주소 (예약만 된 글은 여기 없다)
  const list = await fetchPostList(blogId, { pages: 10, log }); // 지난 글(src)도 찾게 넉넉히
  const urlOf = (it) => {
    const t = normTitle(postTitle(it['원고']));
    if (!t) return '';
    const hit = list.find((x) => normTitle(x.title) === t);
    return hit ? `https://blog.naver.com/${blogId}/${hit.logNo}` : '';
  };

  const api = threadsApi(token);
  const me = await api.me();
  const posts = await api.myPosts({ limit: 50, since: kstDayStartUnix() - 3 * 86400 });
  const byHead = new Map(direct.map((it) => [head(it.body), it]));
  const ours = posts.filter((x) => byHead.has(head(x.text)));
  const todayOurs = ours.filter((x) => Date.parse(x.timestamp) / 1000 >= kstDayStartUnix());
  log(`계정 @${me.username} · 오늘 블로그 유입 글 ${todayOurs.length}/${maxPerDay}`);

  // 본문만 올라가고 링크 답글이 빠진 글 — 먼저 붙인다
  if (ours.length) {
    const replies = await api.myReplies({ limit: 50 }).catch(() => null);
    for (const x of ours) {
      if (!replies) { warn('내 답글 목록을 읽지 못해 빠진 답글은 이번에 확인하지 못했어요'); break; }
      if (replies.some((r) => r.replied_to?.id === x.id || r.root_post?.id === x.id)) continue;
      const it = byHead.get(head(x.text));
      const url = urlOf(it);
      warn(`${it['원고']}: 링크 답글이 빠져 있어요 — 먼저 붙여요`);
      if (!url) { log('블로그 주소를 아직 못 찾았어요 — 다음 실행에'); return 0; }
      if (!doPost) { log(`시험이라 붙이지 않아요 (${url})`); return 0; }
      try { const q = await api.postText(url, { replyToId: x.id }); log(`✅ 답글 붙임 → ${q.permalink || q.id}`); record(it, x.permalink, q.permalink); return 0; }
      catch (e) { log(`❌ 답글을 붙이지 못했어요: ${e.message}`); return 2; }
    }
  }

  const done = new Set(ours.map((x) => head(x.text)));
  const todo = due.filter((it) => !done.has(head(it.body)));
  if (!todo.length) { log('올릴 글이 없어요'); return 0; }
  if (todayOurs.length >= maxPerDay) { log(`오늘 ${maxPerDay}편을 다 올렸어요`); return 0; }
  const last = ours.map((x) => Date.parse(x.timestamp)).sort((a, b) => b - a)[0];
  if (last && Date.now() - last < gapMin * 60000) { log(`마지막 글이 ${Math.round((Date.now() - last) / 60000)}분 전이라 이번엔 쉬어요`); return 0; }

  // 시각 순으로 — 주소가 열리는(발행된) 첫 글
  let next = null, url = '';
  for (const it of todo) {
    url = urlOf(it);
    if (url) { next = it; break; }
    log(`${it['원고']}: 블로그 공개 글 목록에 아직 없어요 (발행 전·예약 실패?) — 건너뜀`);
  }
  if (!next) return 0;
  step(`다음: ${next['원고']} (${next['시각']})`);
  console.log([...next.body.split('\n').map((l) => `   │ ${l}`), `   └ 답글: ${url}`].join('\n'));
  if (!doPost) { log('시험이라 여기서 멈춰요 (--post 를 붙이면 올라가요)'); return 0; }

  const again = await api.myPosts({ limit: 25, since: kstDayStartUnix() - 86400 });
  if (again.some((x) => head(x.text) === head(next.body))) { log('방금 다른 PC 가 올렸어요 — 올리지 않아요'); return 0; }
  let p1;
  try { p1 = await api.postText(next.body); log(`✅ 본문 올림 (${p1.id})`); }
  catch (e) { log(`❌ 본문을 올리지 못했어요: ${e.message}`); return 2; }
  try {
    const p2 = await api.postText(url, { replyToId: p1.id });
    const full = await api.getPost(p1.id).catch(() => ({}));
    log(`✅ 링크 답글 올림 → ${full.permalink || p1.id}`);
    record(next, full.permalink, p2.permalink);
    return 0;
  } catch (e) { log(`❌ 링크 답글을 올리지 못했어요: ${e.message} — 다음 실행이 먼저 붙여요`); return 2; }
}

if (isMain(import.meta.url)) process.exitCode = await main().catch((e) => { console.error(`❌ ${e.message}`); return 2; });
