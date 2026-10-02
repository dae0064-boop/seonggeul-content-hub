#!/usr/bin/env node
/**
 * 티스토리 정본(.md) → 스크립트 입력(.json) + 붙여넣기용(.html) 변환.
 * 원고 형식은 네이버 원고와 같다 (2026-10-02 사용자 지시). .md 가 정본이고, .json·.html 은 직접 고치지 않는다.
 *
 *   node scripts/build-tistory.mjs content/tistory/*.md
 *
 * .html 은 자동화가 막혔을 때 티스토리 에디터 HTML 모드에 그대로 붙여넣는 용도다.
 */
import fs from 'node:fs';
import { parsePost, toHtml } from './lib/parse-tistory.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용법: node scripts/build-tistory.mjs <원고.md> [...]');
  process.exit(1);
}

for (const file of files) {
  if (!file.endsWith('.md')) { console.error(`건너뜀(.md 아님): ${file}`); continue; }
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  for (const w of post.warnings) console.warn(`⚠ ${file}: ${w}`);

  const html = toHtml(post);
  const json = {
    slug: file.split(/[\\/]/).pop().replace(/\.md$/, ''),
    title: post.title,
    category: post.category,
    tags: post.tags,
    publishAt: post.publishAt || undefined,
    blocks: post.blocks,
    html,
  };
  fs.writeFileSync(file.replace(/\.md$/, '.json'), JSON.stringify(json, null, 2) + '\n');
  fs.writeFileSync(file.replace(/\.md$/, '.html'), html + '\n');
  console.log(`✅ ${file.replace(/\.md$/, '')}.{json,html}  (${post.blocks.length}블록)`);
}
