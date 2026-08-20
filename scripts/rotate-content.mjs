#!/usr/bin/env node
/**
 * 오늘자 콘텐츠 교체 전 실행한다.
 *   1) content-data.js  ->  archive/content-data-<기존날짜>.js 로 복사
 *   2) content-history.json 에 기존 날짜의 경량 이력 추가
 *
 * 과거 원고 본문은 이력에 넣지 않는다. 주제·제목·키워드만 남긴다.
 * 사용: node scripts/rotate-content.mjs
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = resolve(root, "content-hub-site");
const DATA = resolve(SITE, "content-data.js");
const HISTORY = resolve(SITE, "content-history.json");
const ARCHIVE = resolve(SITE, "archive");

if (!existsSync(DATA)) {
  console.log("[rotate] content-data.js 없음. 첫 실행으로 보고 건너뛴다.");
  process.exit(0);
}

const data = require(DATA);
const date = data.date;
if (!date) {
  console.error("[rotate] 실패: content-data.js 에 date 가 없다.");
  process.exit(1);
}

// 1) 보관
mkdirSync(ARCHIVE, { recursive: true });
const archivePath = resolve(ARCHIVE, `content-data-${date}.js`);
copyFileSync(DATA, archivePath);
console.log(`[rotate] 보관 완료 -> archive/content-data-${date}.js`);

// 2) 경량 이력 추가
const history = existsSync(HISTORY)
  ? JSON.parse(readFileSync(HISTORY, "utf8"))
  : { updatedAt: null, entries: [] };

if (history.entries.some((e) => e.date === date && e.topic === data.topic)) {
  console.log(`[rotate] 이력에 ${date} 이미 존재. 중복 추가하지 않는다.`);
} else {
  history.entries.push({
    date,
    topic: data.topic,
    keywords: data.keywords ?? [],
    searchIntent: data.searchIntent ?? "",
    titles: {
      naver: (data.naver ?? []).map((p) => p.title),
      tistory: (data.tistory ?? []).map((p) => p.title)
    },
    counts: {
      naver: (data.naver ?? []).length,
      tistory: (data.tistory ?? []).length,
      cardnews: (data.cardnews ?? []).length
    },
    status: "완료",
    archive: `archive/content-data-${date}.js`
  });
  history.entries.sort((a, b) => a.date.localeCompare(b.date));
  history.updatedAt = new Date().toISOString();
  writeFileSync(HISTORY, JSON.stringify(history, null, 2) + "\n");
  console.log(`[rotate] 이력 추가 완료 -> ${date} / ${data.topic}`);
}

const bytes = readFileSync(HISTORY, "utf8").length;
console.log(`[rotate] 현재 이력 크기: ${bytes.toLocaleString()}자 (본문 미포함)`);
