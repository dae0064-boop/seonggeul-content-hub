#!/usr/bin/env node
/**
 * 이슈 글감을 고르기 전에 "고화질 사진이 있는가"를 먼저 본다 (2026-11-04 사용자 — "사진이 없으면 우선순위에서 떨어트려, 사진이 제일 중요해").
 * 클라우드에서 돈다(위키미디어 공용은 열려 있다). 유튜브는 클라우드에서 막혀 있어 WebSearch 로 공식 클립이 있는지 따로 본다.
 *
 *   node scripts/photo-check.mjs "Son Ye-jin" "손예진"          ← 인물: 혼자 나온, 짧은 쪽 1000px 이상 사진
 *   node scripts/photo-check.mjs --scene "somaek" "소맥"         ← 사물·장소: 800px 이상
 *
 * 결과: 쓸 수 있는 파일 이름(계획서 photo.file 에 그대로)·크기·라이선스. 하나도 없으면 종료 코드 1 → 그 글감은 뒤로.
 */
import { searchCommons } from './lib/official-photo.mjs';

const argv = process.argv.slice(2);
const scene = argv.includes('--scene');
const words = argv.filter((a) => a !== '--scene');
if (!words.length) { console.log('사용법: node scripts/photo-check.mjs [--scene] "<영어 이름>" "<한글 이름>"'); process.exit(2); }
const [en, ko] = [words[0], words[1] || words[0]];
const spec = scene ? { query: ko, query_en: en } : { query: ko, query_en: en, person: [en, ko] };
try {
  const r = await searchCommons(spec);
  if (!r) { console.log(`❌ ${ko}: 고화질 ${scene ? '사진' : '단독 인물 사진'} 없음 — 공식 유튜브 클립(WebSearch)도 없으면 이 글감은 뒤로 미룬다`); process.exit(1); }
  console.log(`✅ ${ko}: File:${r.title} (${r.license}) — ${r.page}`);
  console.log(`   계획서: "photo": {"file": "File:${r.title}", "query": "${ko}", "query_en": "${en}"${scene ? '' : `, "person": ["${en}", "${ko}"]`}}`);
} catch (e) { console.log(`⚠ 위키미디어 확인 실패: ${e.message}`); process.exit(3); }
