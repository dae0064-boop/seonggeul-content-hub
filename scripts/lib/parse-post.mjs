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
 *   publish_at: 2026-10-02 09:00   ← 예약발행 시각 (draft-day -Reserve 가 쓴다)
 *   ---
 *
 *   본문 줄1
 *   본문 줄2            ← 빈 줄까지가 한 덩어리
 *
 *   인용구(소제목) 소제목 텍스트
 *
 *   [빨간글씨]강조되는 줄[/빨간글씨]
 *   [노란배경]배경색 들어가는 줄[/노란배경]
 *   75세 이상은 [파란글씨]10월 12일[/파란글씨]부터예요   ← 줄 안의 낱말만 칠할 수도 있다
 *
 * 강조 태그는 줄 경계를 넘어갈 수 있다(여러 줄을 한 번에 감싸는 경우).
 * 결과: 줄 전체가 한 색이면 { t, s }, 일부만 칠했으면 { t, segs: [{ t, s? }] }.
 * post.marks 에 색별 표시 개수(여러 줄을 감싼 태그도 1곳)를 담는다.
 */

const STYLE = { 빨간글씨: 'red', 노란배경: 'yellow', 파란글씨: 'blue' };
const TAG_RE = /\[(\/?)(빨간글씨|노란배경|파란글씨)\]/g;
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
  const marks = { red: 0, yellow: 0, blue: 0 };

  for (const chunk of body.trim().split(/\r?\n\s*\r?\n/)) {
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // [이미지 N] 설명 — 사진 들어갈 자리. 본문으로 입력하지 않는다.
    const im = /^\[이미지\s*(\d+)\]\s*(.*)$/.exec(lines[0]);
    if (im) {
      blocks.push({ type: 'image', n: Number(im[1]), lines: [{ t: im[2].trim() }] });
      continue;
    }

    if (lines[0].startsWith(QUOTE_PREFIX)) {
      const text = lines[0].slice(QUOTE_PREFIX.length).trim();
      if (!text) warnings.push('인용구(소제목) 뒤에 텍스트가 없습니다.');
      if (lines.length > 1) warnings.push(`인용구는 한 줄이어야 합니다: "${text}"`);
      blocks.push({ type: 'quote', lines: [{ t: text }] });
      continue;
    }

    const out = [];
    for (const line of lines) {
      const segs = [];
      let last = 0, m;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(line))) {
        if (m.index > last) segs.push({ t: line.slice(last, m.index), s: carry ? STYLE[carry] : null });
        if (m[1]) carry = null;
        else { carry = m[2]; marks[STYLE[m[2]]]++; }
        last = m.index + m[0].length;
      }
      if (last < line.length) segs.push({ t: line.slice(last), s: carry ? STYLE[carry] : null });

      const t = segs.map((x) => x.t).join('').trim();
      if (!t) continue;
      // 앞뒤 공백만 있는 조각은 정리
      const real = segs.filter((x) => x.t.trim());
      const styles = new Set(real.map((x) => x.s));
      if (styles.size === 1 && real[0].s) out.push({ t, s: real[0].s });
      else if ([...styles].some(Boolean)) {
        const clean = segs.filter((x) => x.t).map((x) => (x.s ? { t: x.t, s: x.s } : { t: x.t }));
        clean[0].t = clean[0].t.replace(/^\s+/, '');
        clean[clean.length - 1].t = clean[clean.length - 1].t.replace(/\s+$/, '');
        out.push({ t, segs: clean.filter((x) => x.t) });
      } else out.push({ t });
    }
    if (out.length) blocks.push({ type: 'p', lines: out });
  }

  if (carry) warnings.push(`강조 태그가 닫히지 않았습니다: [${carry}]`);

  return {
    title: meta.title || '',
    category: meta.category || '',
    tags: meta.tags ? meta.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    mainKeyword: meta.main_keyword || '',
    subKeywords: meta.sub_keywords ? meta.sub_keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
    publishAt: meta.publish_at || '',
    blocks,
    marks,
    warnings,
  };
}

/** 자동화 스크립트가 실제로 입력할 텍스트 줄만 평평하게 뽑는다. */
export function flatLines(post) {
  return post.blocks.flatMap((b) => b.lines.map((l) => ({ ...l, block: b.type })));
}
