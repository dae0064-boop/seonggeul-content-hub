#!/usr/bin/env node
/**
 * 원고를 "원고 작업실" 아티팩트(content/board/manuscript-board.html)에 넣는다.
 *
 * 2026-10-05 사용자 지시: "항상 작업하면 원고 작업실로 이동해놔" — 작업실의
 * '네이버용 서식 복사' 버튼으로 바로 옮기기 때문이다.
 *
 *   node scripts/board-add.mjs <원고.md> [<원고.md> ...] [--board <작업실.html>] [--type 검색유입형] [--note 메모]
 *
 * --board 는 지금 떠 있는 작업실 HTML(Artifact read 로 받은 파일)이다. 작업실은 상태(완료 표시 등)를
 * 스스로 저장하므로, 저장소 사본이 아니라 살아 있는 판의 상태 위에 더해야 한다. 주지 않으면 저장소 사본을 쓴다.
 * 같은 제목·같은 원고 파일의 카드는 새 내용으로 바꾸고(상태는 유지), 없으면 뒤에 붙인다.
 * 결과는 content/board/manuscript-board.html 에 쓴다 — 그 파일을 같은 주소로 다시 게시한다
 * (주소: content/board 의 STATUS 기록, https://claude.ai/artifact/BtKcrqzhB4w4mw7JdzD7JT).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parsePost } from './lib/parse-post.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'content/board/manuscript-board.html');
const STATE_RE = /(<script id="state" type="application\/json">)([\s\S]*?)(<\/script>)/;

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const boardPath = opt('--board');
const type = opt('--type');
const note = opt('--note');
if (!args.length) { console.error('사용법: node scripts/board-add.mjs <원고.md> ... [--board 작업실.html]'); process.exit(1); }

const source = fs.readFileSync(OUT, 'utf8');
const live = boardPath ? fs.readFileSync(boardPath, 'utf8') : source;
const m = STATE_RE.exec(live);
if (!m) { console.error(`작업실 상태(<script id="state">)를 찾지 못했어요: ${boardPath || OUT}`); process.exit(1); }
const state = JSON.parse(m[2]);

for (const file of args) {
  const raw = fs.readFileSync(file, 'utf8');
  const post = parsePost(raw);
  const title = post.title;
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const plain = body.replace(/\[\/?(빨간글씨|파란글씨|노란배경)\]/g, '').replace(/^인용구\(소제목\)\s*/gm, '');
  const text = plain.split('\n').filter((l) => !/^\[이미지\s*\d+\]/.test(l.trim())).join('');
  const main = post.mainKeyword;
  const count = (kw) => (kw ? text.replace(/\s/g, '').split(kw.replace(/\s/g, '')).length - 1 : 0);
  const slug = path.basename(file, '.md');

  // 그림: 이미지 계획서가 있으면 그 프롬프트, 없으면(직접 찍은 사진 글) 자리 설명만
  const planFile = path.join(ROOT, 'content/image-plans', `${slug}.json`);
  const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')).images || [] : null;
  const spots = [...body.matchAll(/^\[이미지\s*(\d+)\]\s*(.*)$/gm)].map((x) => ({ n: +x[1], t: x[2].trim() }));
  const images = plan
    ? plan.map((im) => ({ t: im.title, n: `이미지 ${im.n} · ${im.file || ''}`.trim(), p: im.prompt }))
    : spots.map((s) => ({ t: s.t, n: `직접 찍은 사진 · [이미지 ${s.n}] 자리`, p: '직접 찍은 사진을 넣어 주세요' }));

  const tags = post.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  const card = {
    status: 'todo',
    date: `${slug.slice(5, 7)}/${slug.slice(8, 10)} 작성`,
    type: type || post.format,
    note: note || post.category,
    title,
    main,
    mainN: count(main),
    vol: '미확인',
    chars: text.length,
    subs: post.subKeywords,
    body,
    images,
    tags,
    file: path.relative(ROOT, path.resolve(file)),
  };
  const at = state.findIndex((c) => c.file === card.file || c.title === card.title);
  if (at >= 0) { card.status = state[at].status; state[at] = card; console.log(`바꿈: ${title}`); }
  else { state.push(card); console.log(`넣음: ${title}`); }
}

const json = JSON.stringify(state).replace(/<\//g, '<\\/');
fs.writeFileSync(OUT, source.replace(STATE_RE, (_, a, _b, c) => a + json + c));
console.log(`✅ ${path.relative(ROOT, OUT)} — 카드 ${state.length}개. 이 파일을 원고 작업실 주소로 다시 게시하세요.`);
