#!/usr/bin/env node
/**
 * 이미 만든 스레드 보험글 Word(스레드 N편.docx)에 GOMS 심의 수정요구 문구를 빨간 글씨로 덧붙인다 — Python 없이.
 *
 * 2026-10-26 첫 반려 재심사 실행: 사무실 PC 에 Python 이 없어 insurance-word.py 가 Word 를 다시 만들지 못했고,
 * 반려 9건이 모두 "새 Word 에 문구 없음"으로 건너뛰어졌다. 그래서 Node 만으로 기존 Word 를 고친다.
 * 넣는 자리와 모양은 insurance-word.py --fixes 와 같다: 본문 아래·배너 사진 위, 빨간 글씨(FF0010) 10pt.
 * 이미 들어 있는 문구는 다시 넣지 않는다 (여러 번 돌려도 같다).
 *
 *   node scripts/threads/word-fix.mjs --dir <보험글 폴더> --fixes <goms-fixes.tsv>            tsv 의 모든 편을 고친다
 *   node scripts/threads/word-fix.mjs --dir <보험글 폴더> --fixes <goms-fixes.tsv> --check 23  문구가 다 있으면 종료 코드 0
 *
 * .docx 는 zip 이다. 바깥 라이브러리 없이 zlib 로 word/document.xml 만 바꿔 다시 묶는다 (다른 파일은 그대로 복사).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** zip 안 파일 목록 (중앙 디렉터리 기준). */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip 끝 표시를 찾지 못함');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 목록이 깨짐');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const central = buf.subarray(p, p + 46 + nlen + xlen + clen);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const dataStart = off + 30 + lnlen + lxlen;
    entries.push({ name, method, central, local: buf.subarray(off, dataStart), data: buf.subarray(dataStart, dataStart + csize) });
    p += central.length;
  }
  return entries;
}

function content(e) {
  if (e.method === 0) return Buffer.from(e.data);
  if (e.method === 8) return zlib.inflateRawSync(e.data);
  throw new Error(`모르는 압축 방식 ${e.method}`);
}

/** 바꾼 파일(name → 새 내용)만 다시 압축하고 나머지는 그대로 복사해 zip 을 새로 만든다. */
function writeZip(entries, changed) {
  const parts = []; const centrals = []; let off = 0;
  for (const e of entries) {
    let local = Buffer.from(e.local), central = Buffer.from(e.central), data = e.data;
    if (changed.has(e.name)) {
      const raw = changed.get(e.name);
      data = zlib.deflateRawSync(raw);
      const crc = crc32(raw);
      for (const [b, base] of [[local, 0], [central, 2]]) { // 중앙 디렉터리는 앞 2바이트(만든 버전)만큼 칸이 밀린다
        b.writeUInt16LE(b.readUInt16LE(base + 6) & ~0x0008, base + 6); // 뒤에 붙는 크기 표시(data descriptor) 끔
        b.writeUInt16LE(8, base + 8);
        b.writeUInt32LE(crc, base + 14);
        b.writeUInt32LE(data.length, base + 18);
        b.writeUInt32LE(raw.length, base + 22);
      }
    } else if (local.readUInt16LE(6) & 0x0008) {
      // 크기를 뒤에 따로 적은 항목은 앞 머리에 크기를 채워 넣는다 (descriptor 를 빼고 복사하므로)
      local.writeUInt16LE(local.readUInt16LE(6) & ~0x0008, 6);
      central.writeUInt16LE(central.readUInt16LE(8) & ~0x0008, 8);
      local.writeUInt32LE(central.readUInt32LE(16), 14);
      local.writeUInt32LE(central.readUInt32LE(20), 18);
      local.writeUInt32LE(central.readUInt32LE(24), 22);
    }
    central.writeUInt32LE(off, 42);
    parts.push(local, data);
    centrals.push(central);
    off += local.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

export { readZip, writeZip, content };
/** GOMS 심의 의견으로 가장 많이 요구된 문구 (goms-ad.mjs YAKGWAN 과 같은 글자). */
export const NOTICE = '보험사 상품별로 상이할 수 있으므로, 세부사항은 반드시 해당 약관을 참조하시기바랍니다';
const norm = (t) => t.replace(/\s/g, '');
const unxml = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const docText = (xml) => unxml([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''));

const FONT = '맑은 고딕';
const redPara = (t, color = 'FF0010') => `<w:p><w:pPr><w:spacing w:after="0" w:line="336" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}"/><w:color w:val="${color}"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const emptyPara = '<w:p><w:pPr><w:spacing w:after="0" w:line="336" w:lineRule="auto"/></w:pPr></w:p>';

export function readFixes(tsv) {
  const map = new Map();
  if (!tsv || !fs.existsSync(tsv)) return map;
  for (const line of fs.readFileSync(tsv, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const [n, t] = line.split('\t');
    if (!/^\d+$/.test((n || '').trim()) || !(t || '').trim()) continue;
    const k = Number(n);
    if (!map.has(k)) map.set(k, []);
    if (!map.get(k).some((x) => norm(x) === norm(t))) map.get(k).push(t.trim());
  }
  return map;
}

/**
 * 심의받은 Word 의 글 — 사진 문단 앞까지 문단마다 한 줄 (스레드에 올릴 글 그대로, 2026-10-26).
 * 본문 + 아래 빈 줄 + 빨간 수정 문구 순서는 insurance-word.py · addPhrases 가 만든 그대로다. 끝 빈 줄은 뗀다.
 */
export function wordText(file) {
  const xml = content(readZip(fs.readFileSync(file)).find((e) => e.name === 'word/document.xml')).toString('utf8');
  const body = xml.slice(xml.indexOf('<w:body'));
  const lines = [];
  for (const m of body.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    if (m[0].includes('<w:drawing') || m[0].includes('<w:pict')) break;
    lines.push(docText(m[0]));
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join('\n');
}

/**
 * Word 속 배너 사진을 다른 사진으로 바꿔 새 파일로 저장한다 (2026-10-26 — 편마다 심의필 번호·유효기간을 넣은 배너).
 * 원본 Word 는 그대로 둔다 (GOMS 재심사에 올리는 파일이라). 바꾼 뒤 다시 읽어 사진이 새 것과 같은지 확인한다.
 */
export function replaceImage(src, dest, jpg) {
  const entries = readZip(fs.readFileSync(src));
  const media = entries.filter((e) => /^word\/media\/[^/]+\.(jpe?g|png)$/i.test(e.name));
  if (media.length !== 1) throw new Error(`Word 안 사진이 ${media.length}장이에요 (1장이어야 함)`);
  const name = media[0].name;
  if (!/\.jpe?g$/i.test(name)) throw new Error(`Word 안 사진이 jpg 가 아니에요 (${name})`);
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, writeZip(entries, new Map([[name, jpg]])));
  const back = content(readZip(fs.readFileSync(tmp)).find((e) => e.name === name));
  if (!back.equals(jpg)) { fs.rmSync(tmp); throw new Error('바꾼 뒤 다시 읽었는데 사진이 달라요'); }
  fs.renameSync(tmp, dest);
}

/** Word 에 빠진 문구 목록. */
export function missingIn(file, phrases) {
  const xml = content(readZip(fs.readFileSync(file)).find((e) => e.name === 'word/document.xml')).toString('utf8');
  const text = norm(docText(xml));
  return phrases.filter((t) => !text.includes(norm(t)));
}

/** 빠진 문구를 배너 사진 문단 앞에 빨간 글씨로 넣는다. 넣은 개수를 돌려준다. */
export function addPhrases(file, phrases, { color = 'FF0010' } = {}) {
  const buf = fs.readFileSync(file);
  const entries = readZip(buf);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new Error('word/document.xml 이 없음');
  const xml = content(doc).toString('utf8');
  const text = norm(docText(xml));
  const add = phrases.filter((t) => !text.includes(norm(t)));
  if (!add.length) return 0;
  // 사진이 든 마지막 문단 앞에 넣는다. 사진이 없으면 본문 끝(w:sectPr 앞)에.
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)];
  const pic = paras.filter((m) => m[0].includes('<w:drawing')).pop();
  const at = pic ? pic.index : xml.lastIndexOf('<w:sectPr');
  if (at < 0) throw new Error('넣을 자리를 찾지 못함');
  const block = add.map((t) => redPara(t, color)).join('') + emptyPara;
  const out = xml.slice(0, at) + block + xml.slice(at);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, writeZip(entries, new Map([['word/document.xml', Buffer.from(out, 'utf8')]])));
  // 다시 읽어 문구가 들어갔는지 확인한 뒤에만 바꿔 놓는다
  if (missingIn(tmp, add).length) { fs.rmSync(tmp); throw new Error('넣은 뒤 다시 읽었는데 문구가 없음'); }
  fs.renameSync(tmp, file);
  return add.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : ''; };
  const dir = arg('--dir'); const fixes = readFixes(arg('--fixes')); const check = arg('--check');
  const notice = arg('--notice');
  if (dir && notice) {
    // 새로 심의 신청하는 편에 약관 참조 문구를 미리 넣는다 (2026-10-26 — 반려 9건 중 8건이 이 문구 요구). 검은 글씨, 이미 있으면 그대로.
    let bad = 0;
    for (const n of notice.split(',').map(Number).filter(Boolean)) {
      const f = path.join(dir, `스레드 ${n}편.docx`);
      if (n <= 30) { console.log(`그대로 둠: 스레드 ${n}편 (심의받은 Word — 1~30편은 손대지 않아요)`); continue; }
      if (!fs.existsSync(f)) { console.log(`⚠ 스레드 ${n}편.docx 가 없어요`); bad++; continue; }
      try { const k = addPhrases(f, [NOTICE], { color: '000000' }); console.log(k ? `약관 문구 넣음: 스레드 ${n}편` : `그대로 둠: 스레드 ${n}편 (이미 있음)`); }
      catch (e) { console.log(`⚠ 스레드 ${n}편 문구 넣지 못함: ${e.message}`); bad++; }
    }
    process.exit(bad ? 2 : 0);
  }
  if (!dir) { console.log('사용법: node scripts/threads/word-fix.mjs --dir <보험글 폴더> --fixes <tsv> [--check N]'); process.exit(1); }
  const file = (n) => path.join(dir, `스레드 ${n}편.docx`);
  if (check) {
    const ph = fixes.get(Number(check)) || [];
    const miss = ph.length && fs.existsSync(file(check)) ? missingIn(file(check), ph) : ph;
    for (const t of miss) console.log(`없음: ${t}`);
    const ok = ph.length > 0 && fs.existsSync(file(check)) && !miss.length;
    console.log(`확인: 스레드 ${check}편.docx ${ok ? '문구 있음' : '문구 없음'}`);
    process.exit(ok ? 0 : 1);
  }
  let bad = 0;
  for (const [n, ph] of [...fixes].sort((a, b) => a[0] - b[0])) {
    if (!fs.existsSync(file(n))) { console.log(`⚠ 스레드 ${n}편.docx 가 없어요`); bad++; continue; }
    try {
      const k = addPhrases(file(n), ph);
      console.log(k ? `수정 문구 넣음: 스레드 ${n}편 (${k}줄)` : `그대로 둠: 스레드 ${n}편 (문구 이미 있음)`);
    } catch (e) { console.log(`⚠ 스레드 ${n}편 고치지 못함: ${e.message}`); bad++; }
  }
  process.exit(bad ? 2 : 0);
}
