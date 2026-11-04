#!/usr/bin/env node
/**
 * 정본(.md) → 스크립트 입력(.json) 변환.
 * CLAUDE.md 규칙상 원고는 .md 와 .json 한 쌍으로 유지한다.
 *
 *   node scripts/build-post.mjs content/posts/*.md
 */
import fs from 'node:fs';
import { parsePost } from './lib/parse-post.mjs';
import { topicFor } from './lib/naver-topic.mjs';

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
    publishAt: post.publishAt || undefined,
    related: post.related.length ? post.related : undefined,
    sourceUrls: post.sourceUrls.length ? post.sourceUrls : undefined,
    brandconnect: post.brandconnect || undefined,   // 링크는 발행할 때 찾는다 (scripts/lib/brandconnect.mjs)
    draftOnly: post.draftOnly || undefined,   // 확인용 — draft-day -Reserve 가 건너뛴다
    issue: post.issue || undefined,   // 이슈 글 연예|정책 → 발행 때 블로그 카테고리 연예·방송·이슈·뉴스 (2026-11-03 — 빠져 있어 이슈 글 4편이 생활·정보로 들어갔다)
    subcategory: post.subcategory || undefined,   // 블로그 하위 카테고리 (2026-11-04 — 원고에 적어도 .json 에 빠져 손예진 글이 스타 소식 대신 규칙대로 영화·OTT 로 갔다)
    topic: topicFor(post) || undefined,   // 발행 패널 '주제' (2026-10-26 — 기본값 '비즈니스·경제'로 들어가고 있었다)
    blocks: post.blocks,
  };
  fs.writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
  const lines = post.blocks.reduce((a, b) => a + b.lines.length, 0);
  console.log(`✅ ${out}  (${post.blocks.length}덩어리 / ${lines}줄)`);
}
