/**
 * AI 감독. 매 투구 전에 작전·교체를 정한다.
 *
 * 판단의 기준은 주자·아웃 상황별 기대 득점(RE24)이다. 박빙 후반에는 "한 점이라도 낼 확률"로 바꿔 본다.
 * 번트·도루는 기대값이 오를 때만 쓰고, 교체 빈도는 OOTP 의 전략 성향(Hook for Starting/Relief Pitcher,
 * Pinch Hit, Defensive Substitutions, Stealing, Bunting)처럼 구단마다 조금씩 다르다 → managerStyle.
 */
import {
  countKey,
  fatigueStartPitch,
  pitchingPlan,
  pullPitch,
  effectivePitcherRatings,
} from './pitch-model';
import { fielding } from './fielding';
import { spread, z } from './ratings';
import {
  battingSide,
  changePitcher,
  fieldingSide,
  getCurrentBatter,
  getCurrentPitcher,
  getOnDeckBatter,
  leadOf,
  random,
  stealSuccessChance,
  stealTarget,
  strategyAvailable,
  substitutePlayer,
  substitutionProblem,
} from './play';
import type {
  BattingStrategy,
  GameState,
  Pitcher,
  PitchingStrategy,
  Player,
  Side,
} from './types';

/** 주자(비트: 1루=1, 2루=2, 3루=4) × 아웃별 기대 득점. 2010년대 MLB 평균을 KBO 득점 환경에 맞춰 1.1배. */
const RUN_EXPECTANCY = [
  [0.481, 0.859, 1.1, 1.437, 1.35, 1.784, 1.964, 2.292],
  [0.254, 0.509, 0.664, 0.884, 0.95, 1.13, 1.376, 1.541],
  [0.098, 0.224, 0.319, 0.429, 0.353, 0.478, 0.58, 0.752],
].map((row) => row.map((value) => value * 1.1));
/** 한 점 이상 낼 확률. 한 점이 급한 박빙 후반에 쓴다. */
const SCORE_PROBABILITY = [
  [0.268, 0.417, 0.614, 0.615, 0.831, 0.842, 0.838, 0.853],
  [0.158, 0.265, 0.397, 0.405, 0.653, 0.637, 0.681, 0.654],
  [0.068, 0.129, 0.218, 0.224, 0.263, 0.272, 0.257, 0.314],
];

const basesMask = (state: GameState) =>
  state.bases.reduce(
    (mask, runner, base) => mask | (runner ? 1 << base : 0),
    0,
  );

/** 타자의 공격 가치 (20-80). */
export const hitterValue = (player: Player) =>
  player.contact * 0.4 + player.power * 0.35 + player.eye * 0.25;

/** 구단별 성향. 1 이 리그 평균, 0.7~1.3. */
export function managerStyle(teamId: string) {
  return {
    steal: 1 + spread(teamId, 41) * 0.3,
    smallBall: 1 + spread(teamId, 42) * 0.3,
    hook: 1 + spread(teamId, 43) * 0.3,
    bench: 1 + spread(teamId, 44) * 0.3,
  };
}

function situationValue(state: GameState) {
  const lead = leadOf(state, battingSide(state));
  const oneRun = state.inning >= 7 && Math.abs(lead) <= 1;
  const table = oneRun ? SCORE_PROBABILITY : RUN_EXPECTANCY;
  return (mask: number, outs: number) => (outs >= 3 ? 0 : table[outs][mask]);
}

export function chooseAiBattingStrategy(state: GameState): BattingStrategy {
  const side = battingSide(state);
  const style = managerStyle(state.teams[side].id);
  const batter = getCurrentBatter(state);
  const lead = leadOf(state, side);
  const outs = state.outs;
  const count = state.count;
  const mask = basesMask(state);
  const value = situationValue(state);
  const quality = z(hitterValue(batter));
  const now = value(mask, outs) * (1 + quality * 0.15);
  if (Math.abs(lead) >= 5) return 'balanced';
  const oneRunLate = state.inning >= 7 && lead >= -1 && lead <= 0;

  // 스퀴즈: 박빙 후반 1사 3루, 약한 타자.
  if (
    strategyAvailable(state, 'squeeze') &&
    outs === 1 &&
    oneRunLate &&
    count.strikes < 2 &&
    quality < 0 &&
    random(state) < 0.25 * style.smallBall
  )
    return 'squeeze';

  // 희생번트: 무사 1루·2루·1,2루. 기대값(또는 한 점 확률)이 오를 때만.
  if (
    outs === 0 &&
    (mask === 1 || mask === 2 || mask === 3) &&
    count.strikes < 2
  ) {
    const advanced = mask << 1;
    const leadOut = mask === 1 ? 1 : 3;
    const sacrifice =
      0.7 * value(advanced, 1) +
      0.15 * value(leadOut, 1) +
      0.08 * value(mask, 1) +
      0.07 * value(advanced | 1, 0);
    // KBO 벤치는 기대 득점표보다 번트를 즐긴다. 그 성향만큼 기준을 낮춘다.
    if (
      sacrifice > now * (1 - 0.12 * style.smallBall) &&
      random(state) < 0.8 * style.smallBall
    )
      return 'bunt';
  }
  // 기습 번트: 빠르고 힘없는 타자, 주자 없음.
  if (
    mask === 0 &&
    outs < 2 &&
    count.strikes < 2 &&
    batter.speed >= 65 &&
    batter.power < 50 &&
    random(state) < 0.04 * style.smallBall
  )
    return 'bunt';

  // 히트앤드런: 컨택 좋은 타자, 유리한 카운트.
  if (
    strategyAvailable(state, 'hit-and-run') &&
    outs < 2 &&
    ['1-0', '2-0', '2-1', '1-1', '3-1'].includes(countKey(count)) &&
    batter.contact >= 55 &&
    state.bases[0]!.speed >= 50 &&
    random(state) < 0.1 * style.steal
  )
    return 'hit-and-run';

  // 도루: 성공 확률이 손익분기점을 넘을 때만. 분기점은 상황표에서 나온다.
  const target = stealTarget(state);
  if (target) {
    const p = stealSuccessChance(state, target.from);
    // 더블 스틸이 잡히면 선행 주자만 아웃이고 뒤 주자는 2루에 간다.
    const [success, failure] =
      target.from === 0
        ? [(mask & ~1) | 2, mask & ~1]
        : target.double
          ? [(mask & ~3) | 6, (mask & ~3) | 2]
          : [(mask & ~2) | 4, mask & ~2];
    const gain = value(success, outs) - value(mask, outs);
    const loss = value(mask, outs) - value(failure, outs + 1);
    const breakEven = gain + loss > 0 ? loss / (gain + loss) : 1;
    if (p > breakEven + 0.04 && random(state) < 0.2 * style.steal)
      return 'steal';
  }
  return 'balanced';
}

export function chooseAiPitchingStrategy(state: GameState): PitchingStrategy {
  const side = fieldingSide(state);
  const batter = getCurrentBatter(state);
  const lead = leadOf(state, side);
  const [first, second, third] = state.bases;
  const fresh = state.count.balls === 0 && state.count.strikes === 0;
  // 고의사구: 1루가 비고 득점권에 주자, 박빙 후반에 강타자 다음이 약할 때.
  // 9회말 이후 동점 3루 끝내기 주자면 만루를 채워 포스 아웃을 만든다.
  if (
    fresh &&
    !first &&
    (second || third) &&
    state.inning >= 7 &&
    Math.abs(lead) <= 2
  ) {
    const gap = z(hitterValue(batter)) - z(hitterValue(getOnDeckBatter(state)));
    const walkOffThreat =
      state.half === 'bottom' &&
      state.inning >= 9 &&
      lead === 0 &&
      third &&
      state.outs < 2;
    if (
      (gap >= 0.8 && batter.power >= 55) ||
      (walkOffThreat && second && random(state) < 0.5)
    )
      return 'intentional';
  }
  // 피치아웃: 발 빠른 1루 주자, 도루가 예상될 때 가끔.
  if (
    first &&
    !second &&
    first.speed >= 65 &&
    state.count.balls < 2 &&
    random(state) < 0.05
  )
    return 'pitchout';
  // 주자가 있을 때 거포와는 정면 승부를 피하고 코너로 돈다.
  if (batter.power >= 63 && state.bases.some(Boolean) && random(state) < 0.58)
    return 'corners';
  // 표를 뽑을 때는 주사위를 새로 굴린다. 앞 조건과 주사위를 나눠 쓰면
  // 떨어진 확률이 엉뚱한 작전으로 흘러간다 (예전 3-0 유인구 22% 의 원인).
  const [attack, corners] = pitchingPlan[countKey(state.count)];
  const roll = random(state);
  return roll < attack
    ? 'attack'
    : roll < attack + corners
      ? 'corners'
      : 'chase';
}

/** 구원 투수 한 번 등판의 투구 수 상한. 이닝 중이라도 넘으면 내린다. */
const RELIEF_PITCH_CAP = 25;

const pitcherQuality = (pitcher: Pitcher) => {
  const eff = effectivePitcherRatings(pitcher);
  return eff.velocity + eff.stuff + eff.control;
};

function freshArms(state: GameState, side: Side) {
  const team = state.teams[side];
  return team.pitchers.filter(
    (item) =>
      item.id !== team.currentPitcherId &&
      !team.usedPitcherIds.includes(item.id),
  );
}

/** 투수를 내릴 이유. 없으면 null. */
function pullReason(
  state: GameState,
  side: Side,
  pitcher: Pitcher,
): string | null {
  const line = state.pitchingStats[pitcher.id];
  const lead = leadOf(state, side);
  const runners = state.bases.filter(Boolean).length;
  const hook = managerStyle(state.teams[side].id).hook;
  const starter =
    state.appearances.find((app) => app.side === side)?.pitcherId ===
    pitcher.id;
  if (pitcher.pitchCount >= pullPitch(pitcher, state.inning)) return '체력';
  // 9회 세이브 상황은 마무리 차례다.
  if (
    state.inning >= 9 &&
    state.outs === 0 &&
    runners === 0 &&
    lead >= 1 &&
    lead <= 3 &&
    pitcher.role !== '마무리' &&
    freshArms(state, side).some((item) => item.role === '마무리')
  )
    return '세이브 상황';
  if (!line) return null;
  if (starter) {
    if (line.runsAllowed >= 6 / hook) return '난타';
    if (state.inning >= 5 && line.runsAllowed >= 4 / hook && runners >= 2)
      return '위기';
    // 세 번째 타순부터는 타자들이 공에 익숙하다. 박빙 후반 주자가 있으면 바꾼다.
    if (
      line.battersFaced >= 18 &&
      state.inning >= 6 &&
      Math.abs(lead) <= 2 &&
      runners >= 1 &&
      pitcher.pitchCount >= fatigueStartPitch(pitcher) - 10 * hook
    )
      return '세 번째 타순';
    return null;
  }
  if (pitcher.pitchCount >= RELIEF_PITCH_CAP) return '투구 수';
  // 아웃 3개 이상을 잡은 뒤 새 이닝이 시작되면(현재 0아웃) 내린다.
  // 이닝 중간에 올라와 아웃 2개를 잡았다면 다음 이닝 하나를 더 맡는다.
  if (state.outs === 0 && line.outs >= 3) return '1이닝 완료';
  if (line.runsAllowed >= 2 && runners >= 2) return '위기';
  // 좌우 원포인트: 박빙 후반 좌타자 앞에 우완이 있고 쉬는 좌완이 있으면.
  const batter = getCurrentBatter(state);
  if (
    state.inning >= 7 &&
    Math.abs(lead) <= 2 &&
    line.battersFaced >= 1 &&
    batter.bats !== pitcher.throws &&
    freshArms(state, side).some(
      (item) => item.role === '중계' && item.throws === batter.bats,
    ) &&
    random(state) < 0.08 * hook
  )
    return '좌우 매치업';
  return null;
}

/** 상황에 맞는 구원 투수. 박빙이면 최고, 크게 앞서거나 뒤지면 추격조, 그 사이는 중간. */
function chooseReliever(state: GameState, side: Side): Pitcher | null {
  const arms = freshArms(state, side);
  const relievers = arms.filter((item) => item.role !== '선발');
  const pool = relievers.length ? relievers : arms;
  if (!pool.length) return null;
  const lead = leadOf(state, side);
  const batter = getCurrentBatter(state);
  const closer = pool.find((item) => item.role === '마무리');
  if (closer && state.inning >= 9 && lead >= 0 && lead <= 3) return closer;
  const others = pool.filter((item) => item !== closer);
  const ranked = (others.length ? others : pool)
    .map((item) => ({
      item,
      score: pitcherQuality(item) + (item.throws === batter.bats ? 15 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
  if (Math.abs(lead) >= 5) return ranked.at(-1)!;
  if (state.inning >= 7 && Math.abs(lead) <= 2) return ranked[0];
  return ranked[Math.floor(ranked.length / 2)];
}

export function maybeAutoChangePitcher(
  source: GameState,
  side = fieldingSide(source),
): GameState {
  if (
    source.status === 'final' ||
    source.count.balls !== 0 ||
    source.count.strikes !== 0 ||
    fieldingSide(source) !== side
  )
    return source;
  const state = structuredClone(source);
  const current = getCurrentPitcher(state);
  const reason = pullReason(state, side, current);
  if (!reason) return source;
  const next = chooseReliever(state, side);
  return next ? changePitcher(state, side, next.id) : source;
}

/** 대타·대주자·대수비. 한 번에 하나만 바꾼다. 모든 교체는 substitutionProblem 을 통과해야 한다. */
export function aiSubstitutions(source: GameState, side: Side): GameState {
  if (
    source.status === 'final' ||
    source.count.balls !== 0 ||
    source.count.strikes !== 0
  )
    return source;
  const team = source.teams[side];
  const style = managerStyle(team.id);
  const lead = leadOf(source, side);
  const bench = team.bench.filter(
    (item) => !team.usedPlayerIds.includes(item.id),
  );
  if (!bench.length) return source;
  if (battingSide(source) === side) {
    // 대타: 7회 이후 박빙, 확실히 나은 타자가 있거나 좌우가 맞을 때.
    if (source.inning >= 7 && lead >= -3 && lead <= 1) {
      const index = source.battingIndex[side] % 9;
      const batter = team.lineup[index].player;
      const pitcher = getCurrentPitcher(source);
      const worth = (player: Player) =>
        hitterValue(player) + (player.bats !== pitcher.throws ? 3 : -3);
      const best = bench
        .filter(
          (item) =>
            !substitutionProblem(source, side, index, item.id, 'pinch-hitter'),
        )
        .sort((a, b) => worth(b) - worth(a))[0];
      const threshold =
        (source.bases[1] || source.bases[2] ? 5 : 8) / style.bench;
      if (best && worth(best) - worth(batter) >= threshold)
        return substitutePlayer(source, side, index, best.id, 'pinch-hitter');
    }
    // 대주자: 8회 이후 동점·역전 주자가 느리면.
    const runnersOn = source.bases.filter(Boolean).length;
    if (source.inning >= 8 && lead <= 0 && lead >= -runnersOn) {
      for (const runner of [source.bases[1], source.bases[0]]) {
        if (!runner || runner.speed > 42) continue;
        const fast = bench
          .filter(
            (item) =>
              item.speed >= 62 &&
              !substitutionProblem(
                source,
                side,
                runner.lineupIndex,
                item.id,
                'pinch-runner',
              ),
          )
          .sort((a, b) => b.speed - a.speed)[0];
        if (fast)
          return substitutePlayer(
            source,
            side,
            runner.lineupIndex,
            fast.id,
            'pinch-runner',
          );
      }
    }
    return source;
  }
  // 대수비: 8회 이후 1~3점 리드, 이닝 시작 때 수비가 약한 자리를 바꾼다.
  if (
    source.inning >= 8 &&
    lead >= 1 &&
    lead <= 3 &&
    source.outs === 0 &&
    !source.bases.some(Boolean)
  ) {
    for (const [index, entry] of team.lineup.entries()) {
      if (entry.position === 'DH') continue;
      const current = fielding(entry.player, entry.position).range;
      const glove = bench
        .filter(
          (item) =>
            !substitutionProblem(source, side, index, item.id, 'defense'),
        )
        .sort(
          (a, b) =>
            fielding(b, entry.position).range -
            fielding(a, entry.position).range,
        )[0];
      if (
        glove &&
        fielding(glove, entry.position).range >= current + 10 / style.bench
      )
        return substitutePlayer(source, side, index, glove.id, 'defense');
    }
  }
  return source;
}

/** AI 가 맡은 쪽의 투구 전 준비: 교체와 투수 교체. */
export function aiPrepare(source: GameState, side: Side): GameState {
  let state = aiSubstitutions(source, side);
  if (fieldingSide(state) === side) state = maybeAutoChangePitcher(state, side);
  return state;
}

/** 사용자 경기에서 AI 팀(원정)의 준비. */
export function maybeChangeAiPitcher(source: GameState): GameState {
  return aiPrepare(source, 'away');
}

