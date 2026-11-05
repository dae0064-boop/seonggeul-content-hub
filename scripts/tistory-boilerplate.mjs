#!/usr/bin/env node
/**
 * 티스토리 글에 되풀이된 문장 목록을 만든다 (2026-11-06 사용자 — 애드센스 '가치가 별로 없는 콘텐츠').
 *
 * 과거 content/tistory/*.md 전부(지운 글 포함, git 기록)를 읽어, 서로 다른 글 3편 이상에 같은 문장(16자 이상)이
 * 나온 줄을 content/tistory-boilerplate.txt 에 적는다. lint-tistory.mjs 는 이 목록의 문장을 새 글에서 막는다.
 * 실행: node scripts/tistory-boilerplate.mjs   (새 글을 많이 쓴 뒤 다시 돌린다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT = path.join('content', 'tistory-boilerplate.txt');
const FIXED = /^(안녕하세요|매일매일 좋은 날을 나누는 성글벙글입니다😊|좋아요·공감과 (구독|이웃추가) 부탁드려요💙|이상 성글벙글의 .+ 포스팅이었습니다😎|\[쿠팡 링크\]|\[이미지|이 포스팅은 쿠팡|이에 따른 일정액)/;
const git = (args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '';

const paths = [...new Set(git(['log', '--all', '--name-only', '--pretty=format:', '--', 'content/tistory']).split('\n'))]
  .filter((p) => p.endsWith('.md'));

const fileCount = new Map(); // 문장 → 서로 다른 글 수
for (const p of paths) {
  const last = git(['log', '--all', '-1', '--format=%H', '--', p]).trim();
  if (!last) continue;
  let text = git(['show', `${last}:${p}`]);
  if (!text) text = git(['show', `${last}^:${p}`]); // 마지막 커밋에서 지운 파일은 그 앞 커밋에서 읽는다
  const seen = new Set(
    text.replace(/^---[\s\S]*?---/, '').split(/\r?\n/).map((l) => l.trim())
      .filter((l) => l.length >= 16 && !FIXED.test(l)),
  );
  for (const l of seen) fileCount.set(l, (fileCount.get(l) || 0) + 1);
}

const list = [...fileCount].filter(([, n]) => n >= 3).map(([l]) => l).sort();
fs.writeFileSync(OUT, `${list.join('\n')}\n`);
console.log(`글 ${paths.length}개(지운 글 포함)를 읽고 되풀이 문장 ${list.length}줄을 ${OUT} 에 적었습니다.`);
