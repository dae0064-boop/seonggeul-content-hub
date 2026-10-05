#!/usr/bin/env node
/**
 * 발행이 끝난 지난 원고를 저장소에서 지운다 (2026-10-05 사용자 지시 — "이미 발행했고 지난 것들은 삭제").
 *
 *   node scripts/clean-published.mjs                  오늘(Asia/Seoul)보다 앞 날짜를 지운다
 *   node scripts/clean-published.mjs --before 2026-10-05
 *   node scripts/clean-published.mjs --dry-run        지울 목록만 보여 준다
 *
 * 지우는 것: content/posts/<날짜>-*.{md,json}, content/tistory/<날짜>-*.{md,json,html},
 *            content/image-plans/<날짜>-*.json
 * 지우기 전에 한 줄씩 content/archive/published.tsv 에 남긴다 (날짜·채널·슬러그·메인 키워드·제목).
 * 이 목록은 같은 메인 키워드를 다시 쓰지 않게 하는 데 쓴다 (lint-tistory.mjs).
 * 원고 본문이 필요하면 git 기록에서 되살릴 수 있다: git log --all -- content/posts/<슬러그>.md
 *
 * 아침 확인 Routine(routines/morning-check.md)이 매일 돌린다 — 그 시각에 어제 글은 모두 발행이 끝나 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parsePost } from './lib/parse-post.mjs';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry-run');
const bi = argv.indexOf('--before');
const before = bi >= 0 ? argv[bi + 1]
  : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) { console.error(`날짜 형식이 이상합니다: ${before}`); process.exit(1); }

const INDEX = path.join('content', 'archive', 'published.tsv');
const HEAD = 'date\tchannel\tslug\tmain_keyword\ttitle\n';
const seen = new Set(fs.existsSync(INDEX)
  ? fs.readFileSync(INDEX, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split('\t')[2]) : []);
const rows = [];
const gone = [];
const old = (f) => /^\d{4}-\d{2}-\d{2}-/.test(f) && f.slice(0, 10) < before;
const rm = (p) => { if (fs.existsSync(p)) { gone.push(p); if (!dry) fs.unlinkSync(p); } };

for (const [dir, channel, exts] of [
  ['content/posts', 'naver', ['.md', '.json']],
  ['content/tistory', 'tistory', ['.md', '.json', '.html']],
]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md') && old(x)).sort()) {
    const slug = f.replace(/\.md$/, '');
    if (!seen.has(slug)) {
      let p = {};
      try { p = parsePost(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { /* 앞머리가 깨져도 지우기는 한다 */ }
      const clean = (s) => String(s || '').replace(/[\t\n]/g, ' ').trim();
      rows.push([slug.slice(0, 10), channel, slug, clean(p.mainKeyword), clean(p.title)].join('\t'));
      seen.add(slug);
    }
    for (const e of exts) rm(path.join(dir, slug + e));
  }
  // .md 없이 남은 생성물
  for (const f of fs.readdirSync(dir).filter(old)) rm(path.join(dir, f));
}
const plans = 'content/image-plans';
if (fs.existsSync(plans)) for (const f of fs.readdirSync(plans).filter(old)) rm(path.join(plans, f));

if (rows.length && !dry) {
  fs.mkdirSync(path.dirname(INDEX), { recursive: true });
  if (!fs.existsSync(INDEX)) fs.writeFileSync(INDEX, HEAD);
  fs.appendFileSync(INDEX, rows.join('\n') + '\n');
}
console.log(`${before} 보다 앞 날짜: 원고 ${rows.length}편 목록에 남김, 파일 ${gone.length}개 ${dry ? '지울 예정' : '지움'}`);
if (dry) for (const g of gone) console.log(`  ${g}`);
