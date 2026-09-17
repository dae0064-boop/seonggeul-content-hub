#!/usr/bin/env node
/**
 * 스레드 글 생성 + 발행
 *
 *   node scripts/threads/publish.mjs --dry-run      # 만들어 보여주기만 (기본 권장)
 *   node scripts/threads/publish.mjs                # 실제 발행
 *   node scripts/threads/publish.mjs --from 초안.txt # 직접 쓴 글 발행
 *
 * 발행 전에 세 가지를 확인한다.
 *   1. 멈춤 스위치가 켜져 있지 않은가 (PAUSE 파일 / THREADS_PAUSED)
 *   2. 오늘 한국시간 기준으로 상한을 넘지 않았는가 (스레드 API 로 되읽어 확인)
 *   3. 안전장치(guard)를 통과하는가
 * 하나라도 걸리면 올리지 않는다.
 */
import fs from 'node:fs';
import {
  cfg, loadEnv, requireEnv, pausedReason, kstDayStartUnix, kstStamp,
  isMain, log, step, warn,
} from './config.mjs';
import { threadsApi } from './api.mjs';
import { composePost } from './compose.mjs';
import { guard } from './guard.mjs';
import { report } from './notify.mjs';

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--help') out.help = true;
    else if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
  }
  return out;
}

const USAGE = `
스레드 글 발행

  node scripts/threads/publish.mjs [--dry-run] [--from <파일>]

  --dry-run    올리지 않고 만들어진 글만 보여준다
  --from <파일> 직접 쓴 글을 올린다 (생성 단계를 건너뛴다)

환경변수
  THREADS_ACCESS_TOKEN      필수. 스레드 장기 액세스 토큰
  ANTHROPIC_API_KEY         --from 없이 쓸 때 필수
  THREADS_MAX_POSTS_PER_DAY 하루 상한 (기본 ${cfg.maxPostsPerDay})
  THREADS_PAUSED=1          전부 멈춤
`;

export async function run({ dryRun = false, from } = {}) {
  const stop = pausedReason();
  if (stop) {
    log(`멈춤 상태입니다 — ${stop}. 아무것도 하지 않습니다.`);
    return { skipped: 'paused' };
  }

  requireEnv(['THREADS_ACCESS_TOKEN']);
  const api = threadsApi(process.env.THREADS_ACCESS_TOKEN);

  step(`스레드 발행 — ${kstStamp()}`);
  const me = await api.me();
  log(`계정: @${me.username} (${me.id})`);

  // 하루 상한 — 상태 파일 대신 스레드 API 를 되읽어 센다
  const since = kstDayStartUnix();
  const todayCount = await api.countPostsSince(since);
  log(`오늘 발행: ${todayCount}/${cfg.maxPostsPerDay}`);
  if (todayCount >= cfg.maxPostsPerDay) {
    log('상한에 닿았습니다. 오늘은 여기까지.');
    return { skipped: 'daily-limit', todayCount };
  }

  const recent = await api.myPosts({ limit: cfg.scanPosts });
  const recentTexts = recent.map((p) => p.text).filter(Boolean);

  // 본문 확보
  let post;
  if (from) {
    const text = fs.readFileSync(from, 'utf8').trim();
    post = { topic: `(직접 작성) ${from}`, text, check: '사람이 쓴 글', notes: [] };
  } else {
    requireEnv(['ANTHROPIC_API_KEY']);
    step('초안 생성');
    post = await composePost({ recentTexts });
  }

  // 마지막 문 — --from 으로 들어온 글도 똑같이 검사한다
  const verdict = guard(post.text, { kind: 'post', recentTexts });
  for (const n of [...post.notes, ...verdict.notes]) warn(n);
  if (!verdict.ok) {
    const lines = verdict.errors.map((e) => `- ${e}`).join('\n');
    warn(`안전장치에 걸려 발행하지 않습니다:\n${lines}`);
    await report({
      title: `[스레드] 안전장치에 걸린 초안 (${kstStamp()})`,
      body: `발행하지 않았습니다.\n\n**걸린 항목**\n${lines}\n\n**초안**\n\n> ${post.text.replace(/\n/g, '\n> ')}`,
      labels: ['threads-hold'],
    });
    return { skipped: 'guard', errors: verdict.errors };
  }

  step('본문');
  console.log('-'.repeat(48));
  console.log(post.text);
  console.log('-'.repeat(48));
  log(`${post.text.length}자 · 글감: ${post.topic}`);

  if (dryRun) {
    log('--dry-run 이라 올리지 않았습니다.');
    return { dryRun: true, post };
  }

  step('발행');
  const published = await api.postText(post.text);
  log(`올렸습니다: ${published.id}`);
  return { published, post };
}

// ---------------------------------------------------------------- CLI
if (isMain(import.meta.url)) {
  loadEnv();
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); process.exit(0); }

  try {
    await run(args);
  } catch (e) {
    console.error(`\n[실패] ${e.message}`);
    try {
      await report({
        title: `[스레드] 발행 실패 (${kstStamp()})`,
        body: `\`\`\`\n${e.message}\n\`\`\`\n\n${e.lastDraft ? `마지막 초안:\n\n> ${String(e.lastDraft.text).replace(/\n/g, '\n> ')}` : ''}`,
        labels: ['threads-hold'],
      });
    } catch (e2) {
      console.error(`알림도 실패했습니다: ${e2.message}`);
    }
    process.exit(1);
  }
}
