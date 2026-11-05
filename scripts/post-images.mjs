#!/usr/bin/env node
/**
 * 원고 한 편의 이미지를 계획서대로 전부 만든다. 실제 생성은 image-gen.mjs 가 한다.
 *
 *   node scripts/post-images.mjs content/image-plans/2026-10-01-dokgam-75.json
 *   node scripts/post-images.mjs <계획서> --only 3      3번만 다시
 *   node scripts/post-images.mjs <계획서> --force      이미 있는 것도 다시
 *
 * 계획서: content/image-plans/<슬러그>.json
 *   { slug, images: [{ n, file: "01.png", title, note, prompt }] }
 * 프롬프트는 계획서에 적힌 문장을 그대로 보낸다(클레이 3D 스타일 문장 포함).
 *
 * 결과: content/images/<슬러그>/01.png, 02.png ...
 * 이 폴더를 publish-naver.mjs --images 에 그대로 넘기면 [이미지 N] 자리에 들어간다.
 * 이미 만든 파일은 건너뛴다. 돈이 두 번 나가지 않게 하기 위해서다.
 *
 * 글씨: 계획서에 overlay 가 있으면 그림은 NN.raw.png 로 받고, 글씨를 얹은 결과를 NN.png 로 둔다.
 *   --overlay-only  그림은 다시 만들지 않고 글씨만 다시 얹는다 (돈 안 듦. 문구를 고쳤을 때)
 *
 * 정보 카드 (2026-10-12 원고부터): kind: "card" 인 그림은 OpenAI 를 부르지 않고 글자 카드를 로컬로 그린다 (비용 0).
 *   { n: 4, file: "04.png", title: "...", kind: "card", card: { type: "steps", title: "...", items: [...] } }
 * 공식 사진 (2026-11-02, 이슈 글): kind: "photo" — 위키미디어 공용·정책브리핑에서 라이선스가 맞는 사진을 받아 NN.png + NN.credit.txt.
 *   못 찾으면 그 항목의 prompt 로 AI 그림을 대신 만든다 (credit 파일 없음 → 발행 때 [사진 출처 N] 줄이 빠진다). scripts/lib/official-photo.mjs
 * 대표사진 카드 틀: 1번에 "frame": "card" — 그림(1번)은 지금처럼 low 로 만들고, 남색 카드 틀에 넣어 합성한다.
 *   메인 키워드(노란 글씨)·분류 표시는 같은 슬러그의 원고(.md)에서 읽는다.
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { renderOverlays, renderCards, checkCard, launch as launchBrowser } from "./lib/overlay.mjs";

/** 진한 남색 그라데이션 1024×1024 PNG (인물 사진을 못 찾은 대표사진 바탕) */
async function plainBackground(dest, launch) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const b64 = await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1024; c.height = 1024;
      const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 1024);
      gr.addColorStop(0, "#1f2a44"); gr.addColorStop(1, "#0d1424"); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
      return c.toDataURL("image/png").split(",")[1];
    });
    writeFileSync(dest, Buffer.from(b64, "base64"));
  } finally { await browser.close(); }
}
import { findPhoto, savePhotoPng } from "./lib/official-photo.mjs";
import { fetchStill } from "./lib/broadcast-still.mjs";
import { writeFileSync, rmSync } from "node:fs";
import { parsePost } from "./lib/parse-post.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
    force: { type: "boolean" },
    "overlay-only": { type: "boolean" },
    size: { type: "string", default: "1024x1024" },
    help: { type: "boolean", short: "h" },
  },
});

if (opt.help || !positionals.length) {
  console.log("사용법: node scripts/post-images.mjs content/image-plans/<슬러그>.json [--only 3] [--force]");
  process.exit(opt.help ? 0 : 1);
}

const plan = JSON.parse(readFileSync(positionals[0], "utf8"));
if (!plan.slug || !Array.isArray(plan.images)) {
  console.error("❌ 계획서에 slug 와 images 가 필요해요");
  process.exit(1);
}

// 그림 품질은 low 하나만 쓴다 (2026-10-08 사용자 지시 — "나는 낮은 품질만 요청했어").
// 계획서에 quality 가 적혀 있어도 따르지 않는다 (10/6~10/8 대표사진이 medium 으로 만들어져 비용이 2배가 됐다).
const QUALITY_IGNORED = plan.images.filter((im) => im.quality && im.quality !== "low").map((im) => im.n);
if (QUALITY_IGNORED.length) console.log(`ℹ  계획서의 quality 는 무시하고 low 로 만들어요 (${QUALITY_IGNORED.join(", ")}번)`);

const outDir = join(ROOT, "content", "images", plan.slug);

// 카드 틀 대표사진에 넣을 메인 키워드·분류 — 같은 슬러그 원고에서 읽는다
let postMeta = null;
for (const d of ["posts", "tistory", "chulgeo/posts"]) {
  const md = join(ROOT, "content", d, `${plan.slug}.md`);
  if (existsSync(md)) { postMeta = parsePost(readFileSync(md, "utf8")); break; }
}
// 그림 속 블로그 이름: 계획서 brand (철거 블로그 = "다와이철거", 2026-10-26). 없으면 성글벙글
const overlayOf = (im) => im.overlay && (im.frame === "card"
  ? { ...im.overlay, frame: "card", brand: plan.brand, key: im.overlay.key || postMeta?.mainKeyword || "", category: im.overlay.category || postMeta?.category || "생활정보" }
  : im.overlay);

// 카드 색 (2026-11-04 사용자 — 블로그 카테고리마다 따로): 이슈 연예 → 연예방송, 이슈 정책 → 이슈뉴스,
// 맛집·나들이(맛집 글·주제 국내여행·나들이 '언제' 글) → 맛집나들이, 나머지는 원고 category (생활정보·생활보장)
// 2026-11-04 사용자 "보라색 말고 성글벙글이랑 어울리게" — 카드는 모두 성글벙글 색(overlay.mjs 기본). 카테고리 색은 계획서 card.theme 로 적을 때만
function cardThemeOf(m) {
  return "";
  if (!m) return "";
  if (m.issue === "연예") return "연예방송";
  if (m.issue === "정책") return "이슈뉴스";
  if (/맛집|나들이/.test(m.category || "") || m.topic === "국내여행") return "맛집나들이";
  return String(m.category || "").replace(/[·\s]/g, "");
}
// 정보 카드는 먼저 내용을 확인한다 (돈·통화기호, 줄 수, 글자 수)
for (const im of plan.images.filter((x) => x.kind === "card")) {
  const bad = checkCard(im.card);
  if (bad.length) { console.error(`❌ ${im.n}번 카드: ${bad.join(" / ")}`); process.exit(1); }
}
const only = opt.only ? new Set(opt.only.split(",").map(Number)) : null;
const todo = plan.images.filter((im) => !only || only.has(im.n));

console.log(`🖼  ${plan.slug} — ${todo.length}장`);
console.log(`   저장 위치: ${outDir}\n`);
mkdirSync(outDir, { recursive: true }); // 공식 사진은 AI 그림보다 먼저 저장된다 — 폴더가 없으면 실패했다 (11/2 신세경 글)

let made = 0, skipped = 0, failed = [];
let noCredit = false; // OpenAI 크레딧이 바닥나면(image-gen 종료 코드 3) 남은 그림은 부르지 않는다
const overlayJobs = [];
const cardJobs = [];
for (const im of todo) {
  if (im.kind === "card") {
    const name = im.file ? im.file.replace(/\.png$/i, "") : String(im.n).padStart(2, "0");
    const target = join(outDir, `${name}.png`);
    if (existsSync(target) && !opt.force && !opt["overlay-only"]) { console.log(`⏭  ${name}.png 이미 있음 — ${im.title}`); skipped++; }
    else cardJobs.push({ n: im.n, dest: target, card: { ...im.card, brand: plan.brand, theme: im.card.theme || cardThemeOf(postMeta), category: im.card.category || postMeta?.category } });
    continue;
  }
  const name = im.file ? im.file.replace(/\.png$/i, "") : String(im.n).padStart(2, "0");
  const target = join(outDir, `${name}.png`);
  const raw = im.overlay ? join(outDir, `${name}.raw.png`) : target;

  if (opt["overlay-only"]) {
    if (im.overlay && existsSync(raw)) overlayJobs.push({ n: im.n, src: raw, dest: target, overlay: overlayOf(im) });
    continue;
  }
  if (existsSync(target) && !opt.force) {
    console.log(`⏭  ${name}.png 이미 있음 — ${im.title}`);
    skipped++;
    continue;
  }
  // 공식 사진 — 받으면 AI 를 부르지 않는다 (비용 0)
  const creditFile = join(outDir, `${name}.credit.txt`);
  if (im.kind === "photo" && !(im.overlay && existsSync(raw) && !opt.force)) {
    // 방송사 공식 홈페이지 장면 사진 (2026-11-03 사용자 — 드라마 사진 인용, 본문 1~2장만) — 못 받으면 아래 다른 곳·AI 그림으로
    let st = null;
    if (im.photo?.still) {
      st = await fetchStill(im.photo.still, launchBrowser, `${plan.slug}-${im.n}`).catch((e) => ({ photo: null, why: e.message }));
      if (!st.photo) console.log(`⚠ [${im.n}] 방송사 장면 사진 못 받음 (${st.why})`);
    }
    const { photo, why } = st?.photo ? st : (im.photo?.still && !(im.photo.file || im.photo.query || im.photo.query_en || im.photo.scene_en || im.photo.page))
      ? { photo: null, why: st?.why || '장면 사진 없음' }
      : await findPhoto(im.photo || {}).catch((e) => ({ photo: null, why: e.message }));
    let got = false;
    if (photo) {
      try { await savePhotoPng(photo, raw, launchBrowser); writeFileSync(creditFile, photo.credit + "\n" + (photo.page || "") + "\n"); got = true; console.log(`📷 [${im.n}] 공식 사진: ${photo.credit} — ${photo.page || photo.url}`); }
      catch (e) { console.log(`⚠ [${im.n}] 사진 받기 실패: ${e.message}`); }
    } else console.log(`⚠ [${im.n}] 쓸 수 있는 공식 사진 없음 (${why}) — AI 그림으로 대신합니다`);
    if (got) { made++; if (im.overlay) overlayJobs.push({ n: im.n, src: raw, dest: target, overlay: overlayOf(im), scale: 1.5 }); continue; }
    // 인물 대표사진을 못 찾으면 엉뚱한 사진·AI 그림 대신 깔끔한 단색 바탕 + 제목 글씨 (2026-11-03 사용자 — 최불암 별세 글에 현충일 행사 사진이 걸렸다)
    if (im.photo?.person && im.overlay) {
      try { await plainBackground(raw, launchBrowser); made++; overlayJobs.push({ n: im.n, src: raw, dest: target, overlay: overlayOf(im) }); console.log(`🟦 [${im.n}] 그 사람 혼자 나온 공식 사진이 없어 단색 바탕 + 제목으로 만듭니다`); continue; }
      catch (e) { console.log(`⚠ [${im.n}] 단색 바탕 실패: ${e.message}`); }
    }
    try { rmSync(creditFile, { force: true }); } catch { /* 없음 */ }
    if (!im.prompt) { failed.push(im.n); continue; }
  }
  if (!(im.overlay && existsSync(raw) && !opt.force)) {
    if (noCredit) { failed.push(im.n); continue; }
    console.log(`\n[${im.n}/${plan.images.length}] ${im.title}`);
    // 그림 API 는 1분에 5장까지다 (2026-10-03 HTTP 429 로 한 글에 7장까지 빠짐). 실패하면 기다렸다 다시 한다
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      if (attempt) {
        const wait = 20 * attempt;
        console.log(`   ⏳ ${wait}초 기다렸다 다시 해 봅니다 (${attempt + 1}/4)`);
        await new Promise((res) => setTimeout(res, wait * 1000));
      }
      const r = spawnSync(process.execPath, [
        join(ROOT, "scripts", "image-gen.mjs"),
        im.prompt,
        "--raw",
        "--out", outDir,
        "--name", im.overlay ? `${name}.raw` : name,
        "--quality", "low",
        "--size", opt.size,
      ], { stdio: "inherit" });
      ok = r.status === 0 && existsSync(raw);
      if (r.status === 3) { noCredit = true; break; } // 크레딧 없음 — 다시 해도 안 된다
    }
    if (!ok) { failed.push(im.n); continue; }
    made++;
  }
  if (im.overlay) overlayJobs.push({ n: im.n, src: raw, dest: target, overlay: overlayOf(im) });
}

if (cardJobs.length) {
  console.log(`\n🗂  정보 카드 그리는 중 (${cardJobs.length}장, 비용 없음)...`);
  try {
    mkdirSync(outDir, { recursive: true });
    await renderCards(cardJobs);
    cardJobs.forEach((j) => { console.log(`✅ ${j.dest}`); made++; });
  } catch (e) {
    console.log(`❌ 카드 그리기 실패: ${e.message}`);
    cardJobs.forEach((j) => failed.push(j.n));
  }
}

if (overlayJobs.length) {
  console.log(`\n✍  글씨 얹는 중 (${overlayJobs.length}장)...`);
  try {
    await renderOverlays(overlayJobs);
    overlayJobs.forEach((j) => console.log(`✅ ${j.dest}`));
  } catch (e) {
    console.log(`❌ 글씨 얹기 실패: ${e.message}`);
    overlayJobs.forEach((j) => failed.push(j.n));
  }
}

console.log("\n" + "─".repeat(50));
console.log(`새로 만듦 ${made}장 / 건너뜀 ${skipped}장 / 실패 ${failed.length}장`);
if (failed.length) {
  console.log(`실패한 번호: ${failed.join(", ")}`);
  if (noCredit) console.log("❌ OpenAI 크레딧 없음 — platform.openai.com 에서 충전해야 그림을 만들 수 있어요");
  console.log(`다시: node scripts/post-images.mjs ${positionals[0]} --only ${failed.join(",")}`);
  process.exit(1);
}
console.log(`✅ 완료 — ${outDir}`);
// 2026-11-05: 11/4 아침 '✅ 완료' 뒤 48분 동안 프로그램이 끝나지 않아 이슈 글 예약이 밀렸다 (무언가 연결이 남아 있었다) — 다 했으면 바로 끝낸다
process.exit(0);
