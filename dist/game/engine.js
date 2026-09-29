/**
 * 경기 엔진의 입구. 규칙과 한 구 진행은 play.ts, AI 감독은 manager.ts 에 있다.
 * 수동 진행·반 이닝·경기 자동 진행 모두 같은 playPitch 를 한 구씩 부른다.
 */
import { aiPrepare, chooseAiBattingStrategy, chooseAiPitchingStrategy, } from './manager.js';
import { battingSide, fieldingSide, playPitch } from './play.js';
export * from './play.js';
export * from './manager.js';
/** 양쪽 모두 AI 가 맡는 한 구. */
export function aiPitch(source) {
    let state = aiPrepare(source, fieldingSide(source));
    state = aiPrepare(state, battingSide(state));
    return playPitch(state, chooseAiBattingStrategy(state), chooseAiPitchingStrategy(state)).state;
}
// Convenience only: every plate appearance still runs through the same single-pitch engine.
export function playPlateAppearance(source, battingStrategy, pitchingStrategy) {
    let state = source;
    for (let pitches = 0; pitches < 1000 && state.status === 'playing'; pitches += 1) {
        state = playPitch(state, battingStrategy, pitchingStrategy).state;
        if (state.plateAppearance !== source.plateAppearance ||
            state.half !== source.half ||
            state.inning !== source.inning)
            return { state, battingStrategy, pitchingStrategy };
    }
    if (state.status === 'playing')
        throw new Error('타석 투구 제한을 초과했습니다.');
    return { state, battingStrategy, pitchingStrategy };
}
export function simulateHalfInning(source) {
    let state = structuredClone(source);
    const startingHalf = state.half;
    const startingInning = state.inning;
    for (let safety = 0; state.status === 'playing' &&
        state.half === startingHalf &&
        state.inning === startingInning; safety += 1) {
        if (safety >= 2000)
            throw new Error('반 이닝 투구 제한을 초과했습니다.');
        state = aiPitch(state);
    }
    return state;
}
export function simulateGame(source) {
    let state = structuredClone(source);
    for (let safety = 0; state.status === 'playing'; safety += 1) {
        if (safety >= 30000)
            throw new Error('경기 투구 제한을 초과했습니다.');
        state = aiPitch(state);
    }
    return state;
}
export const battingStrategyCopy = {
    balanced: { label: '기본 타격', hint: '타자 능력치 그대로 승부' },
    bunt: {
        label: '번트',
        hint: '주자 있으면 희생번트(3루 주자는 세이프티 스퀴즈), 없으면 기습 번트',
    },
    squeeze: {
        label: '스퀴즈',
        hint: '투구와 함께 3루 주자가 홈으로. 번트를 못 대면 주자가 죽는다',
    },
    'hit-and-run': {
        label: '히트앤드런',
        hint: '주자가 먼저 뛰고 타자는 무조건 맞힌다. 병살↓ 한 베이스 더↑',
    },
    steal: { label: '도루', hint: '이번 투구에 도루. 1·2루면 더블 스틸' },
};
export const pitchingStrategyCopy = {
    attack: { label: '카운트 피치', hint: '스트라이크 확보 · 타격 위험↑' },
    corners: { label: '보더라인 피치', hint: '존 경계 공략 · 스트라이크/볼' },
    chase: { label: '유인구 피치', hint: '존 밖으로 유도 · 타격 위력↓' },
    pitchout: {
        label: '피치아웃',
        hint: '도루를 읽고 공을 뺀다 · 볼 하나를 주고 도루 저지↑',
    },
    intentional: {
        label: '고의사구',
        hint: '공을 던지지 않고 1루로 보낸다 (KBO 자동 고의4구)',
    },
};
