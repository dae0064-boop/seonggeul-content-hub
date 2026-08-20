#!/usr/bin/env node
/**
 * 문법·분량·구성·중복을 한 번에 검사한다.
 * 실패가 하나라도 있으면 exit 1 -> 배포하지 않는다.
 * 사용: node scripts/validate-content.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = resolve(root, "content-hub-site");

const pass = [];
const fail = [];
const ok = (m) => pass.push(m);
const no = (m) => fail.push(m);

// ---------- 1. 자바스크립트 문법 ----------
let data, rules;
try {
  rules = require(resolve(SITE, "format-rules.js"));
  ok("format-rules.js 문법 정상");
} catch (e) {
  no(`format-rules.js 문법 오류: ${e.message}`);
  report();
}
try {
  data = require(resolve(SITE, "content-data.js"));
  ok("content-data.js 문법 정상");
} catch (e) {
  no(`content-data.js 문법 오류: ${e.message}`);
  report();
}

const chars = (s) => String(s ?? "").replace(/\r\n/g, "\n").length;

// ---------- 2. 기본 메타 ----------
if (/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "")) ok(`날짜 형식 정상 (${data.date})`);
else no(`date 형식 오류: ${data.date}`);
if (data.topic) ok(`주제 존재: ${data.topic}`);
else no("topic 없음");

// ---------- 3. MASTER FACT ----------
const mf = data.masterFact;
if (!mf) no("MASTER FACT 없음");
else {
  if (Array.isArray(mf.facts) && mf.facts.length > 0) ok(`MASTER FACT 항목 ${mf.facts.length}개`);
  else no("MASTER FACT facts 비어 있음");
  if (Array.isArray(mf.sources) && mf.sources.length >= 1) ok(`MASTER FACT 출처 ${mf.sources.length}개`);
  else no("MASTER FACT 출처 0개");
  if (mf.sources && mf.sources.length > rules.budget.maxSources)
    no(`출처 ${mf.sources.length}개 — 절약 기준 ${rules.budget.maxSources}개 초과`);
}

// ---------- 4. 플랫폼별 편수 · 분량 · 이미지 기획 ----------
function checkPosts(key, cfg) {
  const posts = data[key] ?? [];
  if (posts.length === cfg.postsPerDay) ok(`${cfg.label} ${posts.length}편`);
  else no(`${cfg.label} 편수 오류: ${posts.length}편 (기준 ${cfg.postsPerDay}편)`);

  posts.forEach((p, i) => {
    const n = `${cfg.label} ${i + 1}편`;
    const len = chars(p.body);
    if (len >= cfg.bodyChars.min && len <= cfg.bodyChars.max)
      ok(`${n} 본문 ${len.toLocaleString()}자`);
    else
      no(`${n} 본문 분량 오류: ${len.toLocaleString()}자 (기준 ${cfg.bodyChars.min.toLocaleString()}~${cfg.bodyChars.max.toLocaleString()}자)`);

    const plans = p.imagePlan ?? [];
    if (plans.length === cfg.imagePlansPerPost) ok(`${n} 이미지 기획 ${plans.length}개`);
    else no(`${n} 이미지 기획 오류: ${plans.length}개 (기준 ${cfg.imagePlansPerPost}개)`);

    if (!p.title) no(`${n} 제목 없음`);

    if (cfg.greeting) {
      if (String(p.body).includes(cfg.greeting)) ok(`${n} 지정 인사말 포함`);
      else no(`${n} 지정 인사말 누락: "${cfg.greeting}"`);
    }
    for (const rule of cfg.requiredEmoji ?? []) {
      const count = [...String(p.body)].filter((c) => c === rule.char).length;
      if (count === rule.exactCount) ok(`${n} ${rule.char} ${count}회`);
      else no(`${n} ${rule.char} 사용 오류: ${count}회 (기준 ${rule.exactCount}회)`);
    }
    if (cfg.requiresMetaDescription && !p.metaDescription) no(`${n} 메타 설명 없음`);
  });
  return posts;
}

const naver = checkPosts("naver", rules.naver);
const tistory = checkPosts("tistory", rules.tistory);

// ---------- 5. 카드뉴스 ----------
const sets = data.cardnews ?? [];
if (sets.length === rules.cardnews.setsPerDay) ok(`카드뉴스 ${sets.length}세트`);
else no(`카드뉴스 세트 오류: ${sets.length}세트 (기준 ${rules.cardnews.setsPerDay}세트)`);
sets.forEach((s, i) => {
  const n = (s.slides ?? []).length;
  if (n === rules.cardnews.slidesPerSet) ok(`카드뉴스 ${i + 1}세트 ${n}장`);
  else no(`카드뉴스 ${i + 1}세트 장수 오류: ${n}장 (기준 ${rules.cardnews.slidesPerSet}장)`);
});

// ---------- 6. 제목 중복 ----------
const todayTitles = [...naver, ...tistory].map((p) => p.title);
const dupToday = todayTitles.filter((t, i) => todayTitles.indexOf(t) !== i);
if (dupToday.length === 0) ok("오늘 원고 내부 제목 중복 없음");
else no(`오늘 원고 제목 중복: ${[...new Set(dupToday)].join(" / ")}`);

const HISTORY = resolve(SITE, "content-history.json");
if (existsSync(HISTORY)) {
  const history = JSON.parse(readFileSync(HISTORY, "utf8"));
  const past = new Set();
  for (const e of history.entries ?? []) {
    if (e.date === data.date) continue;
    for (const t of [...(e.titles?.naver ?? []), ...(e.titles?.tistory ?? [])]) past.add(t);
  }
  const clash = todayTitles.filter((t) => past.has(t));
  if (clash.length === 0) ok(`과거 이력 대조 완료 (누적 ${past.size}건)`);
  else no(`과거 제목과 중복: ${clash.join(" / ")}`);

  const pastTopics = (history.entries ?? []).filter((e) => e.date !== data.date).map((e) => e.topic);
  if (pastTopics.includes(data.topic)) no(`과거 주제와 중복: ${data.topic}`);
  else ok("과거 주제와 중복 없음");

  const bytes = readFileSync(HISTORY, "utf8").length;
  if (bytes > 60000) no(`이력 파일 과대: ${bytes.toLocaleString()}자 — 경량 유지 필요`);
  else ok(`이력 파일 경량 유지: ${bytes.toLocaleString()}자`);
} else {
  no("content-history.json 없음");
}

// ---------- 7. 플랫폼 간 문장 복사 ----------
const sentencesOf = (t) =>
  String(t).split(/[.!?\n]/).map((s) => s.trim()).filter((s) => s.length >= 25);
const naverSet = new Set(naver.flatMap((p) => sentencesOf(p.body)));
const copied = tistory.flatMap((p) => sentencesOf(p.body)).filter((s) => naverSet.has(s));
if (copied.length === 0) ok("플랫폼 간 문장 복사 없음");
else no(`플랫폼 간 문장 복사 ${copied.length}건: "${copied[0].slice(0, 40)}..."`);

report();

function report() {
  console.log("\n════════ 검수 결과 ════════");
  for (const m of pass) console.log(`  ✅ ${m}`);
  if (fail.length) {
    console.log("");
    for (const m of fail) console.log(`  ❌ ${m}`);
  }
  console.log("───────────────────────────");
  console.log(`  통과 ${pass.length} / 실패 ${fail.length}`);
  console.log(fail.length ? "  결과: 배포 중단\n" : "  결과: 배포 가능\n");
  process.exit(fail.length ? 1 : 0);
}
