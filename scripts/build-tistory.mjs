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
import { cleanCredit } from './lib/official-photo.mjs';
import { parsePost, toHtml } from './lib/parse-tistory.mjs';
import { applyCoupang, loadLinks } from './lib/coupang.mjs';
import { resolveTistoryRelated } from './lib/tistory-related.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용법: node scripts/build-tistory.mjs <원고.md> [...]');
  process.exit(1);
}

const links = loadLinks();
for (const file of files) {
  if (!file.endsWith('.md')) { console.error(`건너뜀(.md 아님): ${file}`); continue; }
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  for (const w of post.warnings) console.warn(`⚠ ${file}: ${w}`);

  // 쿠팡 파트너스 글: 링크 목록에 있으면 링크를 넣고, 없으면 대가성 문구·링크 자리를 뺀다 (scripts/lib/coupang.mjs)
  const cp = applyCoupang(post, links);
  if (cp.note) console.log(`  ${file}: ${cp.note}`);
  post.blocks = cp.blocks;
  // 실제 사진 출처 (2026-11-04 사용자 — 티스토리도 고화질 사진): "[사진 출처 N]" 줄을 그림 폴더의 NN.credit.txt 첫 줄로. 사진 대신 AI 그림이 들어갔으면(파일 없음) 그 줄을 뺀다
  {
    const slug = file.split(/[\\/]/).pop().replace(/\.md$/, '');
    const CREDIT = /^\[사진 출처 (\d+)\]$/;
    for (const b of post.blocks) {
      if (!Array.isArray(b.lines) || !b.lines.some((l) => CREDIT.test((l.t || '').trim()))) continue;
      b.lines = b.lines.flatMap((l) => {
        const m = CREDIT.exec((l.t || '').trim());
        if (!m) return [l];
        const f = `content/images/${slug}/${String(m[1]).padStart(2, '0')}.credit.txt`;
        const c = fs.existsSync(f) ? cleanCredit(fs.readFileSync(f, 'utf8').split(/\r?\n/)[0].trim()) : '';
        return c ? [{ t: c }] : [];
      });
    }
    post.blocks = post.blocks.filter((b) => b.type === 'image' || !Array.isArray(b.lines) || b.lines.length);
  }
  // 함께 보면 좋은 글: 발행된 티스토리 글 주소를 찾아 끝에 넣는다. 못 찾으면 빠진다 (클라우드에서는 늘 빠지고 아침 PC 가 다시 만든다)
  const related = await resolveTistoryRelated(post, { blog: process.env.TISTORY_BLOG || 'seongdaeeyo', log: (m) => console.log(`  ${file}: ${m}`) });
  if (related.length) console.log(`  ${file}: 함께 보면 좋은 글 ${related.length}개 — ${related.map((r) => r.url).join(' , ')}`);
  const html = toHtml(post, { coupang: cp.link, related });
  const json = {
    slug: file.split(/[\\/]/).pop().replace(/\.md$/, ''),
    title: post.title,
    category: post.category,
    tags: post.tags,
    publishAt: post.publishAt || undefined,
    coupangUrl: cp.link?.url || undefined,
    relatedUrls: related.length ? related.map((r) => r.url) : undefined,
    blocks: post.blocks,
    html,
  };
  fs.writeFileSync(file.replace(/\.md$/, '.json'), JSON.stringify(json, null, 2) + '\n');
  fs.writeFileSync(file.replace(/\.md$/, '.html'), html + '\n');
  console.log(`✅ ${file.replace(/\.md$/, '')}.{json,html}  (${post.blocks.length}블록)`);
}
