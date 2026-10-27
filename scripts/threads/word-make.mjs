#!/usr/bin/env node
/**
 * 스레드 보험글 Word 만들기 — Python 없이 (2026-10-26: 사무실 PC 에 Python 이 없어 insurance-word.py 가 새 묶음 Word 를 못 만든다).
 *
 *   node scripts/threads/word-make.mjs --out <Drive 보험글> [--force] [--only 31,32]
 *
 * content/threads/insurance/sets/*.md 를 이름순으로 읽어 편 번호를 이어 매기고(insurance-word.py 와 같은 번호),
 * 없는 「스레드 N편.docx」만 만든다. 모양은 insurance-word.py 가 만든 틀(word-template.docx — 본문 줄마다 한 문단, 빈 줄, 배너 사진) 그대로.
 * 이미 있는 Word 는 건드리지 않는다 (GOMS 에 올린 파일일 수 있다). --force 면 다시 만든다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip, writeZip, content, wordText } from './word-fix.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = path.resolve(HERE, '../../content/threads/insurance/sets');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : ''; };
const out = arg('--out');
const force = argv.includes('--force');
const REVIEWED_MAX = 30;
// --only 31,32,…: 그 편만 (원고를 고친 편을 등록 직전에 다시 만들 때 — goms-register-auto.ps1)
const only = new Set((arg('--only') || '').split(',').map(Number).filter(Boolean));
if (!out) { console.log('사용법: node scripts/threads/word-make.mjs --out <보험글 폴더> [--force]'); process.exit(1); }

/** 묶음 파일의 편들 — insurance-word.py parse_set 과 같은 규칙 (## 번호, 앞머리 칸 뒤가 본문). */
export function parseSet(text) {
  text = text.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const parts = text.split(/^##\s+(\d+)\s*$/m);
  const posts = [];
  for (let i = 1; i < parts.length; i += 2) {
    const lines = parts[i + 1].replace(/^\n+/, '').split('\n');
    let j = 0;
    while (j < lines.length && /^(역할|보험|글감|출처|원문확인):/.test(lines[j])) j++;
    posts.push({ no: Number(parts[i]), body: lines.slice(j).join('\n').trim() });
  }
  return posts.sort((a, b) => a.no - b.no);
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tpl = readZip(fs.readFileSync(path.join(HERE, 'word-template.docx')));
const docEntry = tpl.find((e) => e.name === 'word/document.xml');
const xml = content(docEntry).toString('utf8');
const m = xml.match(/<w:p>(?:(?!<w:p>)[\s\S])*?\{\{BODY\}\}[\s\S]*?<\/w:p>/);
if (!m) throw new Error('틀에서 {{BODY}} 문단을 찾지 못함');
const proto = m[0];
const emptyP = proto.replace(/<w:t>\{\{BODY\}\}<\/w:t>/, '');

function build(body) {
  const paras = body.split('\n').map((l) => (l.trim() ? proto.replace('<w:t>{{BODY}}</w:t>', `<w:t xml:space="preserve">${esc(l)}</w:t>`) : emptyP)).join('');
  return Buffer.from(xml.replace(proto, paras), 'utf8');
}

fs.mkdirSync(out, { recursive: true });
let n = 0, made = 0, kept = 0;
for (const f of fs.readdirSync(SETS).filter((x) => x.endsWith('.md')).sort()) {
  for (const p of parseSet(fs.readFileSync(path.join(SETS, f), 'utf8'))) {
    n++;
    if (only.size && !only.has(n)) continue;
    const dest = path.join(out, `스레드 ${n}편.docx`);
    // 1~30편은 GOMS 에서 심의받은 Word 가 정본 — 있으면 --force 여도 절대 다시 만들지 않는다 (2026-10-27 사용자: "처음 심의받은 word 기준, 글씨가 틀리면 안 된다")
    if (fs.existsSync(dest) && n <= REVIEWED_MAX) { if (force) console.log(`그대로 둠: 스레드 ${n}편.docx (심의받은 Word)`); kept++; continue; }
    if (fs.existsSync(dest) && !force) { kept++; continue; }
    const tmp = `${dest}.tmp`;
    fs.writeFileSync(tmp, writeZip(tpl, new Map([['word/document.xml', build(p.body)]])));
    const back = wordText(tmp).replace(/\s/g, '');
    if (back !== p.body.replace(/\s/g, '')) { fs.rmSync(tmp); console.log(`⚠ 스레드 ${n}편: 만든 Word 를 다시 읽었는데 글이 달라 저장하지 않았어요`); continue; }
    fs.renameSync(tmp, dest);
    made++;
    console.log(`만듦: 스레드 ${n}편.docx (${f})`);
  }
}
console.log(`보험글 Word: 새로 ${made}편 · 그대로 ${kept}편 (전체 ${n}편)`);
