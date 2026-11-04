#!/usr/bin/env node
/**
 * 클로드 사용량 읽기 — 바탕화면 위젯(launchers/usage-widget.cmd)이 5분마다 부른다. 읽기만 한다.
 * 2026-11-02 사용자 "채팅창 옆에 이런 식으로(둥근 막대 위젯)". 채팅 옆 패널은 클라우드 대화에서 켜지지 않아
 * (.claude/skills/usage-meter/README.md) PC 위젯으로 만든다.
 *
 *   node scripts/claude-usage.mjs [--out dumps/claude-usage.json] [--cdp http://localhost:9222]
 *
 * 자동화용 크롬(9222)에 붙어 claude.ai 탭 안에서 claude.ai 화면이 쓰는 사용량 정보를 읽는다
 * (/api/organizations → /api/organizations/<id>/usage — 공개 문서가 없는 통로라 바뀌면 고친다).
 * claude.ai 탭이 없으면 뒤쪽 탭(background)으로 하나 열어 두고 닫지 않는다 — 창을 앞으로 띄우지 않는다
 * (2026-11-04 사용자 "따로 요청 안 하면 사용량 화면이 뜨지 않게"). 브라우저는 닫지 않는다.
 *
 * 남기는 것: <out> = { ok, status, at, limits: [{ kind, label, pct, resets_at }], message }
 *            <out 이름>-raw.json = 받은 그대로 (모양이 바뀌었을 때 고치는 근거)
 * status: ok | login(claude.ai 로그인 필요) | nochrome(자동화용 크롬 없음) | error
 * 종료 코드: 0 ok, 3 login, 2 nochrome, 1 error
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
if (argv.includes('--help')) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = opt('--out', 'dumps/claude-usage.json');
const RAW = OUT.replace(/\.json$/, '') + '-raw.json';
const CDP = opt('--cdp', 'http://localhost:9222');

const LABELS = {
  five_hour: '현재 세션 (5시간)',
  seven_day: '주간 한도 (모든 모델)',
  seven_day_opus: '주간 한도 (Opus)',
  seven_day_sonnet: '주간 한도 (Sonnet)',
};
const ORDER = ['five_hour', 'seven_day', 'seven_day_sonnet', 'seven_day_opus'];

function save(obj, code) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const body = JSON.stringify({ at: new Date().toISOString(), ...obj }, null, 1);
  // 위젯이 쓰는 도중의 파일을 읽지 않게 임시 파일 → 이름 바꾸기
  fs.writeFileSync(OUT + '.tmp', body);
  fs.renameSync(OUT + '.tmp', OUT);
  console.log(`${obj.status}: ${obj.message || ''}`);
  process.exit(code);
}

// 받은 JSON 에서 { utilization, resets_at } 모양인 칸을 모두 꺼낸다
export function toLimits(u) {
  const out = [];
  for (const [kind, v] of Object.entries(u || {})) {
    if (!v || typeof v !== 'object' || typeof v.utilization !== 'number') continue;
    out.push({ kind, label: LABELS[kind] || kind, pct: Math.max(0, Math.min(100, Math.round(v.utilization))), resets_at: v.resets_at || null });
  }
  const rank = (k) => (ORDER.indexOf(k) < 0 ? 99 : ORDER.indexOf(k));
  return out.sort((a, b) => rank(a.kind) - rank(b.kind));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  let browser;
  try { browser = await chromium.connectOverCDP(CDP, { timeout: 15000 }); }
  catch (e) { save({ ok: false, status: 'nochrome', message: '자동화용 크롬이 꺼져 있어요' }, 2); }

  try {
    const ctx = browser.contexts()[0] || (await browser.newContext());
    let page = ctx.pages().find((p) => /^https:\/\/claude\.ai\//.test(p.url()));
    if (!page) {
      // 뒤쪽 탭으로만 연다 — 앞에 뜨지 않게 (2026-11-04 사용자 "요청 안 하면 사용량 창이 계속 뜨지 않게").
      // ctx.newPage() 는 크롬 창을 앞으로 띄워 5분마다 사용량 화면이 튀어나왔다. 사용량 화면 대신 빈 응답 주소를 연다.
      const cdp = await browser.newBrowserCDPSession();
      const opened = ctx.waitForEvent('page', { timeout: 15000 });
      await cdp.send('Target.createTarget', { url: 'https://claude.ai/api/organizations', background: true });
      page = await opened;
      await page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    const got = await page.evaluate(async () => {
      const get = async (u) => {
        const r = await fetch(u, { credentials: 'include', headers: { accept: 'application/json' } });
        let body = null;
        try { body = await r.json(); } catch { /* 글자 */ }
        return { status: r.status, body };
      };
      const orgs = await get('/api/organizations');
      if (orgs.status !== 200 || !Array.isArray(orgs.body)) return { step: 'orgs', ...orgs };
      // 대화(chat)를 쓰는 조직을 먼저, 없으면 첫 번째
      const org = orgs.body.find((o) => (o.capabilities || []).includes('chat')) || orgs.body[0];
      if (!org) return { step: 'orgs', status: 200, body: orgs.body };
      const usage = await get(`/api/organizations/${org.uuid}/usage`);
      return { step: 'usage', org: org.uuid, ...usage };
    }, null);

    fs.mkdirSync(path.dirname(RAW), { recursive: true });
    fs.writeFileSync(RAW, JSON.stringify(got, null, 1));
    await browser.close().catch(() => {}); // 연결만 끊는다 (자동화용 크롬은 그대로)

    if (got.status === 401 || got.status === 403) save({ ok: false, status: 'login', message: '자동화용 크롬에서 claude.ai 로그인이 필요해요' }, 3);
    if (got.status !== 200) save({ ok: false, status: 'error', message: `사용량을 받지 못했어요 (${got.step} ${got.status})` }, 1);
    const limits = toLimits(got.body);
    if (!limits.length) save({ ok: false, status: 'error', message: '사용량 모양이 바뀌었어요 — Claude 에게 알려 주세요' }, 1);
    save({ ok: true, status: 'ok', limits }, 0);
  } catch (e) {
    await browser?.close().catch(() => {});
    save({ ok: false, status: 'error', message: `읽다가 멈췄어요: ${String(e.message || e).slice(0, 120)}` }, 1);
  }
}
