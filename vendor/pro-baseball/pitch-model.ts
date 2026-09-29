import type {
  BattingStrategy,
  CountKey,
  PitchCount,
  Pitcher,
  PitchingStrategy,
  PitchLocation,
  Player,
  SwingProfile,
} from './types';
import { hiddenBatter, z, type HiddenBatter } from './ratings';
import { LEAGUE_TUNING } from './calibration';

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export const pitchLocations: PitchLocation[] = [
  'count-strike',
  'borderline-strike',
  'borderline-ball',
  'chase-ball',
];
export const pitchLocationCopy: Record<PitchLocation, string> = {
  'count-strike': '카운트 strike',
  'borderline-strike': '보더라인 strike',
  'borderline-ball': '보더라인 ball',
  'chase-ball': '유인구 ball',
};

/** 선수의 히든 스탯. 같은 선수는 언제나 같은 값이므로 캐시해도 안전하다. */
export function hidden(batter: Player): HiddenBatter {
  return hiddenBatter(batter.id, batter, batter.hidden);
}

// 투구가 위치를 잡거나 판단되기 전에 정해지는 카운트별 스윙 성향.
// 0-0 존 칸은 구 엔진의 .72/.44 에서 낮췄다. 초구에 존 안 공을 너무 많이 쳐서 초구에 끝나는
// 타석이 15%(실제 약 12%)였고, 그만큼 타석이 짧아져 투구/타석이 3.74 에 머물렀다.
const baseSwingRates: Record<CountKey, readonly number[]> = {
  '0-0': [0.56, 0.33, 0.1, 0.015],
  '0-1': [0.88, 0.66, 0.14, 0.02],
  '0-2': [0.99, 0.95, 0.25, 0.035],
  '1-0': [0.76, 0.46, 0.08, 0.01],
  '1-1': [0.91, 0.72, 0.13, 0.02],
  '1-2': [0.99, 0.96, 0.23, 0.03],
  '2-0': [0.72, 0.35, 0.045, 0.005],
  '2-1': [0.91, 0.7, 0.09, 0.01],
  '2-2': [0.99, 0.96, 0.19, 0.025],
  '3-0': [0.18, 0.04, 0.005, 0],
  '3-1': [0.87, 0.54, 0.035, 0.005],
  '3-2': [0.99, 0.96, 0.14, 0.015],
};

/**
 * 카운트별 투수 작전 배합 [attack, corners, chase]. 타자 스윙표(baseSwingRates)와 짝을 이룬다.
 *
 * 목표 존 투구 비율을 먼저 정하고 배합을 역산했다. 평균 제구에서 작전별 존 비율이
 * 대략 attack 75% · corners 50% · chase 25% 이므로  존 비율 ≈ 25% + 50%·attack + 25%·corners.
 * 불리한 카운트(볼 > 스트라이크)일수록 존 안으로, 유리할수록 밖으로 던진다.
 * 역산한 뒤 볼넷률 9~10% 를 맞추려고 불리한 카운트 여섯 칸에서 chase 4%p 를 attack 으로 옮겼다.
 */
export const pitchingPlan: Record<CountKey, readonly [number, number, number]> =
  {
    '0-0': [0.39, 0.3, 0.31],
    '1-0': [0.52, 0.28, 0.2],
    '2-0': [0.67, 0.22, 0.11],
    '3-0': [0.9, 0.08, 0.02],
    '0-1': [0.28, 0.32, 0.4],
    '1-1': [0.39, 0.3, 0.31],
    '2-1': [0.55, 0.26, 0.19],
    '3-1': [0.78, 0.12, 0.1],
    '0-2': [0.01, 0.22, 0.77],
    '1-2': [0.09, 0.26, 0.65],
    '2-2': [0.21, 0.3, 0.49],
    '3-2': [0.61, 0.18, 0.21],
  };

/**
 * 인내심이 스윙을 줄이는 정도. 2스트라이크에서는 참을 수 없으므로 0이다.
 * 빠른 카운트일수록 크게 걸려서 선구안이 높을수록 타석당 투구 수가 늘어난다.
 */
const patienceWeight: Record<CountKey, number> = {
  '0-0': 1,
  '0-1': 0.55,
  '0-2': 0,
  '1-0': 0.9,
  '1-1': 0.5,
  '1-2': 0,
  '2-0': 0.8,
  '2-1': 0.45,
  '2-2': 0,
  '3-0': 0.3,
  '3-1': 0.35,
  '3-2': 0,
};

export function getSwingProfile(
  batter: Player,
  strategy: BattingStrategy = 'balanced',
): SwingProfile {
  const h = hidden(batter);
  // 인내심 1SD 당 빠른 카운트 스윙 확률을 6%p 낮춘다.
  const patience = z(h.patience) * 0.06;
  return Object.fromEntries(
    Object.entries(baseSwingRates).map(([key, rates]) => [
      key,
      Object.fromEntries(
        pitchLocations.map((location, index) => {
          const base =
            batter.swingProfile?.[key as CountKey]?.[location] ??
            rates[index] * (index >= 2 ? LEAGUE_TUNING.chaseSwing : 1);
          const approach = strategy === 'bunt' ? (index < 2 ? 0.12 : -0.03) : 0;
          const hold = batter.swingProfile
            ? 0
            : patience * patienceWeight[key as CountKey];
          return [location, clamp(base - hold + approach)];
        }),
      ),
    ]),
  ) as SwingProfile;
}

/**
 * 체력을 투구 수로 옮긴 값. 체력 50(리그 평균)이면 73구, 1SD 당 14구.
 * 피로 시작과 자동 교체가 모두 여기서 나온다 — 두 곳이 따로 계산되면 어긋난다.
 */
const staminaPitches = (pitcher: Pitcher) => 73 + z(pitcher.stamina) * 14.3;
/** 구위·제구가 떨어지기 시작하는 투구 수. */
export const fatigueStartPitch = (pitcher: Pitcher) =>
  pitcher.role === '선발'
    ? staminaPitches(pitcher)
    : staminaPitches(pitcher) * 0.55;
/** AI 가 투수를 내리는 투구 수. 선발은 6회까지 피로 시작 후 15구를 더 버틴다. */
export const pullPitch = (pitcher: Pitcher, inning: number) =>
  pitcher.role === '선발'
    ? staminaPitches(pitcher) + (inning >= 7 ? 0 : 15)
    : staminaPitches(pitcher) * 0.7;

/** 피로를 반영한 실제 능력치. 구속이 가장 먼저, 제구가 가장 천천히 떨어진다. */
export function effectivePitcherRatings(pitcher: Pitcher) {
  const penalty =
    Math.max(0, pitcher.pitchCount - fatigueStartPitch(pitcher)) * 0.09 +
    pitcher.fatigue * 0.05;
  return {
    velocity: clamp(pitcher.velocity - penalty * 1.2, 5, 90),
    stuff: clamp(pitcher.stuff - penalty, 5, 90),
    control: clamp(pitcher.control - penalty * 0.7, 5, 90),
  };
}

/**
 * 제구가 의도한 투구를 얼마나 실현하는가.
 * 제구가 높을수록 목표 분포의 비중이 커져 볼넷이 줄고 유리한 카운트가 늘어난다.
 */
export function pitchLocationProbabilities(
  pitcher: Pitcher,
  strategy: PitchingStrategy,
): Record<PitchLocation, number> {
  const execution = clamp(
    0.47 + z(effectivePitcherRatings(pitcher).control) * 0.14,
    0.12,
    0.93,
  );
  const target =
    strategy === 'attack'
      ? [1, 0, 0, 0]
      : strategy === 'corners'
        ? [0, 0.5, 0.5, 0]
        : [0, 0, 0, 1];
  const miss = [0.3, 0.2, 0.2, 0.3];
  return Object.fromEntries(
    pitchLocations.map((location, i) => [
      location,
      target[i] * execution + miss[i] * (1 - execution),
    ]),
  ) as Record<PitchLocation, number>;
}

/** 보더라인 공은 판단하기 어렵다. 여기에만 선구 히든 스탯이 쓰인다. */
export function recognitionProbability(
  batter: Player,
  location: PitchLocation,
): number {
  const judge = clamp(
    hidden(batter).borderlineJudge - batter.fatigue * 0.06,
    1,
    90,
  );
  const borderline =
    location === 'borderline-strike' || location === 'borderline-ball';
  // 구 엔진 값을 평균과 1SD 당 기울기 그대로 옮겼다. 평균 선구면 보더라인 65%, 나머지 72% 를 알아본다.
  return clamp(
    (borderline ? 0.654 : 0.716) + z(judge) * (borderline ? 0.126 : 0.106),
  );
}

export function sampleLocation(
  probabilities: Record<PitchLocation, number>,
  roll: number,
): PitchLocation {
  let cursor = 0;
  return (
    pitchLocations.find((location) => {
      cursor += probabilities[location];
      return roll < cursor;
    }) ?? 'chase-ball'
  );
}

export function judgePitch(
  batter: Player,
  location: PitchLocation,
  accuracyRoll: number,
  errorRoll: number,
): PitchLocation {
  if (accuracyRoll < recognitionProbability(batter, location)) return location;
  const errors: Record<PitchLocation, PitchLocation[]> = {
    'count-strike': ['borderline-strike', 'borderline-ball'],
    'borderline-strike': ['borderline-ball', 'count-strike'],
    'borderline-ball': ['borderline-strike', 'count-strike'],
    'chase-ball': ['borderline-ball', 'borderline-strike'],
  };
  return errors[location][errorRoll < 0.7 ? 0 : 1];
}

/** 투구 위치별 배럴 정확도. 타구 속도와 각도의 질을 좌우한다. */
export const barrelQuality: Record<PitchLocation, number> = {
  'count-strike': 1,
  'borderline-strike': 0.88,
  'borderline-ball': 0.7,
  'chase-ball': 0.48,
};

/**
 * 스윙했을 때의 결과 확률.
 * 구속이 헛스윙을 만들고, 삼진 회피가 2스트라이크에서 파울로 버티게 한다.
 */
export function swingOutcome(
  batter: Player,
  pitcher: Pitcher,
  location: PitchLocation,
  strategy: BattingStrategy,
  twoStrikes: boolean,
) {
  const h = hidden(batter);
  const eff = effectivePitcherRatings(pitcher);
  const index = pitchLocations.indexOf(location);
  const contactSkill = h.swingContact - batter.fatigue * 0.1;
  const bonus = strategy === 'bunt' ? 0.04 : 0;
  // 구속이 헛스윙률을 지배한다 (요구사항 2).
  // 존 안쪽 85%, 존 바깥 63% 가 실제 기준이다 (MLB Z-Contact / O-Contact).
  const contact = clamp(
    (LEAGUE_TUNING.contactBase +
      z(contactSkill) * 0.055 -
      z(eff.velocity) * 0.05 +
      bonus) *
      [
        1,
        0.95,
        0.85 * LEAGUE_TUNING.chaseContact,
        0.72 * LEAGUE_TUNING.chaseContact,
      ][index],
    0.05,
    0.98,
  );
  // 맞힌 공 중 파울 비율. 2스트라이크에서는 삼진 회피가 커트를 만든다.
  const cut = twoStrikes ? clamp(z(h.avoidK) * 0.07, -0.2, 0.25) : 0;
  const foul = clamp(
    0.46 + (1 - barrelQuality[location]) * 0.34 + cut,
    0.2,
    0.88,
  );
  return { contact, foul };
}

export function countKey(count: PitchCount): CountKey {
  return `${count.balls}-${count.strikes}` as CountKey;
}

