/**
 * 리그 측정. AI 끼리 경기를 돌려 리그 성적과 타석 내용물을 집계한다.
 * league-calib.ts(보정용 출력)와 league-test.ts(범위 검사)가 함께 쓴다.
 */
import { aiPrepare, battingSide, chooseAiBattingStrategy, chooseAiPitchingStrategy, createGame, fieldingSide, playPitch } from '../../vendor/pro-baseball/engine';
import { createBlueTeam, createRedTeam } from '../../vendor/pro-baseball/data';
import type { GameState, PitchingStrategy } from '../../vendor/pro-baseball/types';

export const COUNTS = ['0-0', '1-0', '2-0', '3-0', '0-1', '1-1', '2-1', '3-1', '0-2', '1-2', '2-2', '3-2'] as const;
type CountRow = { n: number; zone: number; swing: number } & Record<PitchingStrategy, number>;

export interface Tally {
  games: number; runs: number; pa: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; so: number;
  pitches: number; spPitches: number; spOuts: number; starts: number; arms: number; rpPitches: number; rpOuts: number; rpApps: number;
  n: number; zone: number; zsw: number; osw: number; zmiss: number; omiss: number; kLook: number; kAll: number;
  errors: number; gidp: number; sb: number; cs: number; hbp: number; wp: number; pb: number; sh: number; sf: number; er: number; ties: number; saves: number; holds: number; ibb: number; lob: number;
  byCount: Record<string, CountRow>;
}

export function blankTally(): Tally {
  return {
    games: 0, runs: 0, pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, so: 0,
    pitches: 0, spPitches: 0, spOuts: 0, starts: 0, arms: 0, rpPitches: 0, rpOuts: 0, rpApps: 0,
    n: 0, zone: 0, zsw: 0, osw: 0, zmiss: 0, omiss: 0, kLook: 0, kAll: 0,
    errors: 0, gidp: 0, sb: 0, cs: 0, hbp: 0, wp: 0, pb: 0, sh: 0, sf: 0, er: 0, ties: 0, saves: 0, holds: 0, ibb: 0, lob: 0,
    byCount: Object.fromEntries(COUNTS.map((c) => [c, { n: 0, zone: 0, swing: 0, attack: 0, corners: 0, chase: 0, pitchout: 0, intentional: 0 }])),
  };
}

/** 시드 하나로 한 경기를 돌려 t 에 더한다. */
export function playInto(seed: number, t: Tally) {
  let st: GameState = createGame(createBlueTeam(), createRedTeam(), seed);
  const starters = new Set([st.teams.home.currentPitcherId, st.teams.away.currentPitcherId]);
  let guard = 0;
  while (st.status === 'playing' && guard++ < 30000) {
    st = aiPrepare(st, fieldingSide(st));
    st = aiPrepare(st, battingSide(st));
    const row = t.byCount[`${st.count.balls}-${st.count.strikes}`];
    const before = st.pitchNumber;
    const batting = chooseAiBattingStrategy(st);
    const pitching = chooseAiPitchingStrategy(st);
    st = playPitch(st, batting, pitching).state;
    if (st.pitchNumber === before) continue;
    const p = st.lastPitch!;
    const inZ = p.location === 'count-strike' || p.location === 'borderline-strike';
    const missed = p.swung && (p.result === 'swinging-strike' || p.result === 'strikeout');
    row.n += 1; row[pitching] += 1; if (inZ) row.zone += 1; if (p.swung) row.swing += 1;
    t.n += 1; if (inZ) t.zone += 1;
    if (p.swung) { if (inZ) { t.zsw += 1; if (missed) t.zmiss += 1; } else { t.osw += 1; if (missed) t.omiss += 1; } }
    if (p.result === 'strikeout') { t.kAll += 1; if (!p.swung) t.kLook += 1; }
  }
  t.games += 1; t.runs += st.score.home + st.score.away;
  t.errors += st.errors.home + st.errors.away; t.lob += st.lob.home + st.lob.away;
  if (st.score.home === st.score.away) t.ties += 1;
  for (const l of Object.values(st.battingStats)) {
    t.pa += l.pa; t.ab += l.ab; t.h += l.h; t.d2 += l.doubles; t.d3 += l.triples; t.hr += l.hr; t.bb += l.bb; t.so += l.so;
    t.gidp += l.groundedIntoDp; t.sb += l.stolenBases; t.cs += l.caughtStealing; t.hbp += l.hitByPitch; t.pb += l.passedBalls; t.sh += l.sacBunts; t.sf += l.sacFlies;
  }
  for (const [id, l] of Object.entries(st.pitchingStats)) {
    t.pitches += l.pitches; t.wp += l.wildPitches; t.er += l.earnedRuns; t.saves += l.saves; t.holds += l.holds; t.ibb += l.intentionalWalks;
    if (l.pitches === 0) continue;
    t.arms += 1;
    if (starters.has(id)) { t.spPitches += l.pitches; t.spOuts += l.outs; t.starts += 1; }
    else { t.rpPitches += l.pitches; t.rpOuts += l.outs; t.rpApps += 1; }
  }
}

export function metrics(t: Tally) {
  const bip = t.ab - t.so - t.hr;
  const tb = (t.h - t.d2 - t.d3 - t.hr) + t.d2 * 2 + t.d3 * 3 + t.hr * 4;
  return {
    타율: t.h / t.ab, 출루율: (t.h + t.bb) / t.pa, 장타율: tb / t.ab,
    '삼진%': t.so / t.pa * 100, '볼넷%': t.bb / t.pa * 100, '홈런%': t.hr / t.pa * 100, BABIP: (t.h - t.hr) / bip,
    '투구/타석': t.pitches / t.pa, 경기당득점: t.runs / t.games,
    선발투구수: t.spPitches / t.starts, 선발이닝: t.spOuts / t.starts / 3, 팀당투수: t.arms / t.games / 2,
    구원투구수: t.rpPitches / t.rpApps, 구원이닝: t.rpOuts / t.rpApps / 3,
    '존밖스윙%': t.osw / (t.n - t.zone) * 100, '존안스윙%': t.zsw / t.zone * 100,
    '존밖컨택%': (t.osw - t.omiss) / t.osw * 100, '존안컨택%': (t.zsw - t.zmiss) / t.zsw * 100,
    '헛스윙%': (t.zmiss + t.omiss) / t.n * 100, '루킹삼진%': t.kLook / t.kAll * 100,
    팀당실책: t.errors / t.games / 2, 팀당병살: t.gidp / t.games / 2, 팀당도루시도: (t.sb + t.cs) / t.games / 2,
    '도루성공%': t.sb / Math.max(1, t.sb + t.cs) * 100, '사구%': t.hbp / t.pa * 100, 팀당폭투: t.wp / t.games / 2,
    팀당포일: t.pb / t.games / 2, 팀당희생번트: t.sh / t.games / 2, 팀당희생플라이: t.sf / t.games / 2,
    팀당고의사구: t.ibb / t.games / 2, 팀당잔루: t.lob / t.games / 2, '자책비율%': t.er / t.runs * 100,
    '무승부%': t.ties / t.games * 100, 경기당세이브: t.saves / t.games, 경기당홀드: t.holds / t.games,
  };
}
export type Metrics = ReturnType<typeof metrics>;

export const fmt = (key: string, v: number) =>
  ['타율', '출루율', '장타율', 'BABIP'].includes(key) ? v.toFixed(3).replace(/^0/, '') : v.toFixed(key === '투구/타석' ? 2 : 1);

