// 티스토리 글쓰기 화면의 태그 칸 찾기·넣기.
//
// 2026-10-05 실제 실행(5편 모두 실패): 1차 시도에서 Playwright 선택자는 보이는 태그 칸을 찾았는데,
// document.querySelectorAll 로 찾은 후보는 0개였고 커서 확인(el === document.activeElement)도 실패했다.
// Playwright 선택자는 그림자 영역(shadow DOM) 안까지 들어가지만 querySelectorAll·document.activeElement 는 그렇지 않다
// — 태그 칸이 그림자 영역(또는 다른 틀 iframe) 안에 있다는 뜻이다. 본문을 넣은 뒤 2차 시도에서는 칸이 아예 안 보였다
// (긴 본문 아래로 밀려 그려지지 않은 것으로 본다).
// 그래서: ① 화면 맨 아래로 내려 칸을 그리게 하고 ② 모든 틀(frame)에서 찾고 ③ 커서 확인은 그 칸이 속한 영역 기준으로 한다.
// Enter 는 커서가 태그 칸에 있는 것이 확인됐을 때만 누른다 (발행 버튼이 눌릴 여지를 없앤다). 이 확인을 빼지 않는다.

// 2026-10-06 실제 실행(5편 모두 '실패'): 실패 로그의 후보 목록에 "○○ 태그 삭제" 단추가 8개 이상 보였다 — 태그는 들어가고 있었다.
// 몇 개를 넣은 뒤 칸에서 커서가 빠지고, 다시 시도 때는 칸 자체가 안 보였다. 티스토리는 한 글에 태그를 10개까지만 받고,
// 다 차면 입력 칸을 숨기는 것으로 본다. 그래서: 처음부터 10개까지만 넣고, 이미 들어간 태그는 건너뛰고,
// 칸이 사라져도 들어간 태그가 보이면 성공으로 센다.
export const TAG_MAX = 10;

export const TAG_SELECTORS = [
  'input#tagText',
  'input[placeholder*="태그"]',
  'input[aria-label*="태그"]',
  'input[id*="tag" i]:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
  'input[name*="tag" i]:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
  '[contenteditable="true"][placeholder*="태그"]',
  '[contenteditable="true"][data-placeholder*="태그"]',
  '[contenteditable="true"][aria-label*="태그"]',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 화면과 스크롤되는 상자들을 맨 아래로 — 아래쪽 태그 칸이 그때서야 그려지는 경우 */
async function revealBottom(page) {
  for (const f of page.frames()) {
    await f.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      for (const el of document.querySelectorAll('body *')) {
        if (el.scrollHeight > el.clientHeight + 40) {
          const oy = getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll') el.scrollTop = el.scrollHeight;
        }
      }
    }).catch(() => {});
  }
  await sleep(400);
}

/** '태그' 글자만 있는 접힌 단추가 있으면 펼친다 (발행·완료·저장 같은 단추는 절대 누르지 않는다) */
async function openTagToggle(page) {
  for (const f of page.frames()) {
    const loc = f.locator('button, a, span, label, div[role="button"]').filter({ hasText: /^\s*#?\s*태그\s*(추가|입력|달기)?\s*$/ });
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 5); i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const text = (await el.innerText().catch(() => '')).trim();
      if (/발행|완료|저장|공개|예약/.test(text)) continue;
      await el.click({ timeout: 2000 }).catch(() => {});
      await sleep(400);
      return text;
    }
  }
  return '';
}

/** 모든 틀에서 보이는 태그 칸 하나를 찾는다 */
export async function findTagInput(page, { timeout = 6000 } = {}) {
  const deadline = Date.now() + timeout;
  let revealed = false, toggled = false;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      for (const sel of TAG_SELECTORS) {
        const all = f.locator(sel);
        const n = await all.count().catch(() => 0);
        for (let i = 0; i < Math.min(n, 6); i++) {
          const loc = all.nth(i);
          if (await loc.isVisible().catch(() => false)) return { loc, sel, frame: f === page.mainFrame() ? 'main' : f.url() };
        }
      }
    }
    if (!revealed) { await revealBottom(page); revealed = true; continue; }
    if (!toggled) { toggled = true; if (await openTagToggle(page)) continue; }
    await sleep(300);
  }
  return null;
}

/** 커서가 그 칸에 있는지 — 그림자 영역·다른 틀 안이어도 맞게 본다 */
export const hasFocus = (loc) => loc.evaluate((el) => {
  const root = el.getRootNode();
  return el === root.activeElement || el.matches(':focus') || el.contains(root.activeElement);
}).catch(() => false);

const valueOf = (loc) => loc.evaluate((el) => ('value' in el ? el.value : el.textContent) || '').catch(() => '');

/** 지금 커서 위치 (그림자 영역·틀 안까지 따라 들어간다) — 실패 로그용 */
async function where(page) {
  return page.evaluate(() => {
    let a = document.activeElement, path = [];
    while (a) {
      path.push(a.tagName + (a.id ? '#' + a.id : ''));
      if (a.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
      else if (a.tagName === 'IFRAME') { try { a = a.contentDocument?.activeElement; } catch { a = null; } }
      else a = null;
    }
    return path.join(' > ') || '없음';
  }).catch(() => '?');
}

/** 태그 칸 후보를 로그에 남긴다 — 그림자 영역·모든 틀까지, 안 보이는 칸도. 다음에 선택자를 고칠 근거 */
export async function tagCandidates(page) {
  const out = [];
  for (const f of page.frames()) {
    const found = await f.evaluate(() => {
      const res = [];
      const walk = (root, depth) => {
        for (const e of root.querySelectorAll('*')) {
          if (e.shadowRoot) walk(e.shadowRoot, depth + 1);
          const attrs = `${e.id} ${e.getAttribute('name') || ''} ${typeof e.className === 'string' ? e.className : ''} ${e.getAttribute('placeholder') || ''} ${e.getAttribute('data-placeholder') || ''} ${e.getAttribute('aria-label') || ''}`;
          const field = e.matches('input, textarea, [contenteditable="true"]');
          const label = !field && e.children.length === 0 && /태그/.test(e.textContent || '') && (e.textContent || '').trim().length < 20;
          if ((field && /tag|태그/i.test(attrs)) || label) {
            const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
            res.push(`${depth ? `[그림자${depth}] ` : ''}${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`
              + `${field ? ` ph=${e.getAttribute('placeholder') || e.getAttribute('data-placeholder') || ''}` : ` "${e.textContent.trim()}"`}`
              + ` ${Math.round(r.width)}x${Math.round(r.height)}${cs.display === 'none' ? ' 숨김' : ''} 부모 ${e.parentElement?.className || ''}`);
          }
        }
      };
      walk(document, 0);
      return res.slice(0, 8);
    }).catch(() => []);
    if (found.length) out.push(`${f === page.mainFrame() ? '' : `[틀 ${f.url().slice(0, 60)}] `}${found.join(' | ')}`);
  }
  return out.join(' || ') || '태그 후보 칸 없음 (그림자 영역·모든 틀 포함)';
}

/** 이미 들어간 태그 — 각 태그 옆의 "○○ 태그 삭제" 단추 글자에서 읽는다 (그림자 영역·모든 틀 포함) */
export async function existingTags(page) {
  const names = new Set();
  for (const f of page.frames()) {
    const found = await f.evaluate(() => {
      const res = [];
      const walk = (root) => {
        for (const e of root.querySelectorAll('*')) {
          if (e.shadowRoot) walk(e.shadowRoot);
          const label = (e.textContent || '').trim() || e.getAttribute('aria-label') || '';
          const m = e.children.length === 0 && label.match(/^(.+?)\s*태그\s*삭제$/);
          if (m) res.push(m[1].trim());
        }
      };
      walk(document);
      return res;
    }).catch(() => []);
    for (const t of found) names.add(t);
  }
  return [...names];
}

/**
 * 태그를 하나씩 넣는다. 성공하면 넣은 개수, 칸을 못 찾거나 커서 확인이 안 되면 오류.
 * @param {(…m:any[])=>void} log
 * @param {(…m:any[])=>void} warn
 */
export async function enterTags(page, allTags, { log = () => {}, warn = () => {} } = {}) {
  const tags = allTags.slice(0, TAG_MAX);
  if (allTags.length > TAG_MAX) log(`태그는 ${TAG_MAX}개까지만 넣습니다 (티스토리 한도) — 뺀 것: ${allTags.slice(TAG_MAX).join(', ')}`);
  // 이미 들어간 태그(첫 시도에서 넣은 것)는 건너뛴다 — 칸이 다 차서 숨었으면 여기서 끝난다
  const already = new Set(await existingTags(page));
  const todo = tags.filter((t) => !already.has(t));
  if (!todo.length) { log(`태그 ${tags.length}/${tags.length}개 (이미 들어가 있음)`); return tags.length; }
  const filled = () => existingTags(page).then((have) => tags.filter((t) => have.includes(t)).length);
  // 칸이 닫히거나 커서가 빠졌을 때: 이미 한도만큼 들어갔으면 성공으로 본다
  const fullOr = async (err) => {
    const have = await existingTags(page);
    if (have.length >= TAG_MAX || tags.every((t) => have.includes(t))) {
      const n = tags.filter((t) => have.includes(t)).length;
      log(`태그 ${n}/${tags.length}개 (칸이 다 차서 닫힘 — 들어간 태그 ${have.length}개)`);
      return n;
    }
    throw err;
  };
  const hit = await findTagInput(page);
  if (!hit) return fullOr(new Error(`태그 칸을 찾지 못했습니다 (${await tagCandidates(page)})`));
  const { loc: tagLoc, sel, frame } = hit;
  log(`태그 칸: ${sel}${frame === 'main' ? '' : ` (틀 ${frame.slice(0, 60)})`}`);
  for (const t of todo) {
    await tagLoc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await tagLoc.focus({ timeout: 2000 }).catch(() => {});
    if (!(await hasFocus(tagLoc))) await tagLoc.click({ timeout: 3000 }).catch(() => {});
    if (!(await hasFocus(tagLoc))) return fullOr(new Error(`태그 칸에 커서가 없습니다 (${await filled()}/${tags.length}개 들어감, 커서 위치 ${await where(page)} · ${await tagCandidates(page)})`));
    await tagLoc.fill(t).catch(async () => { await tagLoc.pressSequentially(t, { delay: 20 }); });
    if ((await valueOf(tagLoc)).trim() !== t) {
      // 입력 이벤트만 듣는 칸: 지우고 한 글자씩
      await tagLoc.fill('').catch(() => {});
      await tagLoc.pressSequentially(t, { delay: 20 }).catch(() => {});
    }
    if (!(await hasFocus(tagLoc)) || (await valueOf(tagLoc)).trim() !== t) throw new Error('입력 중에 커서가 태그 칸을 벗어났습니다');
    await tagLoc.press('Enter');
    await sleep(250);
  }
  // 넣은 태그가 화면(칸 주변)에 보이는지 — 그림자 영역 안이면 그 영역 글자로 본다
  const area = await tagLoc.evaluate((el) => {
    const t = el.closest('[class*="tag" i]');
    const box = t?.parentElement || t || el.ownerDocument.body;
    const root = el.getRootNode();
    return `${box.innerText || box.textContent || ''} ${root instanceof ShadowRoot ? root.textContent : ''}`;
  }).catch(() => '');
  const have = await existingTags(page);
  const miss = tags.filter((t) => !area.includes(t) && !have.includes(t));
  if (miss.length) warn(`화면에서 확인되지 않은 태그: ${miss.join(', ')}`);
  log(`태그 ${tags.length - miss.length}/${tags.length}개`);
  return tags.length - miss.length;
}
