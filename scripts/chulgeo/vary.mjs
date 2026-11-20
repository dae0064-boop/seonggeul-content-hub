/**
 * 다와이철거 글 모양 돌려 쓰기 (2026-11-20 사용자 — "철거 글이 너무 똑같은 느낌", 2026-11-23 원고부터).
 * plan.mjs(그림 문장)와 lint.mjs(검사)가 같이 쓴다. 정본 설명: content/chulgeo/README.md 4 "돌려 쓰기".
 */
export const VARY_FROM = '2026-11-23';

/** 글 전체 빛·분위기 — 계획서 "mood" */
export const MOODS = {
  day: 'natural daylight mixed with a work lamp',
  morning: 'soft warm early-morning sunlight coming through the window',
  evening: 'evening scene, the room lit mainly by a bright work lamp, warm pools of light and deep shadows',
  fluorescent: 'cool white fluorescent ceiling lights, clean commercial interior look',
  overcast: 'soft cool overcast light from the window, muted calm tones',
  golden: 'late-afternoon golden light slanting through the window, warm tones',
};
export const SHOTS = {
  worker: 'one worker wearing a safety helmet, seen from behind or from the side, working in the space.',
  empty: 'the space right after demolition, completely empty and swept clean. No people in the image.',
  midway: 'the space halfway through demolition, some parts removed and some still in place, tools resting nearby. No people in the image.',
  tools: 'close-up of demolition tools such as a hammer, a pry bar, a cutting machine and work gloves resting on a dusty floor in the space, shallow depth of field. No people in the image.',
  hands: 'close-up of two hands in work gloves doing the work; only the hands and forearms are visible, no face or body.',
  debris: 'neatly tied debris sacks and bundled waste stacked by the entrance or corridor, ready to be carried out. No people in the image.',
  topdown: 'high-angle view looking down at the floor where the old finish has been removed, showing the bare base. No people in the image.',
  detail: 'close-up detail of exposed pipes, ducts or wiring left after removal. No people in the image.',
};
export const styleFor = (mood) => `Realistic documentary photograph taken with a full-frame camera, ${MOODS[mood] || MOODS.day}, true-to-life textures of cement, dust, tile and wood, honest on-site look, Korean apartments and shops.`;

/** 대표사진 글씨 모양 — 1번 overlay. key 는 검사·집계용 이름 */
export const LOOKS = {
  hl: '노란 형광펜 (look 없음 — 지금까지 모양)',
  band: '위쪽 색 그러데이션 띠 + 흰 글씨 (look: "band")',
  frame: '색 테두리 + 흰 글상자 (look: "frame")',
  pop: '위쪽 단색 띠 + 큰 글씨 + 흰 질문 상자 (look: "band", style: "pop")',
};
export const THEMES = ['navy', 'forest', 'burgundy', 'cobalt', 'teal', 'plum', 'charcoal', 'brick', 'olive', 'rose'];
export const lookOf = (o = {}) => (o.style === 'pop' ? 'pop' : o.look === 'band' || o.look === 'frame' ? o.look : 'hl');

/** 인사 두 줄 — 원고 프런트매터 greet: 1~4 */
export const GREETINGS = [
  ['안녕하세요', '서울·인천·경기 철거 전문 다와이철거입니다.'],
  ['안녕하세요, 다와이철거입니다.', '서울·인천·경기 현장을 다니고 있어요.'],
  ['안녕하세요', '7년째 철거 현장을 다니는 다와이철거입니다.'],
  ['반갑습니다, 다와이철거예요.', '오늘은 철거 전에 궁금한 점을 풀어 볼게요.'],
];
