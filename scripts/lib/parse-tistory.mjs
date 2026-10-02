/**
 * 티스토리 원고 → 본문 HTML.
 *
 * 2026-10-02 사용자 지시: 티스토리도 네이버와 같은 지침으로 쓴다. 그래서 원고 형식은 네이버 원고와 같고
 * (scripts/lib/parse-post.mjs 가 읽는다), 여기서는 그걸 티스토리 에디터에 넣을 HTML 로 바꾸기만 한다.
 *
 *   덩어리(빈 줄로 나뉜 줄들)  → <p> 안에서 줄마다 <br> — 모바일에서 원고 줄바꿈 그대로
 *   덩어리 사이                → 빈 문단 한 줄 (인용구·이미지 위아래는 빼서 붙인다 — 네이버와 같은 규칙)
 *   인용구(소제목)             → <h2> 를 인용구 모양(따옴표 + 밑줄)으로. 구글은 소제목(H2)으로 읽는다
 *   [빨간글씨] [파란글씨]      → 글자색 + 굵게 (#ff0010 / #0078cb)
 *   [노란배경]                 → 배경색 + 굵게 (#fff8b2)
 *   [이미지 N] 설명            → 표시 문단으로 남긴다 (사진 넣기는 아직 손으로)
 */
import { parsePost } from './parse-post.mjs';

export { parsePost };

const COLOR = {
  red: 'color: #ff0010;',
  blue: 'color: #0078cb;',
  yellow: 'background-color: #fff8b2;',
};
// 네이버 인용구 4번(라인&따옴표)과 비슷하게: 가운데 정렬, 위에 따옴표, 아래 밑줄
const QUOTE_H2 = 'text-align: center; font-size: 1.3em; line-height: 1.5; padding: 4px 8px 12px; margin: 8px 0 4px; border-bottom: 2px solid #4a3a30;';
const QUOTE_MARK = 'display: block; font-size: 1.6em; line-height: 1; color: #b8a99a;';
const BLANK = '<p data-ke-size="size16">&nbsp;</p>';

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const styled = (t, s) => (s ? `<span style="${COLOR[s]}"><b>${esc(t)}</b></span>` : esc(t));

function lineHtml(l) {
  if (l.segs) return l.segs.map((g) => styled(g.t, g.s)).join('');
  return styled(l.t, l.s);
}

/** post: parsePost() 결과 */
export function toHtml(post) {
  const out = [];
  let prev = null;
  for (const b of post.blocks) {
    const tight = b.type === 'quote' || b.type === 'image' || prev === 'quote' || prev === 'image';
    if (prev && !tight) out.push(BLANK);
    if (b.type === 'quote') {
      out.push(`<h2 data-ke-size="size26" style="${QUOTE_H2}"><span style="${QUOTE_MARK}">“</span>${esc(b.lines[0].t)}</h2>`);
    } else if (b.type === 'image') {
      out.push(`<p data-ke-size="size16">[이미지 ${b.n}] ${esc(b.lines[0]?.t || '')}</p>`);
    } else {
      out.push(`<p data-ke-size="size16">${b.lines.map(lineHtml).join('<br>')}</p>`);
    }
    prev = b.type;
  }
  return out.join('\n');
}
