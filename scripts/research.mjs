#!/usr/bin/env node
/**
 * SNS 자동화 - 리서치 수집기
 *
 *   node scripts/research.mjs --check          키가 제대로 들어갔는지만 확인
 *   node scripts/research.mjs "생활꿀팁"        해당 키워드로 자료 수집
 *
 * 수집한 원자료는 work/YYYY-MM-DD_리서치_키워드/raw/ 에 JSON으로 저장된다.
 * 그 다음 단계(주제 3개 · 제목 9개 뽑기)는 Claude가 이 JSON을 읽어서 한다.
 *
 * 외부 패키지를 쓰지 않는다. Node 18 이상이면 그냥 돌아간다.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- 설정 읽기

function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const has = (k) => Boolean(env[k] && env[k].trim());

// ---------------------------------------------------------------- 보조

const ok = (s) => `  ✅ ${s}`;
const no = (s) => `  ❌ ${s}`;
const warn = (s) => `  ⚠️  ${s}`;

async function getJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

const stripTags = (s) => String(s ?? "").replace(/<[^>]*>/g, "").trim();

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- 수집기들

const naverHeaders = () => ({
  "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
  "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
});

async function naverSearch(kind, query, display = 20) {
  const url =
    `https://openapi.naver.com/v1/search/${kind}.json` +
    `?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  const data = await getJson(url, { headers: naverHeaders() });
  return (data.items || []).map((it) => ({
    제목: stripTags(it.title),
    요약: stripTags(it.description),
    링크: it.link,
    날짜: it.pubDate || it.postdate || null,
    출처: it.bloggername || it.originallink || null,
  }));
}

async function naverTrend(keywords) {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 864e5);
  const body = {
    startDate: ymd(start),
    endDate: ymd(end),
    timeUnit: "date",
    keywordGroups: keywords.slice(0, 5).map((k) => ({
      groupName: k,
      keywords: [k],
    })),
  };
  const data = await getJson("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: { ...naverHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (data.results || []).map((r) => {
    const pts = r.data || [];
    const half = Math.floor(pts.length / 2) || 1;
    const avg = (arr) =>
      arr.length ? arr.reduce((s, p) => s + p.ratio, 0) / arr.length : 0;
    const before = avg(pts.slice(0, half));
    const after = avg(pts.slice(half));
    return {
      키워드: r.title,
      최근30일_추이: pts,
      상승률: before ? Number((((after - before) / before) * 100).toFixed(1)) : null,
    };
  });
}

async function youtubeTop(query, days = 30) {
  const after = new Date(Date.now() - days * 864e5).toISOString();
  const search = await getJson(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video" +
      `&q=${encodeURIComponent(query)}&order=viewCount&maxResults=15` +
      `&publishedAfter=${after}&regionCode=KR&relevanceLanguage=ko` +
      `&key=${env.YOUTUBE_API_KEY}`
  );
  const ids = (search.items || []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const stats = await getJson(
    "https://www.googleapis.com/youtube/v3/videos?part=statistics" +
      `&id=${ids.join(",")}&key=${env.YOUTUBE_API_KEY}`
  );
  const byId = Object.fromEntries(
    (stats.items || []).map((v) => [v.id, v.statistics])
  );
  return (search.items || []).map((i) => ({
    제목: stripTags(i.snippet.title),
    채널: i.snippet.channelTitle,
    게시일: i.snippet.publishedAt,
    조회수: Number(byId[i.id.videoId]?.viewCount ?? 0),
    좋아요: Number(byId[i.id.videoId]?.likeCount ?? 0),
    링크: `https://www.youtube.com/watch?v=${i.id.videoId}`,
  }));
}

async function instagramTop(hashtag, limit = 20) {
  const tag = hashtag.replace(/^#/, "").replace(/\s+/g, "");
  const items = await getJson(
    "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items" +
      `?token=${encodeURIComponent(env.APIFY_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        search: tag,
        searchType: "hashtag",
        resultsType: "posts",
        resultsLimit: limit,
        addParentData: false,
      }),
    }
  );
  return (Array.isArray(items) ? items : []).map((p) => ({
    본문: String(p.caption ?? "").slice(0, 300),
    해시태그: p.hashtags || [],
    좋아요: p.likesCount ?? null,
    댓글: p.commentsCount ?? null,
    게시일: p.timestamp ?? null,
    링크: p.url ?? null,
  }));
}

// ---------------------------------------------------------------- 점검 모드

async function check() {
  console.log("\n키가 제대로 들어갔는지 확인합니다...\n");
  const rows = [];

  // 네이버
  if (!has("NAVER_CLIENT_ID") || !has("NAVER_CLIENT_SECRET")) {
    rows.push(no("네이버 — 키가 비어 있습니다 (.env 파일 확인)"));
  } else {
    try {
      await naverSearch("news", "날씨", 1);
      rows.push(ok("네이버 검색 — 정상"));
    } catch (e) {
      rows.push(no(`네이버 검색 — ${e.message}`));
    }
    try {
      await naverTrend(["날씨"]);
      rows.push(ok("네이버 데이터랩 — 정상"));
    } catch (e) {
      rows.push(
        warn(`네이버 데이터랩 — ${e.message}\n       (등록할 때 '데이터랩' 체크를 안 하셨을 수 있습니다)`)
      );
    }
  }

  // 유튜브
  if (!has("YOUTUBE_API_KEY")) {
    rows.push(warn("유튜브 — 키가 비어 있습니다 (없어도 나머지는 돌아갑니다)"));
  } else {
    try {
      await youtubeTop("날씨", 7);
      rows.push(ok("유튜브 — 정상"));
    } catch (e) {
      rows.push(no(`유튜브 — ${e.message}`));
    }
  }

  // 에피파이
  if (!has("APIFY_TOKEN")) {
    rows.push(warn("에피파이/인스타 — 토큰이 비어 있습니다 (없어도 나머지는 돌아갑니다)"));
  } else {
    try {
      const me = await getJson(
        `https://api.apify.com/v2/users/me?token=${encodeURIComponent(env.APIFY_TOKEN)}`
      );
      rows.push(ok(`에피파이 — 정상 (계정: ${me?.data?.username ?? "확인됨"})`));
    } catch (e) {
      rows.push(no(`에피파이 — ${e.message}`));
    }
  }

  console.log(rows.join("\n"));
  const bad = rows.filter((r) => r.includes("❌")).length;
  console.log(
    bad === 0
      ? "\n다 됐습니다. 이제 리서치를 돌릴 수 있습니다.\n"
      : `\n❌ 가 ${bad}개 있습니다. 그 줄을 그대로 저(Claude)에게 보여주세요.\n`
  );
  return bad === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- 수집 모드

async function collect(keyword) {
  const day = ymd(new Date());
  const safe = keyword.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const outDir = join(ROOT, "work", `${day}_리서치_${safe}`, "raw");
  mkdirSync(outDir, { recursive: true });

  const save = (name, data) => {
    writeFileSync(join(outDir, name), JSON.stringify(data, null, 2), "utf8");
    return join("work", `${day}_리서치_${safe}`, "raw", name);
  };

  console.log(`\n"${keyword}" 자료를 모읍니다...\n`);
  const done = [];

  const step = async (label, file, fn, required) => {
    if (!required) {
      console.log(warn(`${label} — 키가 없어 건너뜁니다`));
      return;
    }
    try {
      const data = await fn();
      const p = save(file, data);
      console.log(ok(`${label} — ${data.length ?? Object.keys(data).length}건 → ${p}`));
      done.push(p);
    } catch (e) {
      console.log(no(`${label} — ${e.message}`));
    }
  };

  const naverReady = has("NAVER_CLIENT_ID") && has("NAVER_CLIENT_SECRET");
  await step("네이버 뉴스", "naver-news.json", () => naverSearch("news", keyword), naverReady);
  await step("네이버 블로그", "naver-blog.json", () => naverSearch("blog", keyword), naverReady);
  await step("네이버 검색어 추이", "naver-trend.json", () => naverTrend([keyword]), naverReady);
  await step("유튜브 인기영상", "youtube.json", () => youtubeTop(keyword), has("YOUTUBE_API_KEY"));
  await step("인스타 인기게시물", "instagram.json", () => instagramTop(keyword), has("APIFY_TOKEN"));

  save("_meta.json", { 키워드: keyword, 수집시각: new Date().toISOString(), 파일: done });

  console.log(
    done.length
      ? `\n끝났습니다. 이제 Claude에게 "리서치 정리해줘" 라고 하시면 됩니다.\n`
      : `\n수집된 게 없습니다. 위 메시지를 그대로 Claude에게 보여주세요.\n`
  );
  return done.length ? 0 : 1;
}

// ---------------------------------------------------------------- 진입점

const args = process.argv.slice(2);
const code = args.includes("--check") || args.length === 0
  ? await check()
  : await collect(args.join(" "));
process.exit(code);
