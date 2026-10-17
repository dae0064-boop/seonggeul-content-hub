/**
 * 티스토리 쿠팡 파트너스 글 (2026-10-17 사용자 결정 — 티스토리는 조회수 + 수익 두 목표, 쿠팡은 티스토리에만).
 *
 * 원고 쪽 약속
 *   프런트매터  coupang: <상품 키워드>      content/affiliate/coupang-links.tsv 의 첫 칸과 같은 말
 *   본문        고정 인사말 바로 다음 덩어리 = 대가성 문구 두 줄 (DISCLOSURE 그대로)
 *               정리 소제목 아래 어딘가에 한 줄짜리 덩어리 [쿠팡 링크]
 *
 * 링크 목록에 그 키워드가 있으면 build-tistory 가 [쿠팡 링크] 를 rel="sponsored" 링크 한 줄로 바꾸고,
 * 없으면 대가성 문구와 [쿠팡 링크] 를 둘 다 빼고 보통 글로 낸다 (링크 없는 글에 대가성 문구만 남지 않게).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISCLOSURE = [
  '이 포스팅은 쿠팡 파트너스 활동의 일환으로,',
  '이에 따른 일정액의 수수료를 제공받습니다.',
];
export const MARKER = '[쿠팡 링크]';
export const LINKS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'affiliate', 'coupang-links.tsv');
// 쿠팡 파트너스가 만들어 주는 주소만 받는다 (다른 단축 주소·리디렉션으로 감추지 않는다)
export const LINK_RE = /^https:\/\/link\.coupang\.com\/[A-Za-z0-9/_\-?=&.]+$/;

const blockText = (b) => (b.lines || []).map((l) => l.t.trim());
export const isDisclosure = (b) => b.type === 'p' && blockText(b).join('\n') === DISCLOSURE.join('\n');
export const isMarker = (b) => b.type === 'p' && blockText(b).join('\n') === MARKER;

/** coupang-links.tsv → Map(키워드 → { url, label }). 줄 형식: 키워드<TAB>링크<TAB>보여 줄 글자. # 은 주석 */
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

/** 원고 blocks 에 링크를 붙이거나(링크 있음) 쿠팡 부분을 걷어 낸다(없음). { blocks, link, note } */
export function applyCoupang(post, links = loadLinks()) {
  const has = post.blocks.some(isMarker) || post.blocks.some(isDisclosure);
  if (!post.coupang && !has) return { blocks: post.blocks, link: null, note: '' };
  const link = post.coupang ? links.get(post.coupang) : null;
  if (link) return { blocks: post.blocks, link, note: `쿠팡 링크: ${post.coupang} → ${link.url}` };
  return {
    blocks: post.blocks.filter((b) => !isMarker(b) && !isDisclosure(b)),
    link: null,
    note: `쿠팡 링크 목록에 "${post.coupang}" 이 없어 대가성 문구·링크 자리를 빼고 보통 글로 냅니다`,
  };
}
