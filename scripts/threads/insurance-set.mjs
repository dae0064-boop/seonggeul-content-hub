#!/usr/bin/env node
/**
 * 스레드 보험 심의글 묶음 검사 — 5편이 서로, 그리고 지난 묶음과 겹치지 않는지 본다.
 *
 *   node scripts/threads/insurance-set.mjs content/threads/insurance/sets/2026-10-02.md
 *
 * 규칙 정본은 content/threads/insurance/rules.md 다. 여기서 errors 가 나오면 올리지 않는다.
 * 글마다 스레드 안전장치(guard.mjs)도 그대로 거친다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, isMain } from './config.mjs';
import { guard, similarity } from './guard.mjs';

export const SETS_DIR = path.join(ROOT, 'content', 'threads', 'insurance', 'sets');
export const SET_SIZE = 5;
export const ROLES = ['오해풀기', '숨은권리', '증권한줄', '생활장면', '마음이야기'];
export const TYPES = [
  '실손', '자동차', '운전자', '진단비', '배상책임', '종신·정기',
  '연금·저축', '어린이', '치아', '간병·치매', '여행자', '공통',
];

// 지난 묶음의 글감과 이만큼 비슷하면 같은 글감으로 본다
const TOPIC_DUP = 0.5;

// 모바일 스레드에서 '더 보기'로 접히지 않는 틀 (rules.md "한 편의 모양", 사용자 원문 237자·14줄·최장 23자)
export const MAX_CHARS = 250;
export const MAX_LINES = 16;
export const MAX_LINE = 24;
// 딱딱하지 않게 — 문맥에 맞는 이모지 2~3개 (2026-10-02 사용자 지시)
export const MIN_EMOJI = 2;
export const MAX_EMOJI = 3;

// memory/CLAUDE.md [4] [6] 중 보험 글에만 붙는 것. 안전장치(guard)에 없는 것만 둔다
const INSURANCE_BANNED = [
  { re: /하루\s*[0-9,]+\s*원|커피\s*한\s*잔\s*값/, why: '일 단위 보험료 강조' },
  { re: /해지\s*하세요|해지하시는\s*게\s*좋|갈아타(세요|시는\s*게)/, why: '해지·갈아타기 권유' },
  { re: /가입\s*하세요|가입하시는\s*게\s*좋|들어\s*두세요|지금\s*가입/, why: '가입 권유' },
  { re: /(생명|화재|손해보험|손보)보다\s/, why: '근거 없는 타사 비교' },
  { re: /설계사가\s*잘못/, why: '다른 설계사 계약 깎아내리기' },
  { re: /[₩$]|💰|💵|💴|💶|💷|💸|🤑/u, why: '돈 그림·통화기호' },
  { re: /상담\s*받(으세요|아\s*보세요)|성글벙글에게\s*(물어|연락)/, why: '상담 유도 (스레드는 점검형까지만)' },
];

/** 묶음 파일 하나를 읽어 {meta, posts[]} 로 만든다 */
export function parseSet(src) {
  const text = String(src).replace(/\r\n/g, '\n');
  const meta = {};
  let rest = text;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m) meta[m[1].trim()] = m[2].trim();
    }
    rest = text.slice(fm[0].length);
  }

  const posts = [];
  const parts = rest.split(/^##\s+(\d+)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const lines = parts[i + 1].replace(/^\n+/, '').split('\n');
    const fields = {};
    let j = 0;
    for (; j < lines.length; j++) {
      const m = lines[j].match(/^(역할|보험|글감|출처|원문확인):\s*(.*)$/);
      if (!m) break;
      fields[m[1]] = m[2].trim();
    }
    posts.push({ no: Number(parts[i]), ...fields, body: lines.slice(j).join('\n').trim() });
  }
  return { meta, posts };
}

/**
 * @param {{meta: object, posts: object[]}} set 검사할 묶음
 * @param {{meta: object, posts: object[]}[]} previous 지난 묶음들
 * @returns {{ok: boolean, errors: string[], notes: string[]}}
 */
export function checkSet(set, previous = []) {
  const errors = [];
  const notes = [];
  const { posts } = set;

  if (posts.length !== SET_SIZE) errors.push(`글이 ${posts.length}편입니다. 한 묶음은 ${SET_SIZE}편입니다.`);

  // ---- 역할·보험 종류가 묶음 안에서 겹치지 않는가
  const seen = { 역할: new Map(), 보험: new Map() };
  for (const p of posts) {
    if (!ROLES.includes(p.역할)) errors.push(`${p.no}번: 역할 "${p.역할 || ''}" 이 없습니다. (${ROLES.join(' / ')})`);
    if (!TYPES.includes(p.보험)) errors.push(`${p.no}번: 보험 종류 "${p.보험 || ''}" 이 목록에 없습니다. (${TYPES.join(' / ')})`);
    if (!p.글감) errors.push(`${p.no}번: 글감이 비었습니다.`);
    for (const key of ['역할', '보험']) {
      if (!p[key]) continue;
      if (seen[key].has(p[key])) errors.push(`${p.no}번: ${key} "${p[key]}" 가 ${seen[key].get(p[key])}번과 겹칩니다.`);
      else seen[key].set(p[key], p.no);
    }
  }

  // ---- 지난 묶음과 겹치지 않는가
  const oldPosts = previous.flatMap((s) => s.posts.map((p) => ({ ...p, date: s.meta.date || '?' })));
  for (const p of posts) {
    for (const o of oldPosts) {
      if (p.글감 && o.글감 && (p.글감 === o.글감 || similarity(p.글감, o.글감) >= TOPIC_DUP)) {
        errors.push(`${p.no}번: 글감이 ${o.date} 묶음 "${o.글감}" 와 겹칩니다.`);
        break;
      }
    }
  }

  // ---- 글마다
  const earlier = oldPosts.map((o) => o.body);
  for (const p of posts) {
    const tag = `${p.no}번`;
    const v = guard(p.body, { kind: 'post', recentTexts: earlier });
    for (const e of v.errors) errors.push(`${tag}: ${e}`);
    for (const n of v.notes) notes.push(`${tag}: ${n}`);
    earlier.push(p.body);

    const lines = p.body.split('\n');
    if (p.body.length > MAX_CHARS) errors.push(`${tag}: ${p.body.length}자 — ${MAX_CHARS}자 이하로 줄입니다 (모바일에서 접힘).`);
    if (lines.length > MAX_LINES) errors.push(`${tag}: ${lines.length}줄 — ${MAX_LINES}줄 이하로 줄입니다.`);
    lines.forEach((l, k) => {
      if (l.length > MAX_LINE) errors.push(`${tag}: ${k + 1}번째 줄이 ${l.length}자 — ${MAX_LINE}자 이하로 끊습니다: "${l}"`);
    });
    if (lines.some((l) => !l.trim())) errors.push(`${tag}: 빈 줄이 있습니다. 줄바꿈만으로 이어 씁니다.`);
    // 제목 끝에 이모지 하나는 붙어도 된다: "…될까? 🤔"
    const title = lines[0].trim().replace(/[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/u, '');
    if (!/\?$/.test(title)) errors.push(`${tag}: 첫 줄(제목)은 물음표로 끝나는 질문으로 씁니다.`);
    const emoji = (p.body.match(/\p{Extended_Pictographic}/gu) || []).length;
    if (emoji < MIN_EMOJI || emoji > MAX_EMOJI) {
      errors.push(`${tag}: 이모지가 ${emoji}개 — ${MIN_EMOJI}~${MAX_EMOJI}개로 문맥에 맞게 넣습니다.`);
    }
    if (/#[^\s#]+/.test(p.body)) errors.push(`${tag}: 해시태그는 달지 않습니다.`);

    for (const { re, why } of INSURANCE_BANNED) {
      const m = p.body.match(re);
      if (m) errors.push(`${tag}: 심의 — ${why} ("${m[0]}")`);
    }

    // 숫자가 있으면 출처 링크가 있어야 한다
    if (/\d/.test(p.body.replace(/#[^\s#]+/g, '')) && !/https?:\/\//.test(p.출처 || '')) {
      errors.push(`${tag}: 숫자가 있는데 출처 링크가 없습니다. 출처 칸에 기관·자료명·링크를 적습니다.`);
    }
    if (!p.출처) errors.push(`${tag}: 출처 칸이 없습니다. 숫자가 없으면 "출처: 없음" 이라고 적습니다.`);
    if (/안\s*함/.test(p.원문확인 || '')) notes.push(`${tag}: 출처 원문을 아직 열어 보지 않았습니다. 올리기 전에 링크를 열어 확인합니다.`);
    if (/보장/.test(p.body)) notes.push(`${tag}: "보장" — 약속하는 말이 아니라 이름씨(보장 내용·범위)로 쓰였는지 확인.`);
  }

  if (!set.meta.심의필) notes.push('심의필 칸이 비었습니다. 소속 회사 광고심의가 필요한 글이면 받은 뒤 적어 둡니다.');

  return { ok: errors.length === 0, errors, notes };
}

/** 이 파일보다 앞 날짜의 묶음들 */
export function loadPrevious(file) {
  if (!fs.existsSync(SETS_DIR)) return [];
  const me = path.basename(file);
  return fs.readdirSync(SETS_DIR)
    .filter((f) => f.endsWith('.md') && f < me)
    .map((f) => parseSet(fs.readFileSync(path.join(SETS_DIR, f), 'utf8')));
}

// ---------------------------------------------------------------- CLI
if (isMain(import.meta.url)) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.log('쓰는 법: node scripts/threads/insurance-set.mjs content/threads/insurance/sets/<날짜>.md');
    process.exit(1);
  }
  let bad = 0;
  for (const file of files) {
    const set = parseSet(fs.readFileSync(file, 'utf8'));
    const r = checkSet(set, loadPrevious(file));
    console.log(`\n▶ ${file}`);
    for (const p of set.posts) console.log(`   ${p.no}. [${p.역할} · ${p.보험}] ${p.글감}  (${p.body.length}자)`);
    for (const n of r.notes) console.log('   [확인]', n);
    for (const e of r.errors) console.log('   [막힘]', e);
    console.log(r.ok ? '   통과' : `   ${r.errors.length}개 막힘 — 올리지 않습니다.`);
    if (!r.ok) bad++;
  }
  process.exit(bad ? 1 : 0);
}
