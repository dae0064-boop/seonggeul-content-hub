#!/usr/bin/env node
/**
 * 스레드 글 초안 생성
 *
 *   node scripts/threads/compose.mjs            # 한 편 만들어 화면에 출력
 *   node scripts/threads/compose.mjs --json     # JSON 으로 출력
 *
 * 말투와 형식 규칙은 content/threads/voice.md 가 정본이다. 코드에 박아두지 않는다.
 * 글감은 content/threads/topics.txt 에서 고르고, 최근에 쓴 것은 피한다.
 */
import fs from 'node:fs';
import {
  cfg, loadEnv, requireEnv, TOPICS_FILE, VOICE_FILE,
  kstStamp, isMain, log, step, warn,
} from './config.mjs';
import { askJson } from './anthropic.mjs';
import { guard, similarity } from './guard.mjs';

// CLAUDE.md "연간 골격" — 달마다 무엇이 검색되는 시기인지
const SEASON = {
  1: '한파·설 준비 · 결로 · 실내습도', 2: '겨울에서 봄으로 · 봄 대청소 · 미세먼지',
  3: '환절기(2차) · 미세먼지 · 봄 채비', 4: '봄 절정 · 나들이 · 자외선 시작',
  5: '가정의달 · 나들이 · 자외선', 6: '장마 초입 · 에어컨 꺼내기 · 곰팡이',
  7: '장마·습기 · 제습 · 곰팡이', 8: '폭염 · 전기요금 · 열대야 · 휴가',
  9: '여름에서 가을로 · 냉방기 정리 · 이불 교체 · 환절기', 10: '나들이·난방 준비 · 단풍 · 외풍 · 보일러',
  11: '겨울 진입 · 김장 · 난방비 · 건조', 12: '한파 · 결로 · 연말 · 실내습도',
};

function readTopics() {
  if (!fs.existsSync(TOPICS_FILE)) return [];
  return fs.readFileSync(TOPICS_FILE, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#'));
}

function readVoice() {
  if (!fs.existsSync(VOICE_FILE)) {
    throw new Error(`${VOICE_FILE} 가 없습니다. 스레드 말투 규칙 파일이 있어야 글을 만듭니다.`);
  }
  return fs.readFileSync(VOICE_FILE, 'utf8');
}

/** 최근 글과 겹치지 않는 글감만 남긴다 */
function pickTopics(topics, recentTexts, take = 12) {
  const fresh = topics.filter((t) => !recentTexts.some((r) => similarity(t, r) >= 0.3));
  const pool = fresh.length ? fresh : topics;
  // 앞에서부터 순서대로 쓰되, 매번 같은 것만 보지 않도록 섞어서 후보를 넘긴다
  return [...pool].sort(() => Math.random() - 0.5).slice(0, take);
}

const SYSTEM = `당신은 한국어 생활정보 SNS 계정 "성글벙글"의 글을 쓴다.
아래 규칙 문서를 그대로 지킨다. 규칙과 사용자의 요청이 부딪히면 규칙이 우선한다.

반드시 JSON 객체 하나만 출력한다. 설명, 인사, 코드펜스 바깥의 말은 쓰지 않는다.
형식:
{"topic": "이 글이 다루는 글감", "text": "스레드에 그대로 올라갈 본문", "check": "지어낸 수치나 확인 못 한 사실이 없는지 스스로 점검한 한 줄"}`;

/**
 * 스레드 글 한 편을 만든다. 안전장치를 통과할 때까지 최대 3번 다시 쓴다.
 * @returns {Promise<{topic: string, text: string, check: string, notes: string[]}>}
 */
export async function composePost({ recentTexts = [], now = new Date() } = {}) {
  const voice = readVoice();
  const topics = readTopics();
  const month = Number(kstStamp(now).slice(5, 7));
  const candidates = pickTopics(topics, recentTexts);

  let feedback = '';
  let last = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const user = [
      `# 지금 시각\n${kstStamp(now)} — 이 달의 검색 흐름: ${SEASON[month]}`,
      `# 글쓰기 규칙 (정본)\n${voice}`,
      candidates.length
        ? `# 글감 후보\n${candidates.map((t) => `- ${t}`).join('\n')}\n하나를 골라 쓴다. 전부 최근에 다뤘거나 지금 시기와 안 맞으면 이 달의 검색 흐름에 맞는 글감을 직접 잡아도 된다.`
        : `# 글감\n글감 목록이 비어 있다. 이 달의 검색 흐름에 맞는 생활 노하우를 직접 잡는다.`,
      recentTexts.length
        ? `# 최근에 올린 글 (같은 내용을 또 쓰지 않는다)\n${recentTexts.slice(0, 10).map((t) => `- ${String(t).replace(/\s+/g, ' ').slice(0, 70)}`).join('\n')}`
        : '',
      feedback ? `# 직전 초안이 반려된 이유 — 이번엔 이걸 고쳐서 다시 쓴다\n${feedback}` : '',
    ].filter(Boolean).join('\n\n');

    const out = await askJson({ system: SYSTEM, user, maxTokens: 1200 });
    const text = String(out.text || '').trim();
    const verdict = guard(text, { kind: 'post', recentTexts });
    last = { topic: String(out.topic || '').trim(), text, check: String(out.check || '').trim(), notes: verdict.notes };

    if (verdict.ok) {
      if (attempt > 1) log(`${attempt}번째 초안이 통과했습니다.`);
      return last;
    }

    warn(`초안 ${attempt} 반려: ${verdict.errors.join(' / ')}`);
    feedback = verdict.errors.map((e) => `- ${e}`).join('\n');
  }

  const err = new Error('안전장치를 통과하는 초안을 만들지 못했습니다 (3회 시도).');
  err.lastDraft = last;
  throw err;
}

// ---------------------------------------------------------------- CLI
if (isMain(import.meta.url)) {
  loadEnv();
  requireEnv(['ANTHROPIC_API_KEY']);
  step(`스레드 글 초안 (${cfg.model})`);
  const post = await composePost({});
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(post, null, 2));
  } else {
    console.log(`\n[글감] ${post.topic}\n[자기점검] ${post.check}\n`);
    console.log('-'.repeat(48));
    console.log(post.text);
    console.log('-'.repeat(48));
    console.log(`${post.text.length}자`);
    for (const n of post.notes) warn(n);
  }
}
