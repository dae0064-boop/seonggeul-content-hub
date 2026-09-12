/**
 * 원고 정본(.md) 파서.
 *
 * 형식
 *   ---
 *   title: 제목
 *   category: 생활정보
 *   tags: 태그1, 태그2
 *   ---
 *
 *   본문 줄1
 *   본문 줄2            ← 빈 줄까지가 한 덩어리
 *
 *   인용구(소제목) 소제목 텍스트
 *
 *   [빨간글씨]강조되는 줄[/빨간글씨]
 *   [노란배경]배경색 들어가는 줄[/노란배경]
 *
 * 강조 태그는 줄 경계를 넘어갈 수 있다(여러 줄을 한 번에 감싸는 경우).
 */

const STYLE = { 빨간글씨: 'red', 노란배경: 'yellow' };
const QUOTE_PREFIX = '인용구(소제목)';

export function parsePost(raw) {
  let meta = {};
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
  let carry = null; // 줄을 넘어 이어지는 강조

  for (const chunk of body.trim().split(/\r?\n\s*\r?\n/)) {
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    if (lines[0].startsWith(QUOTE_PREFIX)) {
      const text = lines[0].slice(QUOTE_PREFIX.length).trim();
      if (!text) warnings.push('인용구(소제목) 뒤에 텍스트가 없습니다.');
      if (lines.length > 1) warnings.push(`인용구는 한 줄이어야 합니다: "${text}"`);
      blocks.push({ type: 'quote', lines: [{ t: text }] });
      continue;
    }

    const out = [];
    for (const line of lines) {
      const opens  = [...line.matchAll(/\[(빨간글씨|노란배경)\]/g)];
      const closes = [...line.matchAll(/\[\/(빨간글씨|노란배경)\]/g)];

      const applied = opens.length ? opens[0][1] : carry;

      if (opens.length && !closes.length) carry = opens[opens.length - 1][1];
      else if (closes.length) carry = null;

      const t = line.replace(/\[\/?(빨간글씨|노란배경)\]/g, '').trim();
      if (!t) continue;
      out.push(applied ? { t, s: STYLE[applied] } : { t });
    }
    if (out.length) blocks.push({ type: 'p', lines: out });
  }

  if (carry) warnings.push(`강조 태그가 닫히지 않았습니다: [${carry}]`);

  return {
    title: meta.title || '',
    category: meta.category || '',
    tags: meta.tags ? meta.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    blocks,
    warnings,
  };
}

/** 자동화 스크립트가 실제로 입력할 텍스트 줄만 평평하게 뽑는다. */
export function flatLines(post) {
  return post.blocks.flatMap((b) => b.lines.map((l) => ({ ...l, block: b.type })));
}
