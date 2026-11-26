// 네이버 검색 API 한 군데에서 부르기 (2026-11-26).
// 키가 두 종류다:
//   ① 네이버 개발자센터(developers.naver.com) 앱 키 → https://openapi.naver.com/v1/search/<kind>.json, X-Naver-Client-Id/Secret
//   ② 네이버 클라우드 NAVER API Hub(console.ncloud.com/naver-api-hub) 키 → https://naverapihub.apigw.ntruss.com/search/v1/<kind>,
//      X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY (https://api.ncloud-docs.com/docs/naver-api-hub-search-blog)
// .env 의 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 에 어느 쪽 키를 넣어도 된다 — ① 로 먼저 불러 401 이면 ② 로 한 번 더 부르고,
// 된 쪽을 기억해 다음부터는 그쪽으로만 부른다. 고정하려면 NAVER_SEARCH_VIA=hub 또는 openapi.
// 응답(items·total) 모양은 둘이 같다.
export const OPEN_HOST = 'https://openapi.naver.com';
export const HUB_HOST = 'https://naverapihub.apigw.ntruss.com';

let via = String(process.env.NAVER_SEARCH_VIA || '').toLowerCase();

function qs(params) {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

/**
 * @param {string} kind  blog · news · cafearticle · kin …
 * @param {object} params  query, display, sort …
 * @param {{host?: string, fetchImpl?: Function, signal?: AbortSignal, id?: string, secret?: string}} [opts]
 *   host 를 OPEN_HOST 가 아닌 곳(시험용 가짜 서버)으로 주면 ① 방식으로 그 주소만 부른다.
 * @returns {Promise<Response>}
 */
export async function naverSearch(kind, params, { host = OPEN_HOST, fetchImpl = globalThis.fetch, signal, id, secret } = {}) {
  const cid = id ?? process.env.NAVER_CLIENT_ID ?? '';
  const sec = secret ?? process.env.NAVER_CLIENT_SECRET ?? '';
  const viaOpen = () => fetchImpl(`${host}/v1/search/${kind}.json?${qs(params)}`, {
    headers: { 'X-Naver-Client-Id': cid, 'X-Naver-Client-Secret': sec }, signal,
  });
  const viaHub = () => fetchImpl(`${HUB_HOST}/search/v1/${kind}?${qs(params)}`, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': cid, 'X-NCP-APIGW-API-KEY': sec }, signal,
  });
  if (host !== OPEN_HOST) return viaOpen();
  if (via === 'hub') return viaHub();
  const r = await viaOpen();
  if (r.status !== 401 || via === 'openapi') { if (r.ok) via = 'openapi'; return r; }
  const h = await viaHub();
  if (h.ok) via = 'hub';
  return h.ok || h.status !== 401 ? h : r;
}
