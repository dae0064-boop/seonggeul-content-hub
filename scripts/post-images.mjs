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
 * 대표사진 카드 틀: 1번에 "frame": "card" — 그림(1번)은 지금처럼 low 로 만들고, 남색 카드 틀에 넣어 합성한다.
 *   메인 키워드(노란 글씨)·분류 표시는 같은 슬러그의 원고(.md)에서 읽는다.
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { renderOverlays, renderCards, checkCard } from "./lib/overlay.mjs";
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
for (const d of ["posts", "tistory"]) {
  const md = join(ROOT, "content", d, `${plan.slug}.md`);
  if (existsSync(md)) { postMeta = parsePost(readFileSync(md, "utf8")); break; }
}
const overlayOf = (im) => im.overlay && (im.frame === "card"
  ? { ...im.overlay, frame: "card", key: im.overlay.key || postMeta?.mainKeyword || "", category: im.overlay.category || postMeta?.category || "생활정보" }
  : im.overlay);

// 정보 카드는 먼저 내용을 확인한다 (돈·통화기호, 줄 수, 글자 수)
for (const im of plan.images.filter((x) => x.kind === "card")) {
  const bad = checkCard(im.card);
  if (bad.length) { console.error(`❌ ${im.n}번 카드: ${bad.join(" / ")}`); process.exit(1); }
}
const only = opt.only ? new Set(opt.only.split(",").map(Number)) : null;
const todo = plan.images.filter((im) => !only || only.has(im.n));

console.log(`🖼  ${plan.slug} — ${todo.length}장`);
console.log(`   저장 위치: ${outDir}\n`);

let made = 0, skipped = 0, failed = [];
const overlayJobs = [];
const cardJobs = [];
for (const im of todo) {
  if (im.kind === "card") {
    const name = im.file ? im.file.replace(/\.png$/i, "") : String(im.n).padStart(2, "0");
    const target = join(outDir, `${name}.png`);
    if (existsSync(target) && !opt.force && !opt["overlay-only"]) { console.log(`⏭  ${name}.png 이미 있음 — ${im.title}`); skipped++; }
    else cardJobs.push({ n: im.n, dest: target, card: im.card });
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
  if (!(im.overlay && existsSync(raw) && !opt.force)) {
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
  console.log(`다시: node scripts/post-images.mjs ${positionals[0]} --only ${failed.join(",")}`);
  process.exit(1);
}
console.log(`✅ 완료 — ${outDir}`);
