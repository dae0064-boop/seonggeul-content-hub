#!/usr/bin/env node
/**
 * 그날의 원고 폴더를 읽어 '오늘의 원고' 페이지(HTML)를 만든다.
 *
 *   node scripts/brief-render.mjs work/2026-08-21_원고 [출력.html]
 *
 * 폴더 안의 마크다운을 파일 이름 순으로 이어 붙인다.
 * README.md 는 맨 앞 표지 뒤에 놓이고, 나머지는 원고 카드로 렌더링된다.
 *
 * 마크다운 문법은 이 프로젝트에서 쓰는 만큼만 지원한다.
 * 문단 안의 줄바꿈은 <br> 로 살린다 — 네이버 원고의 20자 줄바꿈이 화면에서
 * 그대로 보여야 하기 때문이다.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    // 문단 안의 줄바꿈은 <br> 로 유지한다
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { flushPara(); i++; continue; }

    // 제목
    let m = t.match(/^(#{1,4})\s+(.*)$/);
    if (m) {
      flushPara();
      const level = m[1].length;
      if (level === 1) out.push(`<h3 class="doc-title">${inline(m[2])}</h3>`);
      else if (level === 2) out.push(`<h4>${inline(m[2])}</h4>`);
      else out.push(`<h5>${inline(m[2])}</h5>`);
      i++; continue;
    }

    // 인용 = 메모 상자
    if (t.startsWith(">")) {
      flushPara();
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<div class="callout">${buf.map(inline).join("<br>")}</div>`);
      continue;
    }

    // 표
    if (t.startsWith("|")) {
      flushPara();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim());
        i++;
      }
      const cells = (r) =>
        r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        `<div class="scroller"><table><thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`
      );
      continue;
    }

    // 목록
    const bullet = /^[-*]\s+(.*)$/;
    const numbered = /^\d+\.\s+(.*)$/;
    if (bullet.test(t) || numbered.test(t)) {
      flushPara();
      const ordered = numbered.test(t);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && re.test(lines[i].trim())) {
        let item = lines[i].trim().match(re)[1];
        const box = item.match(/^\[([ xX])\]\s+(.*)$/);
        item = box
          ? `<span class="box">${box[1].trim() ? "☑" : "☐"}</span> ${box[2]}`
          : inline(item);
        items.push(`<li>${box ? item : item}</li>`);
        i++;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    para.push(t);
    i++;
  }
  flushPara();
  return out.join("\n");
}

// ---------------------------------------------------------------- 채널 판별

function channelOf(name) {
  if (name.startsWith("네이버")) return "n";
  if (name.startsWith("티스토리")) return "t";
  return "x";
}

function labelOf(name) {
  const c = channelOf(name);
  if (c === "n") return "네이버";
  if (c === "t") return "티스토리";
  return "부록";
}

// ---------------------------------------------------------------- 조립

const dir = process.argv[2];
if (!dir) {
  console.error("사용법: node scripts/brief-render.mjs work/YYYY-MM-DD_원고 [출력.html]");
  process.exit(2);
}
const outPath = process.argv[3] || join(dir, "브리핑.html");

const day = (basename(dir).match(/^(\d{4}-\d{2}-\d{2})/) || [, ""])[1];
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".md"))
  .sort();

const readmeFile = files.find((f) => f === "README.md");
const rest = files.filter((f) => f !== "README.md");
// 원고는 채널 이름으로 시작한다. 나머지(이미지·카드뉴스 등)는 부록으로 뺀다.
const drafts = rest.filter((f) => channelOf(f) !== "x");
const extras = rest.filter((f) => channelOf(f) === "x");

const intro = readmeFile
  ? renderMarkdown(
      readFileSync(join(dir, readmeFile), "utf8")
        .split(/\r?\n/)
        .slice(1) // 첫 제목 줄은 표지가 대신한다
        .join("\n")
    )
  : "";

const card = (f) => {
  const md = readFileSync(join(dir, f), "utf8");
  const c = channelOf(f);
  return `<article class="doc doc--${c}">
  <div class="doc-chan"><span class="tag t-${c}">${labelOf(f)}</span></div>
  ${renderMarkdown(md)}
</article>`;
};

const cards = drafts.map(card).join("\n");
const extraCards = extras.length
  ? `<h2>이미지와 카드뉴스</h2>\n${extras.map(card).join("\n")}`
  : "";

const html = `<title>성글벙글 오늘의 원고</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  --paper:#F5F7F3; --surface:#FFFFFF; --surface-2:#EDF1EB;
  --ink:#151C17; --muted:#5B665D; --rule:#DBE2DA;
  --naver:#2C6E49; --naver-soft:#E4F0E8;
  --tistory:#A8501B; --tistory-soft:#F7E9DE;
  --warn:#8A5A00; --warn-soft:#F8EEDA;
  --display:"Gowun Batang","Nanum Myeongjo",Georgia,serif;
  --body:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#131813; --surface:#1B211C; --surface-2:#222A23;
  --ink:#E4EAE2; --muted:#98A399; --rule:#2C342D;
  --naver:#7CC79A; --naver-soft:#1D2C22;
  --tistory:#E09055; --tistory-soft:#2E2119;
  --warn:#D9A94E; --warn-soft:#2B2417;
}}
:root[data-theme="dark"]{
  --paper:#131813; --surface:#1B211C; --surface-2:#222A23;
  --ink:#E4EAE2; --muted:#98A399; --rule:#2C342D;
  --naver:#7CC79A; --naver-soft:#1D2C22;
  --tistory:#E09055; --tistory-soft:#2E2119;
  --warn:#D9A94E; --warn-soft:#2B2417;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--body);
  font-weight:300;font-size:16.5px;line-height:1.8;margin:0;padding:0 1.2rem 6rem}
.wrap{max-width:74ch;margin:0 auto}
header.top{padding:3.5rem 0 2rem;border-bottom:2px solid var(--ink);margin-bottom:2.5rem}
.kicker{font-family:var(--mono);font-size:.72rem;letter-spacing:.16em;
  text-transform:uppercase;color:var(--muted);margin:0 0 1rem;display:flex;gap:.9rem;flex-wrap:wrap}
h1{font-family:var(--display);font-weight:700;font-size:clamp(1.9rem,5.5vw,2.8rem);
  line-height:1.25;margin:0 0 .8rem;text-wrap:balance}
.standfirst{color:var(--muted);margin:0;max-width:52ch}
h2{font-family:var(--display);font-weight:700;font-size:1.5rem;line-height:1.35;
  margin:3rem 0 1.4rem;padding-top:1.8rem;border-top:1px solid var(--ink);text-wrap:balance}
h3.doc-title{font-family:var(--display);font-weight:700;font-size:1.3rem;
  line-height:1.4;margin:0 0 1.1rem;text-wrap:balance}
h4{font-weight:600;font-size:1.02rem;margin:2rem 0 .7rem;
  padding-left:.7rem;border-left:2px solid var(--chan,var(--ink))}
h5{font-weight:600;font-size:.96rem;margin:1.5rem 0 .5rem;color:var(--muted)}
p{margin:0 0 1.05rem}
strong{font-weight:600}
ul,ol{margin:0 0 1.05rem;padding-left:1.15rem}
li{margin-bottom:.4rem}
li::marker{color:var(--muted)}
a{color:inherit;text-underline-offset:3px;text-decoration-color:var(--rule)}
a:focus-visible{outline:2px solid var(--naver);outline-offset:3px}
code{font-family:var(--mono);font-size:.86em;background:var(--surface-2);padding:.1em .35em;border-radius:2px}
.box{font-family:var(--mono);color:var(--muted)}
.scroller{overflow-x:auto;margin:0 0 1.3rem}
table{width:100%;border-collapse:collapse;font-size:.92rem;min-width:30rem}
th,td{text-align:left;padding:.7rem .85rem;border-bottom:1px solid var(--rule);vertical-align:top}
thead th{font-family:var(--mono);font-weight:500;font-size:.68rem;letter-spacing:.12em;
  text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--ink)}
.tag{display:inline-block;font-family:var(--mono);font-size:.67rem;letter-spacing:.1em;
  text-transform:uppercase;padding:.2rem .5rem;border-radius:2px}
.t-n{background:var(--naver-soft);color:var(--naver)}
.t-t{background:var(--tistory-soft);color:var(--tistory)}
.t-x{background:var(--surface-2);color:var(--muted)}
.doc{background:var(--surface);border:1px solid var(--rule);
  border-left:3px solid var(--chan);border-radius:3px;padding:1.5rem 1.6rem;margin:0 0 1.3rem}
.doc--n{--chan:var(--naver)}
.doc--t{--chan:var(--tistory)}
.doc--x{--chan:var(--rule)}
.doc-chan{margin-bottom:.9rem}
.doc > .callout:first-of-type{margin-top:-.3rem}
.callout{background:var(--warn-soft);color:var(--warn);border:1px dashed var(--warn);
  border-radius:3px;padding:.7rem .9rem;font-size:.9rem;line-height:1.65;margin:0 0 1.1rem}
.callout strong{font-weight:600}
footer{border-top:1px solid var(--rule);padding-top:1.5rem;margin-top:3rem;
  font-size:.88rem;color:var(--muted)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<header class="top wrap">
  <p class="kicker"><span>${esc(day)}</span><span>모바일 가독성 적용</span></p>
  <h1>오늘의 원고</h1>
  <p class="standfirst">네이버 원고는 모바일 한 줄 20자에 맞춰 줄을 끊었습니다. 보이는 그대로 복사해서 붙여넣으시면 됩니다.</p>
</header>

<main class="wrap">
<section>
${intro}
</section>

<h2>원고 ${drafts.length}편</h2>
${cards}

${extraCards}

<footer>
  <p>금액과 기한은 지역·가구 유형에 따라 다를 수 있습니다. 발행 전에 카드사나 지자체, 홈택스에서 한 번 더 확인해 주세요.</p>
</footer>
</main>
`;

writeFileSync(outPath, html, "utf8");
console.log(`${outPath} 생성 완료 (원고 ${drafts.length}편, ${html.length.toLocaleString()}자)`);
