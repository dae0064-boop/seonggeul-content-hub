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
export async function searchCommons({ query, query_en: queryEn, person, minWidth = 600 }) {
  const terms = [queryEn, query].filter(Boolean);
  for (const q of terms) {
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '25',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
    });
    const data = await getJson(url);
    const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    const scored = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || ii.width < minWidth) continue;
      const md = ii.extmetadata || {};
      const lic = strip(md.LicenseShortName?.value);
      if (!OK_LICENSE.test(lic) || BAD_LICENSE.test(lic) || String(md.NonFree?.value || '') === 'true') continue;
      const hay = `${p.title} ${strip(md.ImageDescription?.value)} ${strip(md.ObjectName?.value)}`.toLowerCase();
      const hit = words.filter((w) => hay.includes(w)).length;
      if (!hit) continue; // 이름이 제목·설명에 없는 사진은 다른 사람일 수 있다
      if (person && !soloOk(p.title.replace(/^File:/, ''), person)) continue; // 혼자 나온 그 사람 사진만
      scored.push({
        score: hit * 10 + Math.min(ii.width, 2000) / 1000 + (person ? (ii.height >= ii.width ? 1 : 0) : (ii.width >= ii.height ? 1 : 0)), // 인물은 세로(얼굴 위주) 사진을 먼저
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
    action: 'query', format: 'json', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
  });
  const data = await getJson(url);
  const p = Object.values(data?.query?.pages || {})[0];
  const ii = p?.imageinfo?.[0];
  if (!ii) return { skip: `파일 없음: ${title}` };
  const md = ii.extmetadata || {};
  const lic = strip(md.LicenseShortName?.value);
  if (!OK_LICENSE.test(lic) || BAD_LICENSE.test(lic) || String(md.NonFree?.value || '') === 'true') return { skip: `라이선스 안 맞음(${lic}): ${title}` };
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
  return { photo: null, why: why.join(' / ') || 'photo.query 나 photo.page 가 없음' };
}

/** 사진을 받아 PNG 로 저장 (브라우저 캔버스로 바꾼다 — 네이버·티스토리 올리기는 NN.png 를 찾는다) */
export async function savePhotoPng(photo, dest, launchBrowser) {
  // 내려받기가 중간에 끊겨도(2026-11-03 과천 글 'terminated') 바로 AI 그림으로 넘어가지 않고 4번까지 다시 받는다 (사용자 — "끊겨도 계속 실사 사진으로")
  let buf, lastErr;
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
      const max = 1280, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1];
    }, { b64: buf.toString('base64'), mime });
    fs.writeFileSync(dest, Buffer.from(png, 'base64'));
  } finally { await browser.close(); }
}
