#!/usr/bin/env node
/**
 * 글감 후보가 지난 글과 겹치는지 미리 본다 (배정·밤 원고 작업이 글감을 고르기 전에).
 *
 *   node scripts/check-topics.mjs "노인맞춤돌봄서비스" "최저시급 월급 계산" "전기장판 세탁"
 *   node scripts/check-topics.mjs --days 60 <후보>...
 *
 * 2026-11-02 — 11/4·11/5 원고 배정에서 메인 키워드 이름만 보고 골라 지난 글과 네 번 겹쳤다
 * (노인맞춤돌봄서비스 10/28 · 최저시급 월급 계산 10/21 티스토리 '최저임금 월급 계산' · 전기장판 세탁 10/7 · 김장김치 보관).
 * 그래서 메인 키워드뿐 아니라 제목까지, 띄어쓰기를 빼고 '핵심 낱말이 들어 있는지'로 본다.
 * 보는 곳: content/archive/published.tsv(네이버·티스토리), content/posts·content/tistory 의 앞으로 나갈 원고, 캘린더 글감.
 * 겹침이 있으면 종료 코드 1 — 사람이 보고 질문을 바꿀지 정한다(같은 묶음의 다른 질문이면 써도 된다).
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
let days = 45;
const di = argv.indexOf('--days');
if (di >= 0) { days = Number(argv[di + 1]) || days; argv.splice(di, 2); }
if (!argv.length) { console.log('사용법: node scripts/check-topics.mjs [--days 45] "<후보 메인 키워드>" ...'); process.exit(1); }

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
// 흔한 꼬리말을 떼고 핵심만 (보관법·만드는법·비용·방법·증상 등은 다른 글과 겹쳐도 의미가 없다)
const TAIL = /(보관법|보관|만들기|만드는법|하는법|방법|비용|가격|증상|원인|구분|차이|계산|세탁|청소|제거|조건|신청|지원|버리는법)$/;
const core = (k) => { let c = norm(k); for (let i = 0; i < 2; i++) c = c.replace(TAIL, ''); return c.length >= 2 ? c : norm(k); };

const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const rows = [];
try {
  for (const r of fs.readFileSync('content/archive/published.tsv', 'utf8').split(/\r?\n/).slice(1)) {
    const c = r.split('\t');
    if (c[0] && c[0] >= since) rows.push({ where: `${c[0]} ${c[1]} (발행)`, main: c[3] || '', title: c[4] || '' });
  }
} catch { /* 없으면 넘어감 */ }
for (const [dir, ch] of [['content/posts', 'naver'], ['content/tistory', 'tistory']]) {
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.md')) : []) {
    const t = fs.readFileSync(`${dir}/${f}`, 'utf8');
    rows.push({ where: `${f.slice(0, 10)} ${ch} (원고)`, main: (/^main_keyword:\s*(.+)$/m.exec(t) || [])[1] || '', title: (/^title:\s*(.+)$/m.exec(t) || [])[1] || '' });
  }
}
try {
  const cal = fs.readFileSync('content/calendar/publish-calendar.html', 'utf8');
  for (const m of cal.matchAll(/\["(?:home|info)","([^"]+)","([^"]*)"/g))
    if (!/당겨 씀|미리 씀/.test(m[2])) rows.push({ where: '캘린더 (앞날 글감)', main: m[1].split(',')[0], title: m[1] });
} catch { /* 없으면 넘어감 */ }

// 같은 뜻으로 쓰는 말 — 하나가 있으면 다른 하나도 있는 것으로 본다
const SYN = [['최저시급', '최저임금'], ['실비', '실손'], ['전기요', '전기장판', '전기담요'], ['대방어', '방어'], ['곶감', '반건시'], ['깐밤', '생밤', '밤'], ['요양병원', '요양원']];
const TAILW = /^(보관법|보관|만들기|만드는법|하는법|방법|비용|가격|증상|원인|구분|차이|계산|세탁|청소|제거|조건|신청|지원|버리는법|법|시기|언제)$/;
const variants = (t) => { const g = SYN.find((x) => x.includes(t)); return g || [t]; };
const tokenHit = (cand, text) => {
  const toks = String(cand).split(/\s+/).map(norm).filter((t) => t.length >= 2 && !TAILW.test(t));
  if (toks.length < 2) return false;
  const T = norm(text);
  return toks.every((t) => variants(t).some((v) => T.includes(v)));
};
let hit = 0;
for (const cand of argv) {
  const c = core(cand);
  const syn = variants(c);
  const found = rows.filter((r) => syn.some((v) => norm(r.main).includes(v) || norm(r.title).includes(v)) || (norm(r.main).length >= 3 && c.includes(core(r.main))) || tokenHit(cand, r.main + ' ' + r.title));
  if (found.length) {
    hit++;
    console.log(`⚠ "${cand}" (핵심: ${c}) — 겹칠 수 있는 글 ${found.length}편`);
    for (const r of found.slice(0, 6)) console.log(`   ${r.where} · ${r.main} · ${r.title}`);
  } else console.log(`✅ "${cand}" — ${days}일 안·앞으로 나갈 원고·캘린더에 겹치는 글 없음`);
}
process.exit(hit ? 1 : 0);
