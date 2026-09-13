/**
 * 원고 정본(.md) 파서.
 *
 * 형식
 *   ---
 *   title: 제목
 *   main_keyword: 메인 키워드
 *   sub_keywords: 서브1, 서브2
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
 *
 * 모든 줄과 덩어리에 `ln`(원본 .md 의 행 번호)이 붙는다. 검사기가 "몇 행을 고치라"고
 * 말할 수 있게 하려는 것이다. `.json` 으로 내보낼 때는 build-post.mjs 가 떼어낸다.
 * 이미지 블록의 `n` 은 이미지 번호이므로 행 번호와 헷갈리지 않게 키를 따로 둔다.
 */

const STYLE = { 빨간글씨: 'red', 노란배경: 'yellow' };
const QUOTE_PREFIX = '인용구(소제목)';

export function parsePost(raw) {
  let meta = {};
  let body = raw;
  let offset = 0; // 본문 첫 줄의 파일 행 번호 - 1

  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line.trim());
      if (m) meta[m[1]] = m[2].trim();
    }
    body = raw.slice(fm[0].length);
    offset = (fm[0].match(/\n/g) || []).length;
  }

  // 빈 줄로 덩어리를 나눈다. 행 번호는 파일 기준으로 유지한다.
  const chunks = [];
  let cur = [];
  body.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      if (cur.length) { chunks.push(cur); cur = []; }
      return;
    }
    cur.push({ t, ln: offset + i + 1 });
  });
  if (cur.length) chunks.push(cur);

  const blocks = [];
  const warnings = [];
  let carry = null; // 줄을 넘어 이어지는 강조

  for (const lines of chunks) {
    const ln = lines[0].ln;

    // [이미지 N] 설명 — 사진 들어갈 자리. 본문으로 입력하지 않는다.
    const im = /^\[이미지\s*(\d+)\]\s*(.*)$/.exec(lines[0].t);
    if (im) {
      blocks.push({ type: 'image', n: Number(im[1]), ln, lines: [{ t: im[2].trim(), ln }] });
      continue;
    }

    if (lines[0].t.startsWith(QUOTE_PREFIX)) {
      const text = lines[0].t.slice(QUOTE_PREFIX.length).trim();
      if (!text) warnings.push({ ln, msg: '인용구(소제목) 뒤에 텍스트가 없습니다.' });
      if (lines.length > 1) warnings.push({ ln, msg: `인용구는 한 줄이어야 합니다: "${text}"` });
      blocks.push({ type: 'quote', ln, lines: [{ t: text, ln }] });
      continue;
    }

    const out = [];
    for (const { t: line, ln: lineNo } of lines) {
      const opens  = [...line.matchAll(/\[(빨간글씨|노란배경)\]/g)];
      const closes = [...line.matchAll(/\[\/(빨간글씨|노란배경)\]/g)];

      // 한 줄에 두 색을 같이 쓰면 파서는 앞의 것만 적용한다 — 조용히 틀리므로 잡아준다.
      const kinds = new Set([...opens, ...closes].map((m) => m[1]));
      if (kinds.size > 1)
        warnings.push({ ln: lineNo, msg: `한 줄에 두 색상을 함께 쓸 수 없습니다: "${line}"` });

      const applied = opens.length ? opens[0][1] : carry;

      if (opens.length && !closes.length) carry = opens[opens.length - 1][1];
      else if (closes.length) carry = null;

      const t = line.replace(/\[\/?(빨간글씨|노란배경)\]/g, '').trim();
      if (!t) continue;
      out.push(applied ? { t, ln: lineNo, s: STYLE[applied] } : { t, ln: lineNo });
    }
    if (out.length) blocks.push({ type: 'p', ln, lines: out });
  }

  if (carry) warnings.push({ ln: 0, msg: `강조 태그가 닫히지 않았습니다: [${carry}]` });

  return {
    title: meta.title || '',
    category: meta.category || '',
    tags: meta.tags ? meta.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    mainKeyword: meta.main_keyword || '',
    subKeywords: meta.sub_keywords ? meta.sub_keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
    blocks,
    warnings,
  };
}

/** 자동화 스크립트가 실제로 입력할 텍스트 줄만 평평하게 뽑는다. */
export function flatLines(post) {
  return post.blocks.flatMap((b) => b.lines.map((l) => ({ ...l, block: b.type })));
}

/** `.json` 으로 내보낼 때 행 번호를 떼어낸다. 발행 스크립트는 행 번호를 쓰지 않는다. */
export function stripLineNumbers(blocks) {
  return blocks.map(({ ln, lines, ...b }) => ({
    ...b,
    lines: lines.map(({ ln: _drop, ...l }) => l),
  }));
}
