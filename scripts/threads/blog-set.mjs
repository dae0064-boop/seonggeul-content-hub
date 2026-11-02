#!/usr/bin/env node
/**
 * 스레드 블로그 유입 글 묶음 검사 (규칙 정본: content/threads/blog.md)
 *
 *   node scripts/threads/blog-set.mjs content/threads/blog/2026-11-03.md
 *
 * errors 가 하나라도 있으면 종료 코드 1 — 올리지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, isMain } from './config.mjs';
import { guard } from './guard.mjs';

const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const MIN_CHARS = 90;
const MAX_CHARS = 300;
const MAX_LINE = 24;
const PARA_MAX = 4;
const PARA_MIN = 2; // 2026-11-02 사용자 — "2~4줄 사이로 쓰고 한 칸 띄고"
const MAX_EMOJI = 2;

// '바로' 갈래에서 막는 민간 보험 낱말. 공적 제도 이름(건강보험 등)은 아래 PUBLIC 으로 먼저 지운다
const PUBLIC = /(국민\s*)?건강보험|장기요양\s*보험|고용\s*보험|산재\s*보험|국민\s*연금|의료\s*급여/g;
const PRIVATE = /보험|실손|실비|보험금|보험료|특약|진단비|보장|약관|증권|설계사|가입/;
// '심의' 갈래에도 붙는 금지 (insurance-set.mjs INSURANCE_BANNED 중 요점)
const INSURANCE_BANNED = [
  { re: /해지\s*하세요|해지해|갈아타/, why: '해지·갈아타기 권유' },
  { re: /가입\s*하세요|가입해\s*(둬|봐)|들어\s*둬|지금\s*가입/, why: '가입 권유' },
  { re: /(생명|화재|손해)보험\s*(회사|사)\s*이름|삼성|한화|현대해상|DB손해|KB손해|메리츠|교보|흥국|롯데손해|NH농협/, why: '보험사 이름' },
  { re: /[₩$]|💰|💵|💸|🤑/u, why: '돈 그림·통화기호' },
];
const FAKE_ASKED = /물어보는\s*사람|질문\s*받|많이\s*물어|자주\s*물어/;

export function parseSet(text) {
  text = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); // 윈도우 PC 는 줄바꿈이 \r\n (2026-11-02 첫 실행에서 칸을 못 읽음)
  const items = [];
  for (const chunk of text.split(/^## /m).slice(1)) {
    const [head, ...rest] = chunk.split(/\n\s*\n/);
    const meta = { no: head.split('\n')[0].trim() };
    for (const line of head.split('\n').slice(1)) {
      const m = line.match(/^([^:：]+)[:：]\s*(.*)$/);
      if (m) meta[m[1].trim()] = m[2].trim();
    }
    meta.body = rest.join('\n\n').trim();
    items.push(meta);
  }
  return items;
}

function readPost(slug) {
  const f = path.join(POSTS_DIR, slug.endsWith('.md') ? slug : `${slug}.md`);
  if (!fs.existsSync(f)) return null;
  const raw = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const fm = {};
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (m) for (const l of m[1].split('\n')) {
    const k = l.match(/^(\w+):\s*(.*)$/);
    if (k) fm[k[1]] = k[2].trim();
  }
  return { fm, text: raw };
}

export function checkSet(file) {
  const errors = [];
  const notes = [];
  const date = path.basename(file).slice(0, 10);
  const items = parseSet(fs.readFileSync(file, 'utf8'));
  if (!items.length) errors.push('글이 없습니다 (## 1 … 형식).');
  const seen = new Set();

  for (const it of items) {
    const tag = `[${it.no}]`;
    const err = (s) => errors.push(`${tag} ${s}`);
    const body = it.body;
    if (!['바로', '심의'].includes(it['갈래'])) err('갈래: 바로 / 심의 중 하나를 적어야 합니다.');
    if (!it['원고']) { err('원고: 칸이 없습니다.'); continue; }
    if (seen.has(it['원고'])) err(`같은 원고를 두 번 썼습니다: ${it['원고']}`);
    seen.add(it['원고']);

    const post = readPost(it['원고']);
    if (!post) { err(`원고를 찾지 못했습니다: content/posts/${it['원고']}.md`); continue; }
    // 2026-11-02 사용자 "생활정보글로만 5개씩" — 심의 없는 정보글: 생활보장(건강·제도)·생활정보(살림·제철). 이슈·연예 글은 빼요
    if (!['생활보장', '생활정보'].includes(post.fm.category)) err(`생활보장·생활정보 원고가 아닙니다 (category: ${post.fm.category}).`);
    if (post.fm.issue) err('이슈·연예 글은 고르지 않습니다.');

    // 시각 — 블로그 글이 발행된 뒤여야 링크가 열린다
    const at = it['시각'];
    if (!/^\d{2}:\d{2}$/.test(at || '')) err('시각: HH:MM 이 필요합니다.');
    else if (post.fm.publish_at) {
      const [pd, pt] = post.fm.publish_at.split(' ');
      if (pd > date || (pd === date && pt >= at)) err(`블로그 발행(${post.fm.publish_at})보다 앞이거나 같은 시각입니다 (${date} ${at}).`);
    }

    // 모양
    const flat = body.replace(/\s/g, '');
    if (body.length < MIN_CHARS || body.length > MAX_CHARS) err(`${body.length}자 — ${MIN_CHARS}~${MAX_CHARS}자로.`);
    for (const line of body.split('\n')) if (line.length > MAX_LINE) err(`한 줄 ${line.length}자 (최대 ${MAX_LINE}): "${line}"`);
    if (body.split(/\n\s*\n/).length < 2) err('문단 사이에 빈 줄이 없습니다 — 2~4줄마다 한 칸 띄웁니다.');
    for (const para of body.split(/\n\s*\n/)) {
      const n = para.split('\n').filter(Boolean).length;
      if (n > PARA_MAX) err(`문단이 ${n}줄입니다 (최대 ${PARA_MAX}).`);
      if (n && n < PARA_MIN) err(`한 줄짜리 문단이 있습니다 — 2~4줄로 묶어 주세요: "${para.trim()}"`);
    }
    const emoji = (body.match(/\p{Extended_Pictographic}/gu) || []).length;
    if (emoji > MAX_EMOJI) err(`이모지 ${emoji}개 (최대 ${MAX_EMOJI}).`);
    if (/https?:\/\/|blog\.naver/.test(body)) err('본문에 링크 — 링크는 답글에 답니다.');
    if (/#[^\s#]+/.test(body)) err('해시태그는 쓰지 않습니다.');
    if (/상담|연락\s*(줘|주세요)|DM/i.test(body)) err('상담·연락 유도 — 블로그 유입 글에는 쓰지 않습니다.');
    if (FAKE_ASKED.test(body)) err('질문을 받은 척하는 말 ("물어보는 사람" 등).');
    if (!/블로그/.test(body)) notes.push(`${tag} 블로그로 이어 주는 줄이 없습니다.`);

    // 숫자는 원고에 있는 것만
    const src = post.text.replace(/[\s,]/g, '');
    for (const n of new Set(body.replace(/,/g, '').match(/\d+(\.\d+)?/g) || [])) {
      if (!src.includes(n)) err(`숫자 "${n}" 이(가) 원고에 없습니다.`);
    }

    // 갈래별
    if (it['갈래'] === '바로') {
      const hit = body.replace(PUBLIC, '').match(PRIVATE);
      if (hit) err(`'바로' 글에 민간 보험 낱말 "${hit[0]}" — 빼거나 '심의' 갈래로.`);
    } else if (it['갈래'] === '심의') {
      for (const { re, why } of INSURANCE_BANNED) if (re.test(body)) err(`심의 금지: ${why}`);
      if (!/확인해\s*봐|확인해\s*보/.test(body)) err('심의 글은 "확인해 봐" 같은 스스로 확인으로 닫습니다.');
      if (!it['심의필']) notes.push(`${tag} 심의필 번호 없음 — GOMS 적격 전에는 올리지 않습니다.`);
    }

    const g = guard(body);
    for (const e of g.errors) err(`안전장치: ${e}`);
    for (const n of g.notes) notes.push(`${tag} ${n}`);
    if (flat.length === 0) err('본문이 비었습니다.');
  }
  return { errors, notes, items };
}

const file = process.argv[2];
if (file && isMain(import.meta.url)) {
  const { errors, notes, items } = checkSet(file);
  console.log(`스레드 블로그 유입 묶음: ${path.basename(file)} — ${items.length}편`);
  for (const n of notes) console.log(`  참고 ${n}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(errors.length ? `불통과 (${errors.length})` : '통과');
  process.exit(errors.length ? 1 : 0);
}
