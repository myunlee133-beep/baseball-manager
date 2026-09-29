/**
 * 타구 모델. 컨택이 이뤄진 뒤의 모든 것을 여기서 결정한다.
 *
 *   타구 속도 + 발사 각도  →  타구 유형  →  수비수 배정
 *                          →  타구 난이도  →  수비수 능력치로 처리 확률
 *
 * 홈런을 별도 주사위로 뽑지 않는다. 각도와 속도가 담장을 넘기면 홈런이다.
 */
import { z, type HiddenBatter, type Tendencies } from './ratings';
import { LEAGUE_TUNING } from './calibration';

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export type BattedBallType = 'ground' | 'line' | 'fly' | 'popup';
export type FieldPosition =
  | 'P'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'LF'
  | 'CF'
  | 'RF';

export interface BattedBall {
  /** 타구 속도 (mph). */
  exitVelocity: number;
  /** 발사 각도 (도). 음수는 땅에 때려박은 타구. */
  launchAngle: number;
  /** 좌우 방향. -45 = 3루선, 0 = 중앙, +45 = 1루선. 우타자 기준으로 음수가 당겨친 쪽. */
  sprayAngle: number;
  type: BattedBallType;
  /** 담장을 넘겼는가. */
  homeRun: boolean;
  /** 배정된 수비수. 홈런이면 null. */
  fielder: FieldPosition | null;
  /** 수비 개입 전 안타 확률. 1에 가까울수록 처리하기 어려운 타구. */
  difficulty: number;
}

/** 구간별 역CDF 보간. 실제 분포를 직접 지정하는 가장 단순한 방법이다. */
function fromCurve(
  curve: readonly (readonly [number, number])[],
  roll: number,
): number {
  for (let i = 1; i < curve.length; i += 1) {
    const [p1, v1] = curve[i];
    if (roll <= p1) {
      const [p0, v0] = curve[i - 1];
      return v0 + ((v1 - v0) * (roll - p0)) / (p1 - p0 || 1);
    }
  }
  return curve[curve.length - 1][1];
}

/** 타구 속도 분포 (mph). 평균 약 89, 아래로 긴 꼬리. */
const EV_CURVE = [
  [0, 42],
  [0.05, 65],
  [0.2, 80],
  [0.5, 93],
  [0.8, 103],
  [0.95, 110],
  [1, 120],
] as const;
/** 발사 각도 분포 (도). 이 곡선이 곧 타구 유형 비율을 정한다 — 땅볼 43 / 라인 21 / 뜬공 26 / 팝업 10. */
const LA_CURVE = [
  [0, -60],
  [0.06, -20],
  [0.28, 0],
  [0.44, 10],
  [0.65, 25],
  [0.93, 50],
  [1, 82],
] as const;

/** 타구 속도. 파워가 지배하고, 맞은 지점의 질이 깎는다. */
function exitVelocity(
  hidden: HiddenBatter,
  power: number,
  quality: number,
  roll: number,
): number {
  return clamp(
    fromCurve(EV_CURVE, roll) +
      z(power) * 3.4 -
      (1 - quality) * 8 +
      z(hidden.babip) * 2.6,
    40,
    120,
  );
}

/**
 * 발사 각도. 성향이 곡선 전체를 위아래로 옮기고,
 * 인플레이 타구 질이 높을수록 분포가 라인드라이브 구간으로 모인다.
 */
const LINE_DRIVE_ROLL = 0.545;
function launchAngle(
  tend: Tendencies,
  quality: number,
  squareUp: number,
  roll: number,
): number {
  const focus = clamp(1 - z(squareUp) * 0.07, 0.55, 1.5);
  const centered = LINE_DRIVE_ROLL + (roll - LINE_DRIVE_ROLL) * focus;
  const jitter = (1 - quality) * (roll - 0.5) * 14;
  return clamp(
    fromCurve(LA_CURVE, centered) + tend.gbfb * 12 + jitter,
    -70,
    90,
  );
}

/** 좌우 방향. 삼각분포라 중앙이 두껍고 파울라인 쪽이 얇다. */
function sprayAngle(tend: Tendencies, bats: '좌' | '우', roll: number): number {
  const t =
    roll < 0.5 ? Math.sqrt(2 * roll) - 1 : 1 - Math.sqrt(2 * (1 - roll));
  const pullSide = bats === '우' ? -1 : 1;
  return clamp(tend.pull * 15 * pullSide + t * 44, -45, 45);
}

export function classify(launch: number): BattedBallType {
  if (launch < 10) return 'ground';
  if (launch < 25) return 'line';
  if (launch < 50) return 'fly';
  return 'popup';
}

/** 담장. 당겨친 쪽이 짧다. */
function fenceDistance(spray: number, bats: '좌' | '우'): number {
  const pullSide = bats === '우' ? -1 : 1;
  const pulled = spray * pullSide > 0;
  // 중앙이 가장 멀고 양쪽 폴대가 가장 가깝다.
  const centerBias = 1 - Math.abs(spray) / 45;
  return 100 + centerBias * 22 - (pulled ? 3 : 0);
}

/** 이 속도와 각도로 담장을 넘길 수 있는가. */
function carriesOut(
  ev: number,
  launch: number,
  spray: number,
  bats: '좌' | '우',
): boolean {
  if (launch < 18 || launch > 45) return false;
  // 26~30도가 가장 멀리 간다. 거기서 멀어질수록 필요한 속도가 올라간다.
  const anglePenalty = Math.abs(launch - 28) * 0.85;
  const needed =
    LEAGUE_TUNING.homeRunEV +
    anglePenalty +
    (fenceDistance(spray, bats) - 110) * 0.45;
  return ev >= needed;
}

/** 타구 유형과 방향으로 수비수를 정한다. */
export function assignFielder(
  type: BattedBallType,
  spray: number,
  ev: number,
): FieldPosition {
  if (type === 'ground') {
    if (ev < 52 && Math.abs(spray) < 10) return 'P';
    if (spray < -16) return '3B';
    if (spray < 0) return 'SS';
    if (spray < 16) return '2B';
    return '1B';
  }
  if (type === 'popup') {
    if (spray < -20) return '3B';
    if (spray < -2) return 'SS';
    if (spray < 18) return '2B';
    return '1B';
  }
  // 라인드라이브는 약하면 내야수 머리 위, 강하면 외야로 간다.
  if (type === 'line' && ev < 80) {
    if (spray < -16) return '3B';
    if (spray < 0) return 'SS';
    if (spray < 16) return '2B';
    return '1B';
  }
  if (spray < -8) return 'LF';
  if (spray < 8) return 'CF';
  return 'RF';
}

/**
 * 수비 개입 전 안타 확률. Statcast 의 xBA 와 같은 개념이다.
 * 라인드라이브가 압도적으로 높고 뜬공과 팝업이 낮다.
 */
function difficulty(type: BattedBallType, ev: number, launch: number): number {
  if (type === 'line') return clamp(0.72 + (ev - 90) * 0.008, 0.4, 0.96);
  if (type === 'ground') {
    const base = 0.258 + (ev - 88) * 0.0058;
    return clamp(ev < 58 ? base + 0.09 : base, 0.05, 0.62);
  }
  if (type === 'fly') {
    // 담장을 못 넘긴 뜬공. 외야 앞에 떨어지는 애매한 타구만 안타가 된다.
    const shallow = Math.max(0, 1 - Math.abs(launch - 27) / 22);
    return clamp(0.06 + shallow * 0.18 + (ev - 90) * 0.0016, 0.03, 0.45);
  }
  return 0.013;
}

export interface BattedBallInput {
  hidden: HiddenBatter;
  tend: Tendencies;
  power: number;
  bats: '좌' | '우';
  /** 투구 위치로 정해지는 배럴 정확도 0~1. */
  quality: number;
  /** 투수 구위. 피BABIP 을 낮춘다. */
  stuff: number;
}

/** 굴릴 난수 4개: 속도, 각도, 방향, 여유분. */
export function battedBall(
  input: BattedBallInput,
  rolls: [number, number, number],
): BattedBall {
  const ev = exitVelocity(input.hidden, input.power, input.quality, rolls[0]);
  const launch = launchAngle(
    input.tend,
    input.quality,
    input.hidden.babip,
    rolls[1],
  );
  const spray = sprayAngle(input.tend, input.bats, rolls[2]);
  const type = classify(launch);
  const homeRun = carriesOut(ev, launch, spray, input.bats);
  // 타자의 인플레이 타구 질과 투수의 구위가 여기서 맞선다.
  const edge = z(input.hidden.babip) * 0.034 - z(input.stuff) * 0.026;
  return {
    exitVelocity: ev,
    launchAngle: launch,
    sprayAngle: spray,
    type,
    homeRun,
    fielder: homeRun ? null : assignFielder(type, spray, ev),
    difficulty: homeRun
      ? 1
      : clamp(
          difficulty(type, ev, launch) * LEAGUE_TUNING.hitDifficulty + edge,
          0.02,
          0.95,
        ),
  };
}

/** 배정된 수비수가 처리할 확률. 수비 능력치가 여기서만 작동한다. */
export function outProbability(
  ball: BattedBall,
  fielderDefense: number,
  batterSpeed: number,
): number {
  if (ball.homeRun) return 0;
  // 내야 땅볼만 주력이 의미가 있다. 외야 타구는 발이 빨라도 잡히면 아웃이다.
  const legs =
    ball.type === 'ground'
      ? z(batterSpeed) * 0.025
      : ball.type === 'line'
        ? z(batterSpeed) * 0.004
        : 0;
  return clamp(
    1 - ball.difficulty + z(fielderDefense) * 0.045 - legs,
    0.03,
    0.99,
  );
}

/** 안타일 때 몇 루타인가. */
export function hitBases(
  ball: BattedBall,
  batterSpeed: number,
  roll: number,
): 1 | 2 | 3 {
  if (ball.type === 'ground')
    return roll < 0.04 + z(batterSpeed) * 0.012 ? 2 : 1;
  const deep = ball.exitVelocity > 98;
  const corner = Math.abs(ball.sprayAngle) > 22;
  const doubleChance =
    ball.type === 'line' ? (deep ? 0.42 : 0.2) : deep ? 0.55 : 0.26;
  const tripleChance = corner ? 0.035 + z(batterSpeed) * 0.02 : 0.008;
  if (roll < tripleChance) return 3;
  return roll < tripleChance + doubleChance ? 2 : 1;
}

