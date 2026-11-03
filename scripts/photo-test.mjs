#!/usr/bin/env node
/**
 * 사진 찾기 시험 (2026-11-03 사용자 "확인해봐") — 키·사이트가 실제로 되는지 몇 가지 검색만 해 본다. 그림은 받지 않는다(비용 0).
 *   node scripts/photo-test.mjs
 */
import { findPhoto, searchOpenverse, searchPixabay, searchFlickr } from './lib/official-photo.mjs';
const mask = (k) => (k ? `${k.slice(0, 3)}...${k.slice(-4)}` : '없음');
console.log(`키: 픽사베이 ${mask(process.env.PIXABAY_API_KEY)} · 플리커 ${mask(process.env.FLICKR_API_KEY)} · 펙셀스 ${mask(process.env.PEXELS_API_KEY)}`);
const cases = [
  ['인물(최불암)', { person: ['Choi Bool-am', 'Choi Bul-am', '최불암'], query: '최불암', query_en: 'Choi Bool-am' }],
  ['인물(소연)', { person: ['Soyeon', 'So-yeon', 'Park So-yeon', '소연'], query: '소연', query_en: 'Park So-yeon' }],
  ['인물(이미숙)', { person: ['Lee Mi-sook', '이미숙'], query: '이미숙', query_en: 'Lee Mi-sook' }],
  ['장면(아파트)', { scene_en: 'Korean high-rise apartment complex', query_en: 'apartment complex' }],
];
for (const [name, spec] of cases) {
  const t = Date.now();
  try {
    const { photo, why } = await findPhoto(spec);
    console.log(`${photo ? '✅' : '⚠'} ${name}: ${photo ? `${photo.credit} — ${photo.page || photo.url}` : `없음 (${why})`} [${Math.round((Date.now() - t) / 1000)}초]`);
  } catch (e) { console.log(`❌ ${name}: ${e.message}`); }
}
// 오픈버스 단계별 (2026-11-03 사용자 — "오픈버스가 되는지 확인을 해봐야지") — 토큰 받기 / 검색을 따로, 서버 답 앞부분까지
{
  const id = process.env.OPENVERSE_CLIENT_ID, secret = process.env.OPENVERSE_CLIENT_SECRET;
  console.log(`오픈버스 키: ${id ? mask(id) : '없음'}`);
  if (id && secret) {
    try {
      const r = await fetch('https://api.openverse.org/v1/auth_tokens/token/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }), signal: AbortSignal.timeout(60000) });
      const t = await r.text(); console.log(`  오픈버스 토큰: HTTP ${r.status} ${r.ok ? '성공' : t.slice(0, 200)}`);
      if (r.ok) {
        const tok = JSON.parse(t).access_token;
        const q = await fetch('https://api.openverse.org/v1/images/?q=Seoul&license_type=commercial&page_size=3', { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(60000) });
        const b = await q.text(); console.log(`  오픈버스 검색: HTTP ${q.status} ${q.ok ? `성공 (${JSON.parse(b).result_count}장)` : b.slice(0, 200)}`);
      }
    } catch (e) { console.log(`  오픈버스: 연결 실패 — ${e.message}`); }
  }
}
// 곳마다 따로 (어디가 막혔는지)
for (const [name, fn] of [['오픈버스', () => searchOpenverse({ query_en: 'Seoul' })], ['픽사베이', () => searchPixabay({ scene_en: 'Seoul apartment' })], ['플리커', () => searchFlickr({ query_en: 'Seoul' })]]) {
  try { const r = await fn(); console.log(`  ${name}: ${r ? '연결·검색 됨' : '결과 없음 또는 키 없음'}`); } catch (e) { console.log(`  ${name}: 실패 — ${e.message}`); }
}
