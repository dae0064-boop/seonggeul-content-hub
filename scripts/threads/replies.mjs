#!/usr/bin/env node
/**
 * 내 스레드 글에 달린 댓글을 읽고 답한다.
 *
 *   node scripts/threads/replies.mjs --dry-run   # 무엇을 답할지 보여주기만
 *   node scripts/threads/replies.mjs             # 실제로 답글을 단다
 *
 * "이미 답했는가"는 저장 파일이 아니라 스레드 API 로 판단한다.
 * 내 계정이 그 댓글에 단 답글이 대화 안에 있으면 답한 것으로 본다.
 * 러너가 매번 새로 떠도, 로그가 날아가도 같은 댓글에 두 번 답하지 않는다.
 *
 * 규칙에 걸리는 댓글은 답하지 않고 GitHub 이슈로 올려 사람에게 넘긴다.
 */
import fs from 'node:fs';
import {
  cfg, loadEnv, requireEnv, pausedReason, kstStamp, VOICE_FILE,
  isMain, log, step, warn, sleep,
} from './config.mjs';
import { threadsApi } from './api.mjs';
import { askJson } from './anthropic.mjs';
import { guard } from './guard.mjs';
import { report } from './notify.mjs';

/** 답글을 달 수 있는 댓글의 나이 상한. 오래된 댓글을 뒤늦게 파헤치지 않는다 */
const MAX_AGE_HOURS = Number(process.env.THREADS_REPLY_MAX_AGE_HOURS || 72);

// 모델에 넘기기 전에 먼저 걸러내는 것들 — 여기 걸리면 무조건 사람에게 넘긴다
const PREFILTER = [
  { why: '욕설·공격', re: /(씨발|시발|ㅅㅂ|병신|ㅂㅅ|좆|개새|미친놈|미친년|꺼져|닥쳐|죽어라)/ },
  { why: '정치·종교', re: /(대통령|국힘|민주당|좌파|우파|빨갱이|친일|목사|교회\s*나와|불교|개독)/ },
  { why: '의료 판단 요청', re: /(어디\s*아픈|무슨\s*병|진단|처방|약\s*먹어도|수술해야|암\s*인가요)/ },
  { why: '금융·법률 판단 요청', re: /(얼마\s*벌|수익률|투자해도|이거\s*사도|고소|소송|합의금|변호사)/ },
  { why: '광고·협찬·영업', re: /(협찬|광고\s*문의|공구|체험단|팔로우\s*맞|맞팔|DM\s*주|디엠\s*주|링크\s*있어)/i },
  { why: '개인정보 노출', re: /(01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+)/ },
  { why: '사실관계 항의·정정 요구', re: /(틀렸|거짓|잘못\s*알|사실이\s*아니|허위|신고하)/ },
  { why: '링크 포함', re: /https?:\/\//i },
];

const SYSTEM = `당신은 한국어 생활정보 SNS 계정 "성글벙글"의 댓글 담당이다.
아래 말투 규칙을 그대로 지킨다.

판단 기준:
- 답해도 되는 댓글: 인사, 공감, 감사, 글 내용에 대한 가벼운 질문, 자기 경험 공유.
- 답하지 않고 사람에게 넘길 댓글(hold): 의료·금융·법률 판단을 요구하는 것,
  확인되지 않은 사실을 단정해야 답할 수 있는 것, 불만·항의, 광고·영업,
  정치·종교·재난, 개인정보가 담긴 것, 공격적인 것, 내가 모르는 것을 묻는 것.
- 조금이라도 애매하면 hold 한다. 답을 안 해서 생기는 손해보다 잘못 답해서 생기는 손해가 크다.

답글 규칙:
- 두세 문장, 200자 안쪽. 친근한 ~해요 체.
- 지어낸 수치나 확인 못 한 사실을 쓰지 않는다. 모르면 모른다고 말한다.
- 진단·처방·수익 단정, 영업 문구, 과장 표현을 쓰지 않는다.
- 상대의 말을 받아 한 번 공감하고, 글에서 실제로 다룬 범위 안에서만 답한다.

반드시 JSON 객체 하나만 출력한다.
{"action": "reply" 또는 "hold", "category": "분류 한 단어", "reason": "그렇게 판단한 이유 한 줄", "text": "action 이 reply 일 때만 답글 본문, 아니면 빈 문자열"}`;

function readVoice() {
  return fs.existsSync(VOICE_FILE) ? fs.readFileSync(VOICE_FILE, 'utf8') : '';
}

const ageHours = (ts) => (Date.now() - Date.parse(ts)) / 3600000;

/**
 * 답을 기다리는 댓글을 모은다.
 * 내가 이미 답글을 단 댓글, 내가 쓴 글, 숨긴 댓글, 오래된 댓글은 뺀다.
 */
export async function pendingReplies(api, me) {
  const posts = await api.myPosts({ limit: cfg.scanPosts });
  const pending = [];

  for (const post of posts) {
    let convo;
    try {
      convo = await api.conversation(post.id);
    } catch (e) {
      warn(`대화를 읽지 못했습니다 (${post.id}): ${e.message}`);
      continue;
    }

    // 내가 단 답글이 가리키는 대상 = 이미 답한 댓글
    const answered = new Set(
      convo
        .filter((c) => c.username === me.username && c.replied_to?.id)
        .map((c) => c.replied_to.id),
    );

    for (const c of convo) {
      if (!c.text || !c.text.trim()) continue;
      if (c.username === me.username) continue;
      if (answered.has(c.id)) continue;
      if (String(c.hide_status || '').toUpperCase().includes('HIDDEN')) continue;
      if (c.timestamp && ageHours(c.timestamp) > MAX_AGE_HOURS) continue;
      pending.push({ ...c, post });
    }
  }

  // 오래된 댓글부터 답한다
  return pending.sort((a, b) => Date.parse(a.timestamp || 0) - Date.parse(b.timestamp || 0));
}

/** 댓글 하나를 어떻게 처리할지 정한다 */
export async function decide(comment, voice) {
  for (const { why, re } of PREFILTER) {
    if (re.test(comment.text)) {
      return { action: 'hold', category: why, reason: '사전 필터에 걸렸습니다.', text: '' };
    }
  }

  const user = [
    `# 말투 규칙\n${voice}`,
    `# 내가 올린 글\n${comment.post.text || '(본문 없음)'}`,
    `# 달린 댓글\n@${comment.username}: ${comment.text}`,
  ].join('\n\n');

  const out = await askJson({ system: SYSTEM, user, maxTokens: 700 });
  const action = out.action === 'reply' ? 'reply' : 'hold';
  return {
    action,
    category: String(out.category || '미분류'),
    reason: String(out.reason || ''),
    text: String(out.text || '').trim(),
  };
}

export async function run({ dryRun = false } = {}) {
  const stop = pausedReason();
  if (stop) {
    log(`멈춤 상태입니다 — ${stop}. 아무것도 하지 않습니다.`);
    return { skipped: 'paused' };
  }

  requireEnv(['THREADS_ACCESS_TOKEN', 'ANTHROPIC_API_KEY']);
  const api = threadsApi(process.env.THREADS_ACCESS_TOKEN);
  const voice = readVoice();

  step(`댓글 확인 — ${kstStamp()}`);
  const me = await api.me();
  log(`계정: @${me.username}`);

  const pending = await pendingReplies(api, me);
  log(`답을 기다리는 댓글: ${pending.length}개 (최근 ${MAX_AGE_HOURS}시간)`);
  if (!pending.length) return { replied: 0, held: 0 };

  let replied = 0;
  const held = [];

  for (const c of pending.slice(0, cfg.maxRepliesPerRun)) {
    const head = `@${c.username}: ${c.text.replace(/\s+/g, ' ').slice(0, 60)}`;
    let decision;
    try {
      decision = await decide(c, voice);
    } catch (e) {
      warn(`판단 실패 — 보류합니다 (${c.id}): ${e.message}`);
      decision = { action: 'hold', category: '판단 실패', reason: e.message, text: '' };
    }

    if (decision.action === 'reply') {
      const verdict = guard(decision.text, { kind: 'reply' });
      if (!verdict.ok) {
        decision = {
          action: 'hold',
          category: '안전장치',
          reason: verdict.errors.join(' / '),
          text: decision.text,
        };
      }
    }

    if (decision.action !== 'reply') {
      warn(`보류 [${decision.category}] ${head}`);
      held.push({ comment: c, decision });
      continue;
    }

    step(`답글 → ${head}`);
    console.log(`    ${decision.text}`);
    if (dryRun) { log('--dry-run 이라 달지 않았습니다.'); continue; }

    try {
      const res = await api.postText(decision.text, { replyToId: c.id });
      log(`달았습니다: ${res.id}`);
      replied++;
      await sleep(2000); // 연달아 던지지 않는다
    } catch (e) {
      warn(`답글 실패 (${c.id}): ${e.message}`);
      held.push({ comment: c, decision: { ...decision, category: '발행 실패', reason: e.message } });
    }
  }

  // 보류한 것은 사람에게 넘긴다. 같은 댓글로는 이슈가 한 번만 열린다
  for (const { comment, decision } of held) {
    await report({
      key: `reply:${comment.id}`,
      title: `[스레드] 사람이 답해야 할 댓글 — ${decision.category}`,
      body: [
        `**댓글** @${comment.username} (${comment.timestamp || '시각 미상'})`,
        `> ${comment.text.replace(/\n/g, '\n> ')}`,
        '',
        `**원글**`,
        `> ${String(comment.post.text || '').replace(/\n/g, '\n> ').slice(0, 500)}`,
        comment.post.permalink ? `\n${comment.post.permalink}` : '',
        '',
        `**보류 사유** ${decision.category} — ${decision.reason}`,
        decision.text ? `\n**만들었던 답글 초안**\n> ${decision.text.replace(/\n/g, '\n> ')}` : '',
        '',
        '답을 달았거나 넘기기로 했으면 이 이슈를 닫으세요. 닫아도 자동 답글은 다시 시도하지 않습니다.',
      ].join('\n'),
      labels: ['threads-hold'],
    });
  }

  step('정리');
  log(`답글 ${replied}개 · 보류 ${held.length}개`);
  return { replied, held: held.length };
}

// ---------------------------------------------------------------- CLI
if (isMain(import.meta.url)) {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  try {
    await run({ dryRun });
  } catch (e) {
    console.error(`\n[실패] ${e.message}`);
    try {
      await report({
        title: `[스레드] 댓글 처리 실패 (${kstStamp()})`,
        body: `\`\`\`\n${e.message}\n\`\`\``,
        labels: ['threads-hold'],
      });
    } catch (e2) {
      console.error(`알림도 실패했습니다: ${e2.message}`);
    }
    process.exit(1);
  }
}
