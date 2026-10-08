#!/usr/bin/env node
/**
 * 아침 실행 기록(.log)에서 그림 비용을 센다. 아침 확인 Routine 이 쓴다 (2026-10-08 사용자: "최대한 지출을 줄이면서").
 *
 *   node scripts/image-cost.mjs day-2026-10-09.log day-2026-10-09-tistory.log
 *
 * image-gen.mjs 가 남기는 두 줄을 읽는다:
 *   🎨 gpt-image-2 / low / 1024x1024 × 1
 *      토큰: 입력 235 / 출력 196
 * 단가 (gpt-image-2): 글 입력 $5 / 100만 토큰, 그림 출력 $30 / 100만 토큰. 원화는 --krw (기본 1500).
 * low 가 아닌 그림이 하나라도 있으면 종료 코드 1 — 그림은 전부 low 만 쓴다 (2026-10-08 사용자 지시).
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const krwAt = args.indexOf("--krw");
const KRW = krwAt >= 0 ? Number(args.splice(krwAt, 2)[1]) : 1500;
if (!args.length) { console.log("사용법: node scripts/image-cost.mjs <로그 파일>... [--krw 1500]"); process.exit(1); }

const byQuality = {};
let inTok = 0, outTok = 0, count = 0;
for (const f of args) {
  let q = null;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/🎨\s*\S+\s*\/\s*(\w+)\s*\//);
    if (m) { q = m[1]; byQuality[q] = (byQuality[q] || 0) + 1; count++; continue; }
    const t = line.match(/토큰:\s*입력\s*(\d+)\s*\/\s*출력\s*(\d+)/);
    if (t && q) { inTok += +t[1]; outTok += +t[2]; q = null; }
  }
}
const usd = inTok * 5e-6 + outTok * 30e-6;
console.log(`그림 ${count}장 — ${Object.entries(byQuality).map(([k, v]) => `${k} ${v}`).join(", ") || "없음"}`);
console.log(`토큰: 입력 ${inTok} / 출력 ${outTok}`);
console.log(`비용: $${usd.toFixed(3)} (약 ${Math.round(usd * KRW).toLocaleString("ko-KR")}원, 1달러 ${KRW}원)`);
const bad = Object.keys(byQuality).filter((k) => k !== "low");
if (bad.length) { console.log(`❌ low 가 아닌 그림이 있어요: ${bad.join(", ")} — scripts/post-images.mjs 를 확인하세요`); process.exit(1); }
console.log("✅ 모두 low");
