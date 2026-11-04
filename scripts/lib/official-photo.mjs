/**
 * 공식·공개 라이선스 사진 찾기 (2026-11-02 사용자 — "공식 사진 찾아 넣는 기능").
 *
 * 이슈 글(연예·정책)에 실제 사진을 넣는다. 단, 쓸 수 있다고 라이선스가 적힌 사진만:
 *   ① 위키미디어 공용(commons.wikimedia.org) — 파일마다 라이선스가 적혀 있다.
 *      CC0·퍼블릭 도메인·CC BY·CC BY-SA·공공누리 제1유형만 받는다 (NC·ND·비자유 사진은 버린다).
 *      대한민국 정부·Korea.net 이 CC BY-SA 로 올린 대통령·장관·행사 사진, 방송사·소속사가 CC BY 로 푼 연예인 사진이 여기 있다.
 *   ② 정책브리핑(korea.kr) 기사 — 페이지에 "공공누리 제1유형"이 적혀 있고, "텍스트에 한하여"·"저작권을 보유하고 있지 않"
 *      같은 사진 제외 문구가 없을 때만. (11/2 확인: 대부분의 정책브리핑 기사는 사진이 제외돼 있다 — 그런 기사는 버린다)
 * 언론사 보도사진은 쓰지 않는다 (언론사 저작권).
 *
 * 계획서 그림 항목:
 *   { n: 2, file: "02.png", kind: "photo", title: "...",
 *     photo: { file: "File:Shin Se-kyung 170719.jpg" (선택, 먼저), query: "윤종훈", query_en: "Yoon Jong-hoon", page: "https://www.korea.kr/..." (선택) },
 *     prompt: "...대신 그릴 그림 프롬프트(사진을 못 찾으면 AI 로)" }
 * 찾으면 content/images/<슬러그>/NN.png 와 NN.credit.txt(사진 출처 한 줄)를 남긴다.
 * 원고에는 [이미지 N] 바로 다음 줄에 "[사진 출처 N]" 을 두면, 발행 때 그 줄이 출처 글자로 바뀐다(AI 그림으로 대신하면 줄이 빠진다).
 */
import fs from 'node:fs';

const UA = 'SeonggeulBlogPhotoBot/1.0 (https://github.com/dae0064-boop/seonggeul-content-hub; personal blog tool)';
const OK_LICENSE = /^(cc0|public domain|pd\b|pd-|cc[ -]by(-sa)?[ -]?\d|cc by(-sa)? \d|kogl type 1|공공누리 ?제?1유형)/i;
const BAD_LICENSE = /(nc|nd|non-?commercial|no ?deriv|fair use|non-?free)/i;
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

// 인물 사진은 그 사람 혼자 나온 것만 (2026-11-03 사용자 — 「소연 임신」에 티아라 단체 사진이 걸려 조잡했다. "특정 인물 사진만").
// photo.person: ["Soyeon", "So-yeon", "소연"] — 파일 제목에 이 이름 중 하나가 있어야 하고, 여러 사람·단체로 보이는 제목은 버린다.
const norm = (t) => String(t || '').toLowerCase().replace(/[\s_\-.()]/g, '');
const GROUP_WORDS = /(\band\b|&|\bwith\b|\bmembers?\b|\bgroup\b|\bcast\b|\bteam\b|\bconcert\b|\bstage\b|\bfans?\b|단체|멤버|출연진|무대)/i;
export function soloOk(title, person) {
  const names = [].concat(person || []).map(norm).filter((x) => x.length >= 2);
  if (!names.length) return true;
  const t = norm(title);
  if (!names.some((n) => t.includes(n))) return false;
  return !GROUP_WORDS.test(String(title).replace(/_/g, ' '));
}

/** 위키미디어 공용 검색 — 라이선스가 맞는 첫 사진 */
const PERSON_MIN_SIDE = 1000; // 인물 사진 짧은 쪽 최소 px (대표사진 1024 정사각형이 늘려지지 않게)
const GENERIC_WORDS = new Set(['korea', 'korean', 'south', 'republic', 'national', 'service', 'center', 'centre', 'office', 'the', 'of', 'and', 'in', 'seoul', 'photo', 'image', 'building', 'government', 'ministry', 'public', 'agency', 'corporation', 'company', 'official']);

export async function searchCommons({ query, query_en: queryEn, person, minWidth = 800 }) {
  const terms = [queryEn, query].filter(Boolean);
  for (const q of terms) {
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '25',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '2048',
    });
    const data = await getJson(url);
    const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    // 흔한 말(korea·national·service …)만 맞은 사진은 엉뚱한 사진이다 — 2026-11-04 「National Pension Service Korea」로 1939년 자동차 사진이 대표사진이 됐다.
    // 사람이 아닌 검색은 흔한 말을 빼고 센다: 남은 말이 1~2개면 모두, 3개 넘으면 60% 이상 맞아야 한다
    const allWords = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    const keyWords = person ? allWords : allWords.filter((w) => !GENERIC_WORDS.has(w));
    const words = keyWords.length ? keyWords : allWords;
    const needHits = person ? 1 : (words.length <= 2 ? words.length : Math.ceil(words.length * 0.6));
    const scored = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || ii.width < minWidth) continue;
      // 인물 대표사진은 고화질만 (2026-11-04 사용자 — "연예인 메인 사진 화질이 너무 구려, 선명하고 고화질로"): 짧은 쪽 1000px 미만은 정사각형으로 자르면 흐려진다
      if (person && Math.min(ii.width, ii.height) < PERSON_MIN_SIDE) continue;
      const md = ii.extmetadata || {};
      const lic = strip(md.LicenseShortName?.value);
      if (!OK_LICENSE.test(lic) || BAD_LICENSE.test(lic) || String(md.NonFree?.value || '') === 'true') continue;
      // 사람이 아닌 검색은 파일 이름·이름표·설명 앞부분만, 낱말 단위로 본다 (긴 설명 속 'suspension' 이 'pension' 으로 맞던 것)
      const desc = strip(md.ImageDescription?.value);
      const hay = `${p.title} ${person ? desc : desc.slice(0, 300)} ${strip(md.ObjectName?.value)}`.toLowerCase();
      const has = (w) => (person || !/^[a-z0-9-]+$/.test(w) ? hay.includes(w) : new RegExp(`(^|[^a-z0-9])${w.replace(/-/g, '\\-')}([^a-z0-9]|$)`).test(hay));
      const hit = words.filter(has).length;
      if (!hit || hit < needHits) continue; // 이름이 제목·설명에 없는 사진은 다른 사람일 수 있다
      if (person && !soloOk(p.title.replace(/^File:/, ''), person)) continue; // 혼자 나온 그 사람 사진만
      scored.push({
        score: hit * 10 + Math.min(Math.min(ii.width, ii.height), 3000) / (person ? 500 : 1000) + (person ? (ii.height >= ii.width ? 1 : 0) : (ii.width >= ii.height ? 1 : 0)), // 인물은 세로(얼굴 위주) 사진을 먼저
        url: ii.thumburl || ii.url,
        page: ii.descriptionurl,
        license: lic,
        author: strip(md.Artist?.value).slice(0, 40) || '작가 미상',
        title: p.title.replace(/^File:/, ''),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored[0]) {
      const s = scored[0];
      return { ...s, source: '위키미디어 공용', credit: `사진: ${s.author} / 위키미디어 공용 (${s.license})` };
    }
  }
  return null;
}

/** 위키미디어 공용 파일 하나를 이름으로 (클라우드가 WebSearch 로 찾아 계획서 photo.file 에 적은 것) — 라이선스는 여기서 다시 확인한다 */
export async function commonsFile(file) {
  const title = file.startsWith('File:') ? file : `File:${file}`;
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '2048',
  });
  const data = await getJson(url);
  const p = Object.values(data?.query?.pages || {})[0];
  const ii = p?.imageinfo?.[0];
  if (!ii) return { skip: `파일 없음: ${title}` };
  const md = ii.extmetadata || {};
  const lic = strip(md.LicenseShortName?.value);
  if (!OK_LICENSE.test(lic) || BAD_LICENSE.test(lic) || String(md.NonFree?.value || '') === 'true') return { skip: `라이선스 안 맞음(${lic}): ${title}` };
  if (Math.min(ii.width || 0, ii.height || 0) < 700) return { skip: `사진이 작아 흐려짐(${ii.width}×${ii.height}): ${title}` };
  const author = strip(md.Artist?.value).slice(0, 40) || '작가 미상';
  return { url: ii.thumburl || ii.url, page: ii.descriptionurl, license: lic, author, title: p.title, source: '위키미디어 공용', credit: `사진: ${author} / 위키미디어 공용 (${lic})` };
}

/** 정책브리핑 기사 — 사진까지 공공누리 제1유형일 때만 본문 첫 사진 */
export async function fromKoreaKr(page) {
  const r = await fetch(page, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${page}`);
  const html = await r.text();
  const text = strip(html);
  if (!/공공누리\s*제\s*1\s*유형/.test(text)) return { skip: '공공누리 제1유형이 아님' };
  if (/텍스트에 한하여|저작권을 보유하고 있지 않/.test(text)) return { skip: '사진은 이용 허락 범위 밖(텍스트만 공공누리)' };
  const m = /src="(https:\/\/www\.korea\.kr\/newsWeb\/resources\/attaches\/[^"]+\.(?:jpe?g|png))"/i.exec(html);
  if (!m) return { skip: '본문 사진 없음' };
  return { url: m[1], page, license: '공공누리 제1유형', source: '대한민국 정책브리핑', credit: '사진: 대한민국 정책브리핑(www.korea.kr) (공공누리 제1유형)' };
}

// ── 플리커 (2026-11-03 사용자 — "위키미디어 말고 다른 곳도") ─────────────────────────────
// 상업적으로 써도 되는 라이선스만: 4 CC BY 2.0 · 5 CC BY-SA 2.0 · 9 CC0 · 10 Public Domain Mark · 11 CC BY 4.0 · 12 CC BY-SA 4.0
// (NC·ND·저작권 보유는 고르지 않는다). 인물은 soloOk — 사진 제목에 그 사람 이름이 있고 단체·행사로 보이지 않는 것만.
const FLICKR_LIC = { 4: 'CC BY 2.0', 5: 'CC BY-SA 2.0', 9: 'CC0 1.0', 10: 'Public Domain Mark', 11: 'CC BY 4.0', 12: 'CC BY-SA 4.0' };
export async function searchFlickr({ query, query_en: queryEn, person, minWidth: mw }, key = process.env.FLICKR_API_KEY) {
  const minWidth = mw || (person ? PERSON_MIN_SIDE : 800); // 인물은 고화질만 (2026-11-04 사용자)
  if (!key) return null;
  const terms = [...new Set([].concat(person || []).slice(0, 2).concat([queryEn, query]).filter(Boolean))];
  for (const q of terms) {
    const url = 'https://www.flickr.com/services/rest/?' + new URLSearchParams({
      method: 'flickr.photos.search', api_key: key, text: q, license: Object.keys(FLICKR_LIC).join(','), content_type: '1', media: 'photos',
      sort: 'relevance', per_page: '50', extras: 'license,owner_name,url_l,url_c,tags', format: 'json', nojsoncallback: '1',
    });
    const data = await getJson(url);
    if (data?.stat !== 'ok') throw new Error(`플리커: ${data?.message || '응답 이상'}`);
    const scored = [];
    for (const p of data.photos?.photo || []) {
      const src = p.url_l || p.url_c; const w = Number(p.width_l || p.width_c), h = Number(p.height_l || p.height_c);
      if (!src || !FLICKR_LIC[p.license] || w < minWidth) continue;
      if (person) { if (!soloOk(p.title || '', person)) continue; }
      else if (!q.toLowerCase().split(/\s+/).some((wd) => wd.length >= 2 && `${p.title} ${p.tags}`.toLowerCase().includes(wd))) continue;
      scored.push({ score: Math.min(w, 2000) / 1000 + (person ? (h >= w ? 1 : 0) : (w >= h ? 1 : 0)), p, src });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored[0]) {
      const { p, src } = scored[0]; const lic = FLICKR_LIC[p.license]; const author = String(p.ownername || '작가 미상').slice(0, 40);
      return { url: src, page: `https://www.flickr.com/photos/${p.owner}/${p.id}`, license: lic, author, title: p.title, source: '플리커', credit: `사진: ${author} / 플리커 (${lic})` };
    }
  }
  return null;
}

// ── 오픈버스 (Openverse — 키 없이, 플리커·위키미디어 등의 CC 사진을 한 번에) ──────────────
// 2026-11-03: 펙셀스가 새 키 발급을 멈춰 키 없는 곳을 더함. 상업 이용 가능한 by·by-sa·cc0·pdm 만, 인물은 soloOk.
const OV_LIC = { by: 'CC BY', 'by-sa': 'CC BY-SA', cc0: 'CC0', pdm: 'Public Domain Mark' };
// 오픈버스는 2026-11 무렵부터 익명 검색을 막았다(401) — 가입한 앱의 client_id·secret 으로 받은 토큰을 쓴다 (launchers\\openverse-key.cmd)
let ovToken = null;
async function openverseAuth() {
  const id = process.env.OPENVERSE_CLIENT_ID, secret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret) return {};
  if (!ovToken) {
    const r = await fetch('https://api.openverse.org/v1/auth_tokens/token/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }), signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`오픈버스 토큰 실패 HTTP ${r.status} ${j.error_description || j.detail || ''} (가입 메일의 인증 링크를 눌렀는지)`);
    ovToken = j.access_token;
  }
  return { Authorization: `Bearer ${ovToken}` };
}
export async function searchOpenverse({ query, query_en: queryEn, person, minWidth: mw }) {
  const minWidth = mw || (person ? PERSON_MIN_SIDE : 800); // 인물은 고화질만 (2026-11-04 사용자)
  const auth = await openverseAuth();
  const terms = [...new Set([].concat(person || []).slice(0, 2).concat([queryEn, query]).filter(Boolean))];
  for (const q of terms) {
    const r = await fetch('https://api.openverse.org/v1/images/?' + new URLSearchParams({ q, license_type: 'commercial', page_size: '40', mature: 'false' }), { headers: { 'User-Agent': UA, ...auth }, signal: AbortSignal.timeout(30000) });
    if (r.status === 401) throw new Error(auth.Authorization ? '오픈버스 인증 실패(401)' : '오픈버스 키 없음 — launchers\\openverse-key.cmd');
    if (!r.ok) throw new Error(`오픈버스 HTTP ${r.status}`);
    const data = await r.json();
    const scored = [];
    for (const p of data?.results || []) {
      const lic = OV_LIC[String(p.license || '').toLowerCase()];
      if (!lic || !p.url || (p.width && p.width < minWidth)) continue;
      if (person) { if (!soloOk(p.title || '', person)) continue; }
      else if (!q.toLowerCase().split(/\s+/).some((wd) => wd.length >= 2 && String(p.title || '').toLowerCase().includes(wd))) continue;
      const w = Number(p.width || 0), h = Number(p.height || 0);
      scored.push({ score: Math.min(w, 2000) / 1000 + (person ? (h >= w ? 1 : 0) : (w >= h ? 1 : 0)), p, lic });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored[0]) {
      const { p, lic } = scored[0]; const ver = p.license_version ? ` ${p.license_version}` : '';
      const author = String(p.creator || '작가 미상').slice(0, 40); const src = { flickr: '플리커', wikimedia: '위키미디어 공용' }[p.source] || p.source || '오픈버스';
      return { url: p.url, page: p.foreign_landing_url || p.url, license: lic + ver, author, title: p.title, source: src, credit: `사진: ${author} / ${src} (${lic}${ver})` };
    }
  }
  return null;
}

// ── 픽사베이 (장면·장소·물건 — 사람 글에는 쓰지 않는다. Pixabay 콘텐츠 라이선스: 상업 이용 가능) ──
export async function searchPixabay({ scene_en: sceneEn, query_en: queryEn }, key = process.env.PIXABAY_API_KEY) {
  const q = sceneEn || queryEn;
  if (!key || !q) return null;
  const data = await getJson('https://pixabay.com/api/?' + new URLSearchParams({ key, q, image_type: 'photo', safesearch: 'true', per_page: '20', min_width: '1000' }));
  const p = (data?.hits || [])[0];
  if (!p) return null;
  const author = String(p.user || '작가 미상').slice(0, 40);
  return { url: p.largeImageURL || p.webformatURL, page: p.pageURL, license: 'Pixabay 라이선스', author, source: '픽사베이', credit: `사진: ${author} / Pixabay` };
}

// ── 펙셀스 (장면·장소·물건 사진 — 사람 글에는 쓰지 않는다) ──────────────────────────────
// Pexels 라이선스: 상업적 사용 가능, 출처 표시는 의무가 아니지만 남긴다. 인물(photo.person)이 있는 칸에는 부르지 않는다.
export async function searchPexels({ scene_en: sceneEn, query_en: queryEn }, key = process.env.PEXELS_API_KEY) {
  const q = sceneEn || queryEn;
  if (!key || !q) return null;
  const r = await fetch('https://api.pexels.com/v1/search?' + new URLSearchParams({ query: q, per_page: '15' }), { headers: { Authorization: key, 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`펙셀스 HTTP ${r.status}`);
  const data = await r.json();
  const p = (data.photos || []).find((x) => x.width >= 1000);
  if (!p) return null;
  const author = String(p.photographer || '작가 미상').slice(0, 40);
  return { url: p.src?.large2x || p.src?.large || p.src?.original, page: p.url, license: 'Pexels 라이선스', author, source: '펙셀스', credit: `사진: ${author} / Pexels` };
}

/** 계획서 photo 칸으로 사진 하나 고르기. 못 찾으면 null 과 이유 */
export async function findPhoto(spec = {}) {
  const why = [];
  if (spec.page && /korea\.kr/.test(spec.page)) {
    try { const k = await fromKoreaKr(spec.page); if (k.url) return { photo: k }; why.push(`정책브리핑: ${k.skip}`); } catch (e) { why.push(`정책브리핑: ${e.message}`); }
  }
  for (const f of [].concat(spec.file || [])) {
    if (spec.person && !soloOk(String(f).replace(/^File:/, ''), spec.person)) { why.push(`위키미디어 파일: ${f} — 제목에 ${[].concat(spec.person).join('/')} 이름이 없거나 단체 사진으로 보여 건너뜀`); continue; }
    try { const c = await commonsFile(f); if (c.url) return { photo: c }; why.push(`위키미디어 파일: ${c.skip}`); } catch (e) { why.push(`위키미디어 파일: ${e.message}`); }
  }
  if (spec.query || spec.query_en) {
    try { const c = await searchCommons(spec); if (c) return { photo: c }; why.push('위키미디어 공용: 라이선스 맞는 사진 없음'); } catch (e) { why.push(`위키미디어 공용: ${e.message}`); }
  }
  if (spec.query || spec.query_en || spec.person) {
    try { const o = await searchOpenverse(spec); if (o) return { photo: o }; why.push('오픈버스: 맞는 사진 없음'); } catch (e) { why.push(`오픈버스: ${e.message}`); }
  }
  if (spec.query || spec.query_en || spec.person) {
    if (!process.env.FLICKR_API_KEY) why.push('플리커: 키 없음(launchers\\tools\\photo-key.ps1)');
    else try { const f = await searchFlickr(spec); if (f) return { photo: f }; why.push('플리커: 맞는 사진 없음'); } catch (e) { why.push(`플리커: ${e.message}`); }
  }
  if (!spec.person && (spec.scene_en || spec.query_en) && process.env.PIXABAY_API_KEY) {
    try { const x = await searchPixabay(spec); if (x) return { photo: x }; why.push('픽사베이: 맞는 사진 없음'); } catch (e) { why.push(`픽사베이: ${e.message}`); }
  }
  if (!spec.person && (spec.scene_en || spec.query_en)) {
    if (!process.env.PEXELS_API_KEY) why.push('펙셀스: 키 없음(launchers\\tools\\photo-key.ps1)');
    else try { const x = await searchPexels(spec); if (x) return { photo: x }; why.push('펙셀스: 맞는 사진 없음'); } catch (e) { why.push(`펙셀스: ${e.message}`); }
  }
  return { photo: null, why: why.join(' / ') || 'photo.query 나 photo.page 가 없음' };
}

/** 사진을 받아 PNG 로 저장 (브라우저 캔버스로 바꾼다 — 네이버·티스토리 올리기는 NN.png 를 찾는다) */
export async function savePhotoPng(photo, dest, launchBrowser) {
  // 내려받기가 중간에 끊겨도(2026-11-03 과천 글 'terminated') 바로 AI 그림으로 넘어가지 않고 4번까지 다시 받는다 (사용자 — "끊겨도 계속 실사 사진으로")
  let buf = photo.buf, lastErr; // 방송사 장면 사진(broadcast-still.mjs)은 이미 받아 온 buf 를 넘긴다
  for (let attempt = 1; attempt <= 4 && !buf; attempt++) {
    try {
      const r = await fetch(photo.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`사진 내려받기 HTTP ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (attempt < 4) { console.log(`  사진 받기 ${attempt}번째 실패 (${e.message}) — ${attempt * 5}초 뒤 다시`); await new Promise((ok) => setTimeout(ok, attempt * 5000)); }
    }
  }
  if (!buf) throw lastErr;
  const mime = /\.png(\?|$)/i.test(photo.url) ? 'image/png' : 'image/jpeg';
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const png = await page.evaluate(async ({ b64, mime }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${b64}`;
      await img.decode();
      // 2026-11-04 사용자 "사진이 흐릿해" — 예전엔 긴 쪽 1280 으로 줄여서 세로 인물 사진이 914px 로 줄었다가 대표사진 1024 로 다시 늘려졌다. 2400 까지 둔다
      if (Math.min(img.naturalWidth, img.naturalHeight) < 600) return { small: `${img.naturalWidth}×${img.naturalHeight}` };
      const max = 2400, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1];
    }, { b64: buf.toString('base64'), mime });
    if (typeof png === 'object' && png?.small) throw new Error(`사진이 너무 작아 흐려짐 (${png.small}) — 쓰지 않음`);
    fs.writeFileSync(dest, Buffer.from(png, 'base64'));
  } finally { await browser.close(); }
}
