#!/usr/bin/env node
/**
 * 정본(.md) → 스크립트 입력(.json) 변환.
 * CLAUDE.md 규칙상 원고는 .md 와 .json 한 쌍으로 유지한다.
 *
 *   node scripts/build-post.mjs content/posts/*.md
 */
import fs from 'node:fs';
import { parsePost } from './lib/parse-post.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용법: node scripts/build-post.mjs <원고.md> [...]');
  process.exit(1);
}

for (const file of files) {
  if (!file.endsWith('.md')) { console.error(`건너뜀(.md 아님): ${file}`); continue; }
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  for (const w of post.warnings) console.warn(`⚠ ${file}: ${w}`);

  const out = file.replace(/\.md$/, '.json');
  const json = {
    slug: file.split('/').pop().replace(/\.md$/, ''),
    title: post.title,
    category: post.category,
    tags: post.tags,
    blocks: post.blocks,
  };
  fs.writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
  const lines = post.blocks.reduce((a, b) => a + b.lines.length, 0);
  console.log(`✅ ${out}  (${post.blocks.length}덩어리 / ${lines}줄)`);
}
