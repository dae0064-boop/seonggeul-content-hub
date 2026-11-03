#!/usr/bin/env node
/**
 * 심의필 번호를 넣은 Word 만들기 (2026-10-26 사용자 — "1~10편까지 준법감시인 심의필번호와 유효기간 수정해서 word 로 저장").
 *
 *   node scripts/threads/word-banner.mjs --word-dir <Drive 보험글> --out-dir <Drive 보험글-심의필>
 *
 * 저장소의 편별 배너(content/threads/insurance/banners/thread-N.jpg, made.tsv 에 적힌 편)로
 * Drive 보험글/스레드 N편.docx 의 배너 사진만 바꿔 <out-dir>/스레드 N편.docx 로 저장한다. 글은 손대지 않는다.
 * 원본 Word(심의 신청·재심사에 올리는 파일)는 그대로 둔다. 배너나 원본이 바뀌었을 때만 다시 만든다.
 *
 *   node scripts/threads/word-banner.mjs --word-dir <Drive 보험글> --placeholder <배너.jpg>
 *     원본 Word(보험글/스레드 N편.docx) 전부의 배너 사진을 그 사진(심의필 자리표시 판)으로 바꾼다. 글은 손대지 않는다.
 *     (2026-11-03 사용자 — "워드에 들어간 모든 배너 사진 새 배너로, 앞으로 심의 올릴 때·받았을 때 모두 이 배너")
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceImage } from './word-fix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANNERS = path.join(ROOT, 'content/threads/insurance/banners');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : ''; };
const wordDir = arg('--word-dir');
const outDir = arg('--out-dir');
const placeholder = arg('--placeholder');
if (wordDir && placeholder) {
  const jpg = fs.readFileSync(placeholder);
  let changed = 0, same = 0, bad = 0;
  const files = fs.readdirSync(wordDir).filter((f) => /^스레드 \d+편\.docx$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  for (const f of files) {
    const file = path.join(wordDir, f);
    try {
      const before = fs.readFileSync(file);
      replaceImage(file, file, jpg);
      if (fs.readFileSync(file).equals(before)) same++; else { changed++; console.log(`새 배너: ${f}`); }
    } catch (e) { console.log(`⚠ ${f}: ${e.message}`); bad++; }
  }
  console.log(`원본 Word 배너: 바꿈 ${changed}편 · 이미 새 배너 ${same}편${bad ? ` · 문제 ${bad}편` : ''} (전체 ${files.length}편)`);
  process.exit(bad ? 2 : 0);
}
if (!wordDir || !outDir) { console.log('사용법: node scripts/threads/word-banner.mjs --word-dir <보험글> --out-dir <보험글-심의필>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const made = new Map();
const index = path.join(BANNERS, 'made.tsv');
if (fs.existsSync(index)) {
  for (const line of fs.readFileSync(index, 'utf8').split(/\r?\n/)) {
    const [n, t] = line.split('\t');
    if (/^\d+$/.test(n || '')) made.set(Number(n), t);
  }
}
let done = 0, kept = 0, bad = 0;
for (const [n, t] of [...made].sort((a, b) => a[0] - b[0])) {
  const src = path.join(wordDir, `스레드 ${n}편.docx`);
  const banner = path.join(BANNERS, `thread-${n}.jpg`);
  const dest = path.join(outDir, `스레드 ${n}편.docx`);
  if (!fs.existsSync(src) || !fs.existsSync(banner)) { console.log(`⚠ 스레드 ${n}편: ${fs.existsSync(src) ? '배너' : 'Word'} 가 없어요`); bad++; continue; }
  const newer = (a, b) => fs.statSync(a).mtimeMs > fs.statSync(b).mtimeMs;
  if (fs.existsSync(dest) && !newer(src, dest) && !newer(banner, dest)) { kept++; continue; }
  try {
    replaceImage(src, dest, fs.readFileSync(banner));
    console.log(`저장: 스레드 ${n}편.docx — ${t.replace(/^.*심의필\s*/, '')}`);
    done++;
  } catch (e) { console.log(`⚠ 스레드 ${n}편 저장 못 함: ${e.message}`); bad++; }
}
console.log(`심의필 Word: 새로 ${done}편 · 그대로 ${kept}편${bad ? ` · 문제 ${bad}편` : ''} → ${outDir}`);
process.exit(bad ? 2 : 0);
