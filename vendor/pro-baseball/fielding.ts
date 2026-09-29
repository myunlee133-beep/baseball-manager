/**
 * 수비 위치와 수비 능력.
 *
 * OOTP 의 수비 모델을 따른다. 선수는 출전 자격이 있는 위치마다 숙련도를 갖고,
 * 수비 능력은 범위(range) · 포구(hands, OOTP 의 Error) · 송구(arm) · 병살 연결(turn) 네 가지다.
 * 화면에는 수비 하나만 보이고 네 히든 값은 선수 id 에서 고정 생성된다.
 *
 * 데이터 무결성: 자격 없는 위치로는 출전할 수 없다. 모든 라인업 변경은 canPlay 를 거친다.
 */
import { clampRating, spread } from './ratings';
import type {
  FieldingPosition,
  LineupEntry,
  LineupPosition,
  Pitcher,
  Player,
  TeamState,
} from './types';

export const FIELDING_POSITIONS: FieldingPosition[] = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
];
export const LINEUP_POSITIONS: LineupPosition[] = [...FIELDING_POSITIONS, 'DH'];

export const POSITION_NAME: Record<string, string> = {
  P: '투수',
  C: '포수',
  '1B': '1루수',
  '2B': '2루수',
  '3B': '3루수',
  SS: '유격수',
  LF: '좌익수',
  CF: '중견수',
  RF: '우익수',
  DH: '지명타자',
};

/**
 * 주 포지션에서 파생되는 출전 자격과 숙련도. 비슷한 위치끼리만 옮길 수 있다.
 * 포수는 포수만, 지명타자 전문은 수비에 나갈 수 없다. 누구나 지명타자는 할 수 있다.
 */
const FAMILY: Record<string, Partial<Record<FieldingPosition, number>>> = {
  C: { C: 1 },
  '1B': { '1B': 1 },
  '2B': { '2B': 1, SS: 0.9, '3B': 0.85, '1B': 0.85 },
  SS: { SS: 1, '2B': 0.95, '3B': 0.9, '1B': 0.85 },
  '3B': { '3B': 1, '1B': 0.9, '2B': 0.8 },
  LF: { LF: 1, RF: 0.95, '1B': 0.8 },
  RF: { RF: 1, LF: 0.95, '1B': 0.8 },
  CF: { CF: 1, LF: 1, RF: 1 },
  IF: { '2B': 0.95, SS: 0.9, '3B': 0.95, '1B': 0.95 },
  OF: { LF: 1, RF: 1, CF: 0.9 },
  DH: {},
};

export function positionRatings(
  player: Player,
): Partial<Record<FieldingPosition, number>> {
  return player.positions ?? FAMILY[player.position] ?? {};
}

export function canPlay(player: Player, position: string): boolean {
  if (position === 'DH') return true;
  return (positionRatings(player)[position as FieldingPosition] ?? 0) > 0;
}

export interface Fielding {
  /** 타구에 닿는 범위. 아웃 확률. */
  range: number;
  /** 포구·송구 정확도. 높을수록 실책이 적다. 포수는 블로킹. */
  hands: number;
  /** 송구 강도. 주자 보살, 태그업·추가 진루 억제, 포수 도루 저지. */
  arm: number;
  /** 병살 연결. */
  turn: number;
}

/** 위치별 수비 능력. 숙련도가 낮은 위치에서는 전부 깎인다 (숙련도 0.9 → -4). */
export function fielding(player: Player, position: string): Fielding {
  const fit = positionRatings(player)[position as FieldingPosition] ?? 0;
  const base = player.defense - (1 - fit) * 40;
  const a = spread(player.id, 21) * 6;
  const b = spread(player.id, 22) * 6;
  const c = spread(player.id, 23) * 6;
  return {
    range: clampRating(base + a),
    hands: clampRating(base + b),
    arm: clampRating(base + c),
    turn: clampRating(base - (a + b + c) / 3),
  };
}

/** 주자 묶기. 좌완은 1루 주자를 정면으로 보므로 유리하다. */
export const holdRating = (pitcher: Pitcher) =>
  pitcher.hold ??
  clampRating(
    pitcher.control +
      spread(pitcher.id, 31) * 10 +
      (pitcher.throws === '좌' ? 6 : 0),
  );

/** 라인업 규칙 위반 목록. 비어 있으면 출전 가능하다. */
export function lineupProblems(lineup: LineupEntry[]): string[] {
  const problems: string[] = [];
  if (lineup.length !== 9) problems.push('타순은 9명이어야 합니다.');
  for (const position of LINEUP_POSITIONS) {
    const count = lineup.filter((entry) => entry.position === position).length;
    if (count !== 1)
      problems.push(
        `${POSITION_NAME[position]} ${count ? '중복' : '비어 있음'}`,
      );
  }
  for (const entry of lineup) {
    if (!canPlay(entry.player, entry.position))
      problems.push(
        `${entry.player.name}은(는) ${POSITION_NAME[entry.position] ?? entry.position}로 출전할 수 없습니다.`,
      );
  }
  return problems;
}

/** 자리가 귀한 위치부터 채운다. 포수와 유격수가 막히면 나머지는 볼 필요가 없다. */
const FILL_ORDER: LineupPosition[] = [
  'C',
  'SS',
  'CF',
  '2B',
  '3B',
  'RF',
  'LF',
  '1B',
  'DH',
];

/**
 * 타순(선수 순서)을 유지한 채 9개 위치를 배정한다. 불가능하면 null.
 * preferred 는 선수 id → 원래 위치. 가능하면 원래 위치를 지킨다.
 */
export function assignPositions(
  players: Player[],
  preferred: Record<string, string> = {},
): LineupPosition[] | null {
  if (players.length !== 9) return null;
  const result: (LineupPosition | null)[] = players.map(() => null);
  const rank = (player: Player, position: LineupPosition) =>
    (preferred[player.id] === position ? 10 : 0) +
    (position === 'DH' ? 0 : (positionRatings(player)[position] ?? 0) * 5) +
    player.defense / 100;
  const search = (step: number): boolean => {
    if (step === FILL_ORDER.length) return true;
    const position = FILL_ORDER[step];
    const candidates = players
      .map((player, index) => ({ player, index }))
      .filter(
        ({ player, index }) =>
          result[index] === null && canPlay(player, position),
      )
      // 지명타자는 수비가 가장 약한 남은 선수에게 준다.
      .sort((a, b) =>
        position === 'DH'
          ? (preferred[b.player.id] === 'DH' ? 1 : 0) -
              (preferred[a.player.id] === 'DH' ? 1 : 0) ||
            a.player.defense - b.player.defense
          : rank(b.player, position) - rank(a.player, position),
      );
    for (const { index } of candidates) {
      result[index] = position;
      if (search(step + 1)) return true;
      result[index] = null;
    }
    return false;
  };
  return search(0) ? (result as LineupPosition[]) : null;
}

export interface DefensePlan {
  /** 타순 자리별 새 위치. */
  positions: LineupPosition[];
  /** 수비에 나설 수 없어 벤치 선수로 바꿔야 하는 타순 자리. */
  replacements: { index: number; player: Player }[];
}

/**
 * 경기 중 수비 정리. 대타·대주자로 비거나 자격이 안 맞는 위치를 채운다.
 * 지명타자 자리는 고정이다 — 지명타자가 수비에 나가면 지명타자를 잃는다(야구규칙 5.11)는
 * 규칙을 두지 않는 대신, 아예 옮기지 않는다. 교체 인원이 가장 적고 위치 이동이 가장 적은 안을 고른다.
 */
export function planDefense(team: TeamState): DefensePlan | null {
  const dhIndex = team.lineup.findIndex((entry) => entry.position === 'DH');
  const bench = team.bench.filter(
    (player) => !team.usedPlayerIds.includes(player.id),
  );
  const slots = team.lineup
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => index !== dhIndex);
  let best: {
    cost: number;
    placed: Map<FieldingPosition, { slot: number | null; player: Player }>;
  } | null = null;
  const placed = new Map<
    FieldingPosition,
    { slot: number | null; player: Player }
  >();
  const usedSlots = new Set<number>();
  const usedBench = new Set<string>();
  const order = FILL_ORDER.filter(
    (position): position is FieldingPosition => position !== 'DH',
  );

  const search = (step: number, cost: number) => {
    if (best && cost >= best.cost) return;
    if (step === order.length) {
      best = { cost, placed: new Map(placed) };
      return;
    }
    const position = order[step];
    for (const { entry, index } of slots) {
      if (usedSlots.has(index) || !canPlay(entry.player, position)) continue;
      usedSlots.add(index);
      placed.set(position, { slot: index, player: entry.player });
      const fit = positionRatings(entry.player)[position] ?? 0;
      search(
        step + 1,
        cost + (entry.position === position ? 0 : 1) + (1 - fit) * 2,
      );
      placed.delete(position);
      usedSlots.delete(index);
    }
    for (const player of bench) {
      if (usedBench.has(player.id) || !canPlay(player, position)) continue;
      usedBench.add(player.id);
      placed.set(position, { slot: null, player });
      search(
        step + 1,
        cost + 10 + (1 - (positionRatings(player)[position] ?? 0)) * 2,
      );
      placed.delete(position);
      usedBench.delete(player.id);
    }
  };
  search(0, 0);
  if (!best) return null;
  const plan = best as {
    placed: Map<FieldingPosition, { slot: number | null; player: Player }>;
  };
  const positions: LineupPosition[] = team.lineup.map(
    (entry) => entry.position as LineupPosition,
  );
  const open = slots
    .map(({ index }) => index)
    .filter(
      (index) => ![...plan.placed.values()].some((item) => item.slot === index),
    );
  const replacements: DefensePlan['replacements'] = [];
  for (const [position, item] of plan.placed) {
    if (item.slot !== null) positions[item.slot] = position;
    else {
      const index = open.shift()!;
      positions[index] = position;
      replacements.push({ index, player: item.player });
    }
  }
  if (dhIndex >= 0) positions[dhIndex] = 'DH';
  return { positions, replacements };
}

/** 지금 라인업이 수비에 그대로 나갈 수 있는가. */
export function defenseReady(team: TeamState): boolean {
  return (
    lineupProblems(team.lineup).length === 0 &&
    team.lineup.every((entry) => !entry.sub)
  );
}

