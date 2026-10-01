/**
 * 티스토리 원고 정본(.md) 파서 + HTML 변환.
 *
 * 네이버 원고와 형식이 다르다. 티스토리는 구글이 문서 구조를 읽으므로 강제 줄바꿈 없이
 * 제목(H2·H3)·표·목록으로 짠다 (standards/발행-운영기준.md, memory/CLAUDE.md [8]).
 *
 *   ---
 *   title: 제목
 *   main_keyword: 메인 키워드
 *   sub_keywords: 서브1, 서브2
 *   type: 롱폼 | 가이드 | 비교
 *   category: 생활정보
 *   tags: 태그1, 태그2            ← 10개 이하
 *   source_post: 2026-10-02-deungsan-stick   ← 바탕이 된 네이버 원고 (유사문서 검사에 쓴다)
 *   publish_at: 2026-10-02 10:00
 *   ---
 *
 *   :::summary
 *   - 요약 한 줄
 *   :::
 *
 *   첫 문단. 한 문단은 한 줄로 쓴다 (문단 안 줄바꿈 금지).
 *
 *   ## 큰 제목
 *   ### 작은 제목
 *   - 목록 / 1. 번호 목록 / - [ ] 체크리스트
 *   | 표 | 머리 |
 *   |---|---|
 *   > 인용
 *   [이미지 1] 대체텍스트
 *
 * 줄 안에서는 **굵게** 와 [글자](https://링크) 만 쓴다.
 */

export function parseTistory(raw) {
  const meta = {};
  let body = raw;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line.trim());
      if (m) meta[m[1]] = m[2].trim();
    }
    body = raw.slice(fm[0].length);
  }

  const blocks = [];
  const warnings = [];
  const lines = body.replace(/\r/g, '').split('\n');
  let i = 0;
  const isBlank = (l) => !l.trim();

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (isBlank(line)) { i++; continue; }

    if (t === ':::summary') {
      const inner = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') inner.push(lines[i++]);
      if (i >= lines.length) warnings.push(':::summary 가 ::: 로 닫히지 않았습니다.');
      i++;
      const items = inner.map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^[-*]\s+/, ''));
      blocks.push({ type: 'summary', items });
      continue;
    }

    let m;
    if ((m = /^(#{2,3})\s+(.+)$/.exec(t))) {
      blocks.push({ type: m[1].length === 2 ? 'h2' : 'h3', text: m[2].trim() });
      i++; continue;
    }
    if (/^#\s/.test(t)) {
      warnings.push(`H1(# )은 쓰지 않습니다 — 제목은 title 이 H1 입니다: "${t}"`);
      blocks.push({ type: 'h2', text: t.replace(/^#\s+/, '') });
      i++; continue;
    }
    if ((m = /^\[이미지\s*(\d+)\]\s*(.*)$/.exec(t))) {
      blocks.push({ type: 'image', n: Number(m[1]), alt: m[2].trim() });
      i++; continue;
    }
    if (t.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      const cells = (r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const sepIdx = rows.findIndex((r) => /^\|?\s*:?-{2,}/.test(r));
      if (sepIdx !== 1) warnings.push(`표 두 번째 줄이 |---| 구분선이 아닙니다: "${rows[0]}"`);
      const head = cells(rows[0]);
      const data = rows.filter((_, k) => k !== 0 && k !== sepIdx).map(cells);
      blocks.push({ type: 'table', head, rows: data });
      continue;
    }
    if (/^([-*]|\d+\.)\s+/.test(t)) {
      const ordered = /^\d+\./.test(t);
      const items = [];
      while (i < lines.length && /^([-*]|\d+\.)\s+/.test(lines[i].trim())) {
        items.push(lines[i++].trim().replace(/^([-*]|\d+\.)\s+/, ''));
      }
      const check = !ordered && items.every((x) => /^\[[ xX]\]\s/.test(x));
      blocks.push({
        type: check ? 'check' : ordered ? 'ol' : 'ul',
        items: check ? items.map((x) => x.replace(/^\[[ xX]\]\s+/, '')) : items,
      });
      continue;
    }
    if (t.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) q.push(lines[i++].trim().replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', text: q.join(' ') });
      continue;
    }

    // 문단: 빈 줄까지. 줄이 여러 개면 강제 줄바꿈으로 본다(검사기가 잡는다)
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i].trim())) para.push(lines[i++].trim());
    blocks.push({ type: 'p', text: para.join(' '), wrapped: para.length > 1 });
  }

  const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
  return {
    title: meta.title || '',
    mainKeyword: meta.main_keyword || '',
    subKeywords: list(meta.sub_keywords),
    type: meta.type || '',
    category: meta.category || '',
    tags: list(meta.tags),
    sourcePost: meta.source_post || '',
    publishAt: meta.publish_at || '',
    blocks,
    warnings,
  };
}

function isBlockStart(t) {
  return /^(#{1,3}\s|\||>|([-*]|\d+\.)\s|\[이미지\s*\d+\]|:::)/.test(t);
}

// ---------------------------------------------------------------- 글자만 뽑기

/** 줄 안 표기(**, 링크)를 걷어 낸 글자. */
export const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1');

/** 독자가 읽는 본문 글자 (이미지 자리 제외). 검사기·발행 확인이 같은 기준으로 센다. */
export function blockTexts(post) {
  return post.blocks.flatMap((b) => {
    switch (b.type) {
      case 'h2': case 'h3': case 'p': case 'quote': return [plain(b.text)];
      case 'ul': case 'ol': case 'check': case 'summary': return b.items.map(plain);
      case 'table': return [...b.head, ...b.rows.flat()].map(plain);
      default: return [];
    }
  });
}

// ---------------------------------------------------------------- HTML

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

// 티스토리 기본 에디터가 쓰는 data-ke-* 속성을 붙여 두면 에디터에서 다시 열어도 모양이 유지된다.
const SUMMARY_STYLE = 'border:1px solid #d9d9d9;border-left:4px solid #0078cb;background:#f6f9fc;padding:16px 20px;margin:0 0 24px';
const TABLE_STYLE = 'border-collapse:collapse;width:100%';
const CELL_STYLE = 'border:1px solid #d9d9d9;padding:8px 10px';

/** 티스토리 본문 HTML. [이미지 N] 은 표시 문단으로 남긴다 (사진은 아직 손으로 넣는다). */
export function toHtml(post) {
  const out = [];
  for (const b of post.blocks) {
    switch (b.type) {
      case 'h2': out.push(`<h2 data-ke-size="size26">${inline(b.text)}</h2>`); break;
      case 'h3': out.push(`<h3 data-ke-size="size23">${inline(b.text)}</h3>`); break;
      case 'p': out.push(`<p data-ke-size="size16">${inline(b.text)}</p>`); break;
      case 'quote': out.push(`<blockquote data-ke-style="style2">${inline(b.text)}</blockquote>`); break;
      case 'ul': out.push(`<ul style="list-style-type: disc;" data-ke-list-type="disc">${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); break;
      case 'ol': out.push(`<ol style="list-style-type: decimal;" data-ke-list-type="decimal">${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`); break;
      case 'check': out.push(`<ul style="list-style-type: none;" data-ke-list-type="none">${b.items.map((x) => `<li>☐ ${inline(x)}</li>`).join('')}</ul>`); break;
      case 'summary':
        out.push(`<div style="${SUMMARY_STYLE}"><p data-ke-size="size16"><b>핵심 요약</b></p>`
          + `<ul style="list-style-type: disc;" data-ke-list-type="disc">${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>`);
        break;
      case 'table':
        out.push(`<table style="${TABLE_STYLE}" border="1" data-ke-align="alignLeft"><thead><tr>`
          + b.head.map((c) => `<th style="${CELL_STYLE};background:#f2f2f2">${inline(c)}</th>`).join('')
          + '</tr></thead><tbody>'
          + b.rows.map((r) => `<tr>${r.map((c) => `<td style="${CELL_STYLE}">${inline(c)}</td>`).join('')}</tr>`).join('')
          + '</tbody></table>');
        break;
      case 'image': out.push(`<p data-ke-size="size16">[이미지 ${b.n}] ${esc(b.alt)}</p>`); break;
    }
  }
  return out.join('\n');
}
