#!/usr/bin/env node
/**
 * 스레드 노출 확인 — 아무것도 올리지 않고 최근 글의 조회·좋아요·댓글 수만 읽는다 (2026-11-05 사용자 "노출이 전혀 안 된다").
 *
 *   node scripts/threads/insights.mjs [--days 3] [--out <파일>]
 *
 * 스레드 API 의 insights 는 토큰에 threads_manage_insights 권한이 있어야 읽힌다.
 * 권한이 없으면 그렇다고 한 줄 남기고 끝난다(종료 코드 3) — 그때는 사람이 Meta 개발자 화면에서 권한을 더해 토큰을 다시 받아야 한다.
 * 작업 스케줄러 SeonggeulThreadsBlog(threads-blog.ps1)가 3시간에 한 번 Drive run-logs/threads/insights-<날짜>.txt 로 남긴다.
 */
import fs from 'node:fs';
import { loadEnv, isMain, kstStamp } from './config.mjs';

const BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';

async function get(endpoint, params, token) {
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch { /* 아래에서 처리 */ }
  if (!res.ok) {
    const msg = String(body?.error?.message || text).replace(/(access_token=)[^&\s"]+/g, '$1***').slice(0, 300);
    const err = new Error(`${res.status} ${msg}`);
    err.status = res.status;
    err.noPermission = /permission|scope|threads_manage_insights|\(#10\)|\(#200\)/i.test(msg);
    throw err;
  }
  return body;
}

/** insights 응답 → { views: 12, likes: 0, ... } */
function metrics(body) {
  const out = {};
  for (const m of body?.data || []) {
    out[m.name] = m.total_value?.value ?? m.values?.reduce((s, v) => s + (v.value || 0), 0) ?? 0;
  }
  return out;
}

function kind(text) {
  const t = String(text || '');
  if (/약관을 참조/.test(t)) return '보험';
  if (/블로그에 정리/.test(t)) return '블로그';
  return '일상';
}

if (isMain(import.meta.url)) {
  loadEnv();
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const days = Number(opt('--days', 3));
  const outFile = opt('--out', '');
  const token = process.env.THREADS_ACCESS_TOKEN;
  const lines = [`▶ 스레드 노출 확인 — ${kstStamp()}`];
  const done = (code) => {
    const text = lines.join('\n') + '\n';
    process.stdout.write(text);
    if (outFile) fs.writeFileSync(outFile, '﻿' + text, 'utf8');
    process.exit(code);
  };
  if (!token) { lines.push('  [문제] THREADS_ACCESS_TOKEN 없음'); done(1); }

  try {
    const me = await get('/me', { fields: 'id,username' }, token);
    lines.push(`  계정 @${me.username}`);
    const since = Math.floor(Date.now() / 1000) - days * 86400;

    // 계정 전체 (팔로워 수·기간 조회) — 권한 확인도 겸한다
    try {
      const fol = metrics(await get(`/${me.id}/threads_insights`, { metric: 'followers_count' }, token));
      const acc = metrics(await get(`/${me.id}/threads_insights`, { metric: 'views,likes,replies,reposts', since, until: Math.floor(Date.now() / 1000) }, token));
      lines.push(`  팔로워 ${fol.followers_count ?? '?'} · 최근 ${days}일 계정 조회 ${acc.views ?? '?'} · 좋아요 ${acc.likes ?? '?'} · 댓글 ${acc.replies ?? '?'} · 리포스트 ${acc.reposts ?? '?'}`);
    } catch (e) {
      if (e.noPermission) {
        lines.push('  [권한 없음] 토큰에 threads_manage_insights 권한이 없어 조회수를 읽지 못했어요.');
        lines.push(`  (${e.message})`);
        done(3);
      }
      lines.push(`  [주의] 계정 통계 못 읽음 — ${e.message}`);
    }

    // 글마다
    const posts = [];
    let page = await get(`/${me.id}/threads`, { fields: 'id,text,permalink,timestamp,media_type', limit: 50, since }, token);
    posts.push(...(page.data || []));
    for (let i = 0; i < 3 && page?.paging?.cursors?.after && page.data?.length; i++) {
      page = await get(`/${me.id}/threads`, { fields: 'id,text,permalink,timestamp,media_type', limit: 50, since, after: page.paging.cursors.after }, token);
      posts.push(...(page.data || []));
    }
    lines.push(`  최근 ${days}일 글 ${posts.length}개`, '', '  시각(KST)        갈래   조회  좋아요 댓글  첫 줄');
    const sum = {};
    for (const p of posts) {
      let m = {};
      try { m = metrics(await get(`/${p.id}/insights`, { metric: 'views,likes,replies,reposts' }, token)); }
      catch (e) { if (e.noPermission) { lines.push('  [권한 없음] 글 통계를 읽을 권한이 없어요 (threads_manage_insights).'); done(3); } m = {}; }
      const k = kind(p.text);
      const s = (sum[k] ||= { n: 0, views: 0, likes: 0, replies: 0, zero: 0 });
      s.n++; s.views += m.views || 0; s.likes += m.likes || 0; s.replies += m.replies || 0; if (!m.views) s.zero++;
      const t = new Date(Date.parse(p.timestamp) + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
      const first = String(p.text || '').split('\n').find((l) => l.trim()) || '';
      lines.push(`  ${t}  ${k.padEnd(3)} ${String(m.views ?? '?').padStart(5)} ${String(m.likes ?? '?').padStart(5)} ${String(m.replies ?? '?').padStart(4)}  ${first.slice(0, 24)}`);
    }
    lines.push('', '  갈래별 합계');
    for (const [k, s] of Object.entries(sum)) {
      lines.push(`  · ${k} ${s.n}편 — 조회 ${s.views} (편당 ${s.n ? Math.round(s.views / s.n) : 0}) · 좋아요 ${s.likes} · 댓글 ${s.replies} · 조회 0인 글 ${s.zero}편`);
    }
    done(0);
  } catch (e) {
    lines.push(`  [문제] ${e.message}`);
    done(1);
  }
}
