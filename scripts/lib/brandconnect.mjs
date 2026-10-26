/**
 * 네이버 쇼핑 커넥트(브랜드 커넥트) 글 (2026-10-26 사용자 — "링크에 관련된 내용이 있다면 필요한 물품을 검색해서 링크를 달아줘").
 * 네이버 블로그 = 쇼핑 커넥트, 티스토리 = 쿠팡 파트너스 (2026-10-17 사용자 결정, content/affiliate/README.md).
 *
 * 원고 쪽 약속
 *   프런트매터  brandconnect: <상품 키워드>   content/affiliate/brandconnect-links.tsv 의 첫 칸과 같은 말
 *   본문        고정 인사말 바로 다음 덩어리 = 대가성 문구 두 줄 (DISCLOSURE 그대로)
 *               정리 소제목 아래 어딘가에 한 줄짜리 덩어리 [쇼핑 링크]
 *
 * 링크는 발행할 때(아침 PC, git pull 뒤) 목록에서 찾는다 — 밤 원고 작업 뒤에 링크를 채워도 그날 글에 들어간다.
 * 목록에 있으면 [쇼핑 링크] 를 "▶ 네이버쇼핑에서 ○○ 보기" 줄로 바꾸고 publish-naver 가 그 아래에 링크 카드를 넣는다.
 * 없으면 대가성 문구와 [쇼핑 링크] 를 둘 다 빼고 보통 글로 낸다 (링크 없는 글에 대가성 문구만 남지 않게).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISCLOSURE = [
  '이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로,',
  '판매 발생 시 수수료를 제공받습니다.',
];
export const MARKER = '[쇼핑 링크]';
export const anchorText = (label) => `▶ 네이버쇼핑에서 ${label} 보기`;
export const LINKS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'affiliate', 'brandconnect-links.tsv');
// 쇼핑 커넥트가 만들어 준 네이버 주소만 받는다 (naver.me 단축 주소 또는 *.naver.com). 다른 단축 주소로 감추지 않는다
export const LINK_RE = /^https:\/\/(naver\.me|([a-z0-9-]+\.)*naver\.com)\/[A-Za-z0-9/_\-?=&.%]+$/;
export const LINK_IN_TEXT = /naver\.me\/|brandconnect\.naver\.com|smartstore\.naver\.com|brand\.naver\.com/;

const blockText = (b) => (b.lines || []).map((l) => l.t.trim());
export const isDisclosure = (b) => b.type === 'p' && blockText(b).join('\n') === DISCLOSURE.join('\n');
export const isMarker = (b) => b.type === 'p' && blockText(b).join('\n') === MARKER;

/** brandconnect-links.tsv → Map(키워드 → { url, label }). 줄 형식: 키워드<TAB>링크<TAB>보여 줄 글자. # 은 주석 */
export function loadLinks(file = LINKS_FILE) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const [kw, url, label] = raw.split('\t').map((s) => (s || '').trim());
    if (kw && LINK_RE.test(url || '')) map.set(kw, { url, label: label || kw });
  }
  return map;
}

/**
 * 발행 직전 원고 blocks 를 고친다. { blocks, link, anchor, note }
 *   링크 있음 → [쇼핑 링크] 를 anchor 줄로 바꾼다 (카드는 publish-naver 가 그 아래에)
 *   링크 없음 → 대가성 문구·[쇼핑 링크] 를 뺀다
 */
export function applyBrandconnect(post, links = loadLinks()) {
  const has = post.blocks.some(isMarker) || post.blocks.some(isDisclosure);
  if (!post.brandconnect && !has) return { blocks: post.blocks, link: null, anchor: null, note: '' };
  const link = post.brandconnect ? links.get(post.brandconnect) : null;
  if (link) {
    const anchor = anchorText(link.label);
    return {
      blocks: post.blocks.map((b) => (isMarker(b) ? { ...b, lines: [{ t: anchor }] } : b)),
      link, anchor,
      note: `쇼핑 커넥트 링크: ${post.brandconnect} → ${link.url}`,
    };
  }
  return {
    blocks: post.blocks.filter((b) => !isMarker(b) && !isDisclosure(b)),
    link: null, anchor: null,
    note: `쇼핑 커넥트 링크 목록에 "${post.brandconnect}" 이 없어 대가성 문구·링크 자리를 빼고 보통 글로 냅니다`,
  };
}
