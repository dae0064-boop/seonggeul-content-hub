#!/usr/bin/env node
/**
 * 원고 게이트 — 변환(.md → .json) 후 검사까지 한 번에.
 *
 *   npm run check content/posts/<원고>.md
 *   npm run check -- --full content/posts/<원고>.md
 *
 * 변환이 실패하면 검사로 넘어가지 않는다. 종료코드는 검사기의 것을 그대로 쓴다.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('사용법: npm run check [-- --full] <원고.md> [...]');
  process.exit(1);
}

const run = (script, argv) =>
  spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...argv], {
    stdio: 'inherit',
  });

const build = run('./build-post.mjs', files);
if (build.status !== 0) process.exit(build.status ?? 1);

const lint = run('./lint-post.mjs', args);
process.exit(lint.status ?? 1);
