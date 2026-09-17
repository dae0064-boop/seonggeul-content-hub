#!/usr/bin/env node
/**
 * 자체 점검 — 진짜 스레드에 붙지 않고 배관만 확인한다.
 *
 *   node scripts/threads/selftest.mjs
 *
 * 스레드 API 와 Anthropic API 를 흉내 내는 서버를 잠깐 띄우고, 발행과 댓글 처리
 * 경로를 그대로 태운다. 키가 없어도, 네트워크가 막혀 있어도 돈다.
 * 코드를 고친 뒤 이걸 먼저 돌린다. 여기서 깨지면 진짜 계정에서도 깨진다.
 */
import http from 'node:http';

// ---------------------------------------------------------------- 가짜 서버
const ME = { id: '17841400000000000', username: 'seonggeul' };

const POSTS = [
  { id: 'p1', text: '창문 외풍 막는 문풍지는 창틀 가장자리부터 붙이면 잘 안 떨어져요.', timestamp: '2026-09-15T10:00:00+0000', permalink: 'https://threads.net/p1' },
  { id: 'p2', text: '김장 배추 절일 때 소금물 농도보다 뒤집는 횟수가 더 중요하더라구요.', timestamp: '2026-09-14T10:00:00+0000', permalink: 'https://threads.net/p2' },
];

// p1 에 달린 대화. 하나는 답할 만하고, 하나는 욕설, 하나는 이미 답한 것
const CONVO = {
  p1: [
    { id: 'c1', text: '이거 진짜 효과 있나요? 저희 집은 외풍이 심해서요', username: 'reader_a', timestamp: new Date().toISOString(), replied_to: { id: 'p1' } },
    { id: 'c2', text: '병신같은 소리 하네', username: 'troll_b', timestamp: new Date().toISOString(), replied_to: { id: 'p1' } },
    { id: 'c3', text: '감사합니다 해볼게요', username: 'reader_c', timestamp: new Date().toISOString(), replied_to: { id: 'p1' } },
    { id: 'r1', text: '도움이 되셨다니 다행이에요!', username: ME.username, timestamp: new Date().toISOString(), replied_to: { id: 'c3' } },
  ],
  p2: [],
};

const GOOD_POST = [
  '아침저녁으로 선선해지니까 에어컨 정리할 때가 됐더라구요.',
  '',
  '바로 커버를 씌우면 안쪽이 눅눅한 채로 겨울을 나요.',
  '송풍으로 30분쯤 돌려 말린 다음 필터를 빼서 씻고,',
  '완전히 마른 뒤에 덮는 순서가 좋아요.',
  '',
  '이렇게 해도 곰팡이가 아예 안 생기는 건 아니라서',
  '내년에 꺼낼 때 냄새부터 맡아보는 게 확실하더라구요.',
  '',
  '다들 에어컨 정리 벌써 하셨나요?',
].join('\n');

const calls = { containers: [], published: [] };

function anthropicReply(bodyText) {
  const isReplyTask = bodyText.includes('댓글 담당');
  const payload = isReplyTask
    ? { action: 'reply', category: '가벼운 질문', reason: '글에서 다룬 범위 안이라 답할 수 있습니다.', text: '외풍이 심한 집이면 창틀 가장자리부터 꼼꼼히 붙여보세요. 한 번에 다 막히진 않지만 체감은 달라지더라구요.' }
    : { topic: '에어컨 정리 순서', text: GOOD_POST, check: '수치는 송풍 30분뿐이고 일반적인 권장 범위입니다.' };
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function start() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (obj, code = 200) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const p = url.pathname;

      if (p === '/v1/messages') return send(anthropicReply(raw));
      if (p === '/v1.0/me') return send(ME);
      if (p === `/v1.0/${ME.id}/threads` && req.method === 'GET') return send({ data: POSTS });

      if (p === `/v1.0/${ME.id}/threads` && req.method === 'POST') {
        const form = new URLSearchParams(raw);
        if (String(form.get('access_token') || '') === '') return send({ error: 'no token' }, 401);
        calls.containers.push({ text: form.get('text'), replyToId: form.get('reply_to_id') });
        return send({ id: `container-${calls.containers.length}` });
      }

      if (p === `/v1.0/${ME.id}/threads_publish`) {
        const form = new URLSearchParams(raw);
        calls.published.push(form.get('creation_id'));
        return send({ id: `media-${calls.published.length}` });
      }

      const convo = /^\/v1\.0\/([^/]+)\/conversation$/.exec(p);
      if (convo) return send({ data: CONVO[convo[1]] || [] });

      send({ error: `알 수 없는 경로: ${p}` }, 404);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------------------------------------------------------------- 검사
let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`   ${cond ? '[통과]' : '[실패]'} ${name}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failed++;
};

const server = await start();
const base = `http://127.0.0.1:${server.address().port}`;

process.env.THREADS_API_BASE = `${base}/v1.0`;
process.env.ANTHROPIC_API_BASE = base;
process.env.THREADS_ACCESS_TOKEN = 'test-token';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.THREADS_PUBLISH_DELAY_MS = '1';
process.env.THREADS_PAUSED = '';
delete process.env.GITHUB_TOKEN; // 진짜 이슈를 열지 않는다

// env 를 먼저 세팅한 뒤에 불러온다 (모듈이 읽는 시점이 그때다)
const { guard } = await import('./guard.mjs');
const publish = await import('./publish.mjs');
const replies = await import('./replies.mjs');

console.log('\n▶ 안전장치');
check('정상 글은 통과한다', guard(GOOD_POST).ok, guard(GOOD_POST).errors.join(' / '));
check('500자 초과는 막는다', !guard('가'.repeat(600)).ok);
check('단정 표현을 막는다', !guard(`${GOOD_POST}\n이건 무조건 됩니다`).ok);
check('"무조건 좋은 건 아니에요" 는 통과한다', guard(`${GOOD_POST}\n무조건 좋은 건 아니에요`).ok);
check('영업 문구를 막는다', !guard(`${GOOD_POST}\nDM 주세요`).ok);
check('전화번호를 막는다', !guard(`${GOOD_POST}\n010-1234-5678`).ok);
check('블로그 양식 혼입을 막는다', !guard(`${GOOD_POST}\n[빨간글씨]주의[/빨간글씨]`).ok);
check('최근 글과 겹치면 막는다', !guard(POSTS[0].text + ' 정말이에요 그리고 이건 덧붙인 문장입니다 조금 더 길게 써봅니다 진짜로요', { recentTexts: [POSTS[0].text] }).ok);
check('답글은 짧아도 통과한다', guard('해보시면 체감이 달라요.', { kind: 'reply' }).ok);

console.log('\n▶ 발행 (dry-run)');
const dry = await publish.run({ dryRun: true });
check('올리지 않는다', dry.dryRun === true && calls.published.length === 0);
check('본문을 만든다', Boolean(dry.post?.text?.length));

console.log('\n▶ 발행 (실제 경로)');
const real = await publish.run({});
check('컨테이너를 만들고 발행한다', real.published?.id === 'media-1', JSON.stringify(real.published));
check('발행한 본문이 안전장치를 통과한 것이다', guard(calls.containers[0].text).ok);

console.log('\n▶ 하루 상한');
process.env.THREADS_MAX_POSTS_PER_DAY = '0';
const { cfg } = await import('./config.mjs');
cfg.maxPostsPerDay = 0; // 이미 읽어들인 설정을 그 자리에서 낮춘다
const capped = await publish.run({});
check('상한에 닿으면 올리지 않는다', capped.skipped === 'daily-limit');
cfg.maxPostsPerDay = 4;

console.log('\n▶ 댓글');
const before = calls.published.length;
const r = await replies.run({});
check('답할 댓글에만 답한다 (1개)', r.replied === 1, `replied=${r.replied}`);
check('욕설은 보류한다 (1개)', r.held === 1, `held=${r.held}`);
check('이미 답한 댓글은 건드리지 않는다', calls.published.length - before === 1);
check('답글이 원 댓글에 달린다', calls.containers.at(-1).replyToId === 'c1', String(calls.containers.at(-1).replyToId));

console.log('\n▶ 멈춤 스위치');
process.env.THREADS_PAUSED = 'true';
check('멈추면 발행하지 않는다', (await publish.run({})).skipped === 'paused');
check('멈추면 댓글도 안 단다', (await replies.run({})).skipped === 'paused');

server.close();
console.log(failed ? `\n${failed}개 실패했습니다.\n` : '\n전부 통과했습니다.\n');
process.exit(failed ? 1 : 0);
