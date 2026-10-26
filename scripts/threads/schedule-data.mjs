#!/usr/bin/env node
/**
 * 스레드 보험글 일정표 자료 만들기 (2026-10-26 사용자 — "발행한 스레드가 어떤 게 올라갔는지 알려주거나 아티팩트로 일정표").
 *
 *   node scripts/threads/schedule-data.mjs --approved <goms-approved.tsv> --registered <등록한 번호 목록 파일> \
 *        [--posted <posted.tsv>] [--fixes <goms-fixes.tsv>] --out <data.json>
 *
 * 아침 확인 Routine 이 Drive 에서 받은 파일로 돌려, 일정표 아티팩트의 data.json 을 바꿔 올린다 (routines/morning-check.md 5-2).
 * - 편 번호·글감·첫 줄: content/threads/insurance/sets/*.md (Word 번호와 같은 순서)
 * - 게시됨: posted.tsv (insurance-post.mjs --posted 가 남김: 시각 · 편 · 심의필 · 첫 줄 · 1/2 주소 · 2/2 주소)
 * - 승인·반려: goms-approved.tsv (편마다 마지막 줄이 지금 상태), 반려 기록이 없으면 goms-fixes.tsv 의 번호도 반려로 본다
 * - 등록함: --registered 파일 (Drive goms-done 의 「스레드 N편.done」 번호를 한 줄에 하나, 또는 "1-30" 같은 구간)
 * - 앞으로의 게시: 아직 안 올린 승인 편을 번호 순서로 10·13·16·19·22시에 하루 5편씩 (insurance-post.mjs 와 같은 규칙). --start YYYY-MM-DD 면 그날부터
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = path.resolve(HERE, '../../content/threads/insurance/sets');
const SLOTS = ['10:00', '13:00', '16:00', '19:00', '22:00'];
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : ''; };
const read = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/^﻿/, '') : '');
const rows = (f) => read(f).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split('\t').map((x) => x.trim()));

// 1) 모든 편 — 묶음 파일 이름순으로 번호를 이어 매긴다
const posts = [];
for (const f of fs.readdirSync(SETS).filter((x) => x.endsWith('.md')).sort()) {
  const t = fs.readFileSync(path.join(SETS, f), 'utf8').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const parts = t.split(/^##\s+(\d+)\s*$/m);
  const inSet = [];
  for (let i = 1; i < parts.length; i += 2) {
    const lines = parts[i + 1].replace(/^\n+/, '').split('\n');
    const meta = {};
    let j = 0;
    for (; j < lines.length; j++) { const m = lines[j].match(/^(역할|보험|글감|출처|원문확인):\s*(.*)$/); if (!m) break; meta[m[1]] = m[2].trim(); }
    inSet.push({ no: Number(parts[i]), set: f.replace(/\.md$/, ''), kind: meta['보험'] || '', topic: meta['글감'] || '', first: (lines.slice(j).find((l) => l.trim()) || '').trim() });
  }
  inSet.sort((a, b) => a.no - b.no).forEach((p) => posts.push({ ...p, n: posts.length + 1 }));
}

// 2) 상태
const approved = new Map();
for (const c of rows(arg('--approved'))) if (/^\d+$/.test(c[0])) approved.set(Number(c[0]), { result: c[4] || '', no: c[1] || '', start: c[2] || '', end: c[3] || '' });
for (const c of rows(arg('--fixes'))) if (/^\d+$/.test(c[0]) && !approved.has(Number(c[0]))) approved.set(Number(c[0]), { result: '반려' });
const registered = new Set();
for (const l of read(arg('--registered')).split(/[\s,]+/)) {
  const m = l.match(/^(\d+)(?:-(\d+))?$/);
  if (m) for (let k = Number(m[1]); k <= Number(m[2] || m[1]); k++) registered.add(k);
}
for (const n of approved.keys()) registered.add(n);
const posted = new Map();
for (const c of rows(arg('--posted'))) if (/^\d+$/.test(c[1] || '')) posted.set(Number(c[1]), { at: c[0], no: c[2], url1: c[4] || '', url2: c[5] || '' });

// 3) 앞으로의 게시 — 지금(한국시간) 다음 시각부터, 오늘 이미 올린 수만큼 빼고
const kst = new Date(Date.now() + 9 * 3600e3);
const today = kst.toISOString().slice(0, 10);
const nowHm = kst.toISOString().slice(11, 16);
const postedToday = [...posted.values()].filter((p) => p.at.startsWith(today)).length;
const queue = posts.filter((p) => approved.get(p.n)?.result === '적격' && !posted.has(p.n)).map((p) => p.n);
const plan = new Map();
// --start 날짜: 그날부터 짠다 (자동 올리기를 아직 안 켠 날 — 2026-10-26 첫 일정표)
const start = arg('--start') > today ? arg('--start') : today;
let day = new Date(`${start}T00:00:00Z`), used = postedToday, qi = 0;
for (let guard = 0; qi < queue.length && guard < 400; guard++) {
  const d = day.toISOString().slice(0, 10);
  for (const s of SLOTS) {
    if (qi >= queue.length) break;
    if (d === today && (s <= nowHm || used >= 5)) continue;
    plan.set(queue[qi++], `${d} ${s}`);
    if (d === today) used++;
  }
  day = new Date(day.getTime() + 86400e3);
}

const items = posts.map((p) => {
  const a = approved.get(p.n);
  let status, when = '';
  if (posted.has(p.n)) { status = '게시됨'; when = posted.get(p.n).at; }
  else if (a?.result === '적격') { status = '게시 예정'; when = plan.get(p.n) || ''; }
  else if (a?.result === '반려') status = '반려·재심사';
  else if (registered.has(p.n)) status = '심의 중';
  else status = '등록 전';
  return { n: p.n, set: p.set, kind: p.kind, topic: p.topic, first: p.first, status, when,
    no: posted.get(p.n)?.no || a?.no || '', url1: posted.get(p.n)?.url1 || '', url2: posted.get(p.n)?.url2 || '' };
});
const count = (s) => items.filter((i) => i.status === s).length;
const data = {
  updated: `${today} ${nowHm}`,
  slots: SLOTS,
  summary: { total: items.length, posted: count('게시됨'), queued: count('게시 예정'), rejected: count('반려·재심사'), reviewing: count('심의 중'), unregistered: count('등록 전') },
  items,
};
fs.writeFileSync(arg('--out') || 'data.json', JSON.stringify(data, null, 1));
console.log(`일정표 자료: 전체 ${data.summary.total} · 게시됨 ${data.summary.posted} · 게시 예정 ${data.summary.queued} · 반려 ${data.summary.rejected} · 심의 중 ${data.summary.reviewing} · 등록 전 ${data.summary.unregistered}`);
