#!/usr/bin/env node
/**
 * 스레드 장기 토큰(60일) 갱신
 *
 *   node scripts/threads/refresh-token.mjs            # 만료일만 확인
 *   node scripts/threads/refresh-token.mjs --out 파일  # 새 토큰을 파일로 저장
 *
 * 토큰은 화면에 찍지 않는다. --out 으로 받은 파일에만 쓰고,
 * 워크플로가 그 파일을 곧바로 GitHub Secret 으로 밀어 넣고 지운다.
 *
 * 발급 후 24시간이 지나야 갱신된다. 만료된 토큰은 갱신되지 않고,
 * 그때는 Meta 개발자 콘솔에서 다시 받아야 한다.
 */
import fs from 'node:fs';
import { loadEnv, requireEnv, isMain, log, step, warn } from './config.mjs';
import { refreshLongLivedToken } from './api.mjs';
import { report } from './notify.mjs';

if (isMain(import.meta.url)) {
  loadEnv();
  requireEnv(['THREADS_ACCESS_TOKEN']);

  const outIdx = process.argv.indexOf('--out');
  const out = outIdx > -1 ? process.argv[outIdx + 1] : null;

  step('스레드 토큰 갱신');
  try {
    const res = await refreshLongLivedToken(process.env.THREADS_ACCESS_TOKEN);
    const days = Math.round((res.expires_in || 0) / 86400);
    const until = new Date(Date.now() + (res.expires_in || 0) * 1000).toISOString().slice(0, 10);
    log(`새 토큰을 받았습니다. ${days}일 남음 (${until} 까지)`);

    if (out) {
      fs.writeFileSync(out, res.access_token, { mode: 0o600 });
      log(`토큰을 ${out} 에 저장했습니다.`);
    } else {
      warn('--out 을 주지 않아 새 토큰을 버렸습니다. 저장하려면 --out <파일> 을 주세요.');
    }
  } catch (e) {
    console.error(`\n[실패] ${e.message}`);
    await report({
      title: '[스레드] 토큰 갱신 실패 — 손으로 다시 발급해야 합니다',
      body: [
        '스레드 장기 토큰을 갱신하지 못했습니다. 토큰이 만료되면 발행과 댓글 답변이 전부 멈춥니다.',
        '',
        '```',
        e.message,
        '```',
        '',
        '재발급 절차는 `docs/THREADS.md` 의 "토큰 다시 받기" 를 보세요.',
      ].join('\n'),
      labels: ['threads-hold'],
    });
    process.exit(1);
  }
}
