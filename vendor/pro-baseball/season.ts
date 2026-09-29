import {
  createBearsTeam,
  createBlueTeam,
  createFalconsTeam,
  generatedPlayerName,
  createKnightsTeam,
  createMarinersTeam,
  createOrbitsTeam,
  createRedTeam,
  createStarsTeam,
  createTigersTeam,
  createWolvesTeam,
} from './data';
import {
  createGame,
  emptyBattingLine,
  emptyPitchingLine,
  simulateGame,
} from './engine';
import { assignPositions } from './fielding';
import type {
  BattingLine,
  GameState,
  LineupEntry,
  Pitcher,
  PitchingLine,
  Player,
  ScheduleGame,
  SeasonPlayerLine,
  SeasonState,
  TeamRecord,
  TeamState,
} from './types';

const clone = <T>(value: T): T => structuredClone(value);
const blankBatting = emptyBattingLine;
const blankPitching = emptyPitchingLine;
const blankRecord = (): TeamRecord => ({
  wins: 0,
  losses: 0,
  ties: 0,
  runsFor: 0,
  runsAgainst: 0,
});

function buildSchedule(days: number): ScheduleGame[] {
  const clubs = [
    'blue',
    'red',
    'falcons',
    'bears',
    'tigers',
    'mariners',
    'knights',
    'stars',
    'orbits',
    'wolves',
  ];
  const schedule: ScheduleGame[] = [];
  let rotation = [...clubs];
  for (let day = 1; day <= days; day += 1) {
    for (let pair = 0; pair < clubs.length / 2; pair += 1) {
      const first = rotation[pair];
      const second = rotation[rotation.length - 1 - pair];
      const blueIsPlaying = first === 'blue' || second === 'blue';
      const blueAtHome = day % 2 === 1;
      const homeId = blueIsPlaying
        ? blueAtHome
          ? 'blue'
          : first === 'blue'
            ? second
            : first
        : (day + pair) % 2
          ? first
          : second;
      const awayId = homeId === first ? second : first;
      schedule.push({
        id: `d${day}-g${pair + 1}`,
        day,
        homeId,
        awayId,
        status: 'scheduled',
      });
    }
    rotation = [rotation[0], rotation.at(-1)!, ...rotation.slice(1, -1)];
  }
  return schedule;
}

export function createMiniSeason(totalDays = 24): SeasonState {
  const teams: Record<string, TeamState> = {
    blue: createBlueTeam(),
    red: createRedTeam(),
    falcons: createFalconsTeam(),
    bears: createBearsTeam(),
    tigers: createTigersTeam(),
    mariners: createMarinersTeam(),
    knights: createKnightsTeam(),
    stars: createStarsTeam(),
    orbits: createOrbitsTeam(),
    wolves: createWolvesTeam(),
  };
  return {
    version: 5,
    day: 1,
    totalDays,
    userTeamId: 'blue',
    status: 'dashboard',
    teams,
    records: Object.fromEntries(
      Object.keys(teams).map((id) => [id, blankRecord()]),
    ),
    schedule: buildSchedule(totalDays),
    playerStats: {},
    activeGameId: null,
    activeGame: null,
    lastResult: null,
  };
}

export function todayGames(season: SeasonState) {
  return season.schedule.filter((game) => game.day === season.day);
}

export function standingOrder(season: SeasonState, records = season.records) {
  return Object.values(season.teams).sort((a, b) => {
    const recordA = records[a.id];
    const recordB = records[b.id];
    const percentageA =
      recordA.wins / Math.max(1, recordA.wins + recordA.losses);
    const percentageB =
      recordB.wins / Math.max(1, recordB.wins + recordB.losses);
    if (percentageB !== percentageA) return percentageB - percentageA;
    return (
      recordB.runsFor -
      recordB.runsAgainst -
      (recordA.runsFor - recordA.runsAgainst)
    );
  });
}

function prepareTeamForGame(source: TeamState): TeamState {
  const team = clone(source);
  team.usedPlayerIds = [];
  team.usedPitcherIds = [];
  team.pitchers.forEach((pitcher) => {
    pitcher.pitchCount = 0;
  });
  const starter =
    team.pitchers
      .filter((pitcher) => pitcher.role === '선발')
      .sort((a, b) => a.fatigue - b.fatigue || b.stamina - a.stamina)[0] ??
    team.pitchers[0];
  team.currentPitcherId = starter.id;
  return team;
}

/**
 * 고른 9명과 타순으로 수비 위치를 짠다. 원래 맡던 위치를 우선 지키고,
 * 자격(fielding.ts)이 없는 위치에는 넣지 않는다. 불가능하면 null.
 */
export function planLineup(
  team: TeamState,
  lineupIds: string[],
): LineupEntry[] | null {
  const roster = new Map(
    [...team.lineup.map((entry) => entry.player), ...team.bench].map(
      (player) => [player.id, player],
    ),
  );
  const players = lineupIds.map((id) => roster.get(id));
  if (
    players.length !== 9 ||
    new Set(lineupIds).size !== 9 ||
    players.some((player) => !player)
  )
    return null;
  const preferred = Object.fromEntries(
    team.lineup.map((entry) => [entry.player.id, entry.position]),
  );
  const positions = assignPositions(players as Player[], preferred);
  return positions
    ? players.map((player, index) => ({
        player: { ...player! },
        position: positions[index],
      }))
    : null;
}

export function startTodayGame(
  source: SeasonState,
  lineupIds?: string[],
  starterId?: string,
): SeasonState {
  const season = clone(source);
  if (season.status !== 'dashboard') return source;
  const userGame = todayGames(season).find(
    (game) =>
      game.homeId === season.userTeamId || game.awayId === season.userTeamId,
  );
  if (!userGame) return source;
  if (lineupIds?.length === 9) {
    const userTeam = season.teams[season.userTeamId];
    const lineup = planLineup(userTeam, lineupIds);
    // 자격 없는 위치로만 짜지는 타순이면 경기를 시작하지 않는다.
    if (!lineup) return source;
    const roster = [
      ...userTeam.lineup.map((entry) => entry.player),
      ...userTeam.bench,
    ];
    const selectedIds = new Set(lineupIds);
    userTeam.lineup = lineup;
    userTeam.bench = roster
      .filter((player) => !selectedIds.has(player.id))
      .map((player) => ({ ...player }));
  }
  const home = prepareTeamForGame(season.teams[userGame.homeId]);
  const away = prepareTeamForGame(season.teams[userGame.awayId]);
  if (starterId) {
    const userSide = userGame.homeId === season.userTeamId ? 'home' : 'away';
    const userTeam = userSide === 'home' ? home : away;
    if (
      userTeam.pitchers.some(
        (pitcher) => pitcher.id === starterId && pitcher.role === '선발',
      )
    ) {
      userTeam.currentPitcherId = starterId;
    }
  }
  season.activeGameId = userGame.id;
  season.activeGame = createGame(home, away, season.day * 1_000_003 + 17);
  season.status = 'playing';
  return season;
}

function mergeBattingLine(target: BattingLine, incoming: BattingLine) {
  (Object.keys(target) as Array<keyof BattingLine>).forEach((key) => {
    target[key] += incoming[key] ?? 0;
  });
}

function mergePitchingLine(target: PitchingLine, incoming: PitchingLine) {
  (Object.keys(target) as Array<keyof PitchingLine>).forEach((key) => {
    target[key] += incoming[key] ?? 0;
  });
}

function mergeStats(season: SeasonState, game: GameState) {
  const entryFor = (playerId: string): SeasonPlayerLine => {
    season.playerStats[playerId] ??= {
      batting: blankBatting(),
      pitching: blankPitching(),
    };
    return season.playerStats[playerId];
  };
  Object.entries(game.battingStats).forEach(([playerId, line]) =>
    mergeBattingLine(entryFor(playerId).batting, line),
  );
  Object.entries(game.pitchingStats).forEach(([playerId, line]) =>
    mergePitchingLine(entryFor(playerId).pitching, line),
  );
}

/**
 * 경기 뒤 구단 상태. 피로·투구 수는 경기에서 가져오되, 라인업은 경기 전 감독이 짠 선발 라인업으로 되돌린다.
 * 경기 막판의 대타·대수비 배치가 다음 경기 선발로 넘어가면 자격 없는 위치가 생길 수 있다.
 */
function afterGame(before: TeamState, after: TeamState): TeamState {
  const team = clone(after);
  const latest = new Map(
    [...after.lineup.map((entry) => entry.player), ...after.bench].map(
      (player) => [player.id, player],
    ),
  );
  const starters = new Set(before.lineup.map((entry) => entry.player.id));
  team.lineup = before.lineup.map((entry) => ({
    player: clone(latest.get(entry.player.id) ?? entry.player),
    position: entry.position,
  }));
  team.bench = [...latest.values()]
    .filter((player) => !starters.has(player.id))
    .map(clone);
  return team;
}

function applyGameResult(
  season: SeasonState,
  scheduled: ScheduleGame,
  game: GameState,
) {
  const homeScore = game.score.home;
  const awayScore = game.score.away;
  season.teams[scheduled.homeId] = afterGame(
    season.teams[scheduled.homeId],
    game.teams.home,
  );
  season.teams[scheduled.awayId] = afterGame(
    season.teams[scheduled.awayId],
    game.teams.away,
  );
  season.records[scheduled.homeId].runsFor += homeScore;
  season.records[scheduled.homeId].runsAgainst += awayScore;
  season.records[scheduled.awayId].runsFor += awayScore;
  season.records[scheduled.awayId].runsAgainst += homeScore;
  if (homeScore > awayScore) {
    season.records[scheduled.homeId].wins += 1;
    season.records[scheduled.awayId].losses += 1;
  } else if (awayScore > homeScore) {
    season.records[scheduled.awayId].wins += 1;
    season.records[scheduled.homeId].losses += 1;
  } else {
    // KBO 무승부: 승률(승 ÷ (승+패))에서 빠진다.
    season.records[scheduled.homeId].ties += 1;
    season.records[scheduled.awayId].ties += 1;
  }
  scheduled.status = 'final';
  scheduled.score = { home: homeScore, away: awayScore };
  mergeStats(season, game);
}

function recoverTeam(team: TeamState) {
  const next = clone(team);
  [...next.lineup.map((entry) => entry.player), ...next.bench].forEach(
    (player) => {
      player.fatigue = Math.max(0, player.fatigue - 3);
    },
  );
  next.pitchers.forEach((pitcher) => {
    pitcher.fatigue = Math.max(0, pitcher.fatigue - 5);
    pitcher.pitchCount = 0;
  });
  return next;
}

export function recordFinishedUserGame(
  source: SeasonState,
  finalGame: GameState,
): SeasonState {
  if (finalGame.status !== 'final' || !source.activeGameId) return source;
  const season = clone(source);
  const userGame = season.schedule.find(
    (game) => game.id === season.activeGameId,
  );
  if (!userGame || userGame.status === 'final') return source;
  applyGameResult(season, userGame, finalGame);

  todayGames(season)
    .filter((game) => game.id !== userGame.id)
    .forEach((aiGame, index) => {
      const aiHome = prepareTeamForGame(season.teams[aiGame.homeId]);
      const aiAway = prepareTeamForGame(season.teams[aiGame.awayId]);
      const aiFinal = simulateGame(
        createGame(aiHome, aiAway, season.day * 1_000_003 + 71 + index),
      );
      applyGameResult(season, aiGame, aiFinal);
    });

  season.lastResult = clone(userGame);
  season.activeGameId = null;
  season.activeGame = null;
  Object.keys(season.teams).forEach((id) => {
    season.teams[id] = recoverTeam(season.teams[id]);
  });
  season.day += 1;
  season.status = season.day > season.totalDays ? 'complete' : 'dashboard';
  return season;
}

export function updateActiveGame(
  source: SeasonState,
  game: GameState,
): SeasonState {
  if (source.status !== 'playing') return source;
  const season = clone(source);
  season.activeGame = game;
  return season;
}

export function swapRosterLevel(
  source: SeasonState,
  playerId: string,
  direction: 'up' | 'down',
): SeasonState {
  if (source.status !== 'dashboard') return source;
  const season = clone(source);
  const team = season.teams[season.userTeamId];
  const activeHitters = [
    ...team.lineup.map((entry) => entry.player),
    ...team.bench,
  ];
  const activePitchers = team.pitchers;
  const from =
    direction === 'up'
      ? [...team.minorHitters, ...team.minorPitchers]
      : [...activeHitters, ...activePitchers];
  const incoming = from.find((player) => player.id === playerId);
  if (!incoming) return source;
  const isPitcher = 'stuff' in incoming;
  if (direction === 'up') {
    if (isPitcher) {
      const outgoing = team.pitchers.sort((a, b) => b.fatigue - a.fatigue)[0];
      if (!outgoing) return source;
      team.pitchers = team.pitchers
        .filter((item) => item.id !== outgoing.id)
        .concat(incoming as Pitcher);
      team.minorPitchers = team.minorPitchers
        .filter((item) => item.id !== playerId)
        .concat(outgoing);
    } else {
      const outgoing = team.bench.sort((a, b) => b.fatigue - a.fatigue)[0];
      if (!outgoing) return source;
      team.bench = team.bench
        .filter((item) => item.id !== outgoing.id)
        .concat(incoming as import('./types').Player);
      team.minorHitters = team.minorHitters
        .filter((item) => item.id !== playerId)
        .concat(outgoing);
    }
  } else if (isPitcher) {
    const incomingMinor = team.minorPitchers.sort(
      (a, b) => a.fatigue - b.fatigue,
    )[0];
    if (!incomingMinor) return source;
    team.pitchers = team.pitchers
      .filter((item) => item.id !== playerId)
      .concat(incomingMinor);
    team.minorPitchers = team.minorPitchers
      .filter((item) => item.id !== incomingMinor.id)
      .concat(incoming as Pitcher);
  } else {
    const incomingMinor = team.minorHitters.sort(
      (a, b) => a.fatigue - b.fatigue,
    )[0];
    if (!incomingMinor) return source;
    const lineupIndex = team.lineup.findIndex(
      (entry) => entry.player.id === playerId,
    );
    if (lineupIndex >= 0) {
      team.lineup[lineupIndex] = {
        ...team.lineup[lineupIndex],
        player: incomingMinor,
      };
    } else {
      team.bench = team.bench
        .filter((item) => item.id !== playerId)
        .concat(incomingMinor);
    }
    team.minorHitters = team.minorHitters
      .filter((item) => item.id !== incomingMinor.id)
      .concat(incoming as import('./types').Player);
  }
  return season;
}

export function saveSeason(season: SeasonState) {
  if (typeof window !== 'undefined')
    window.localStorage.setItem('nine-mini-season-v2', JSON.stringify(season));
}

export function loadSeason(): SeasonState | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem('nine-mini-season-v2');
    if (!stored) return null;
    const raw: unknown = JSON.parse(stored);
    if (!raw || typeof raw !== 'object') return null;
    const version = (raw as { version?: number }).version;
    if (version !== 2 && version !== 3 && version !== 4 && version !== 5)
      return null;
    return migrateSeason(raw as SeasonState);
  } catch {
    return null;
  }
}

export function clearSavedSeason() {
  if (typeof window !== 'undefined')
    window.localStorage.removeItem('nine-mini-season-v2');
}

/** 구 1-100 스케일 저장본을 20-80 으로 옮긴다. 이미 옮겼으면 건드리지 않는다. */
const toScale = (value: number) =>
  Math.max(20, Math.min(80, Math.round(50 + (value - 65) * 0.7)));
/** 구 저장본은 능력치가 대체로 45 이상이다. 20-80 로 변환된 값과 구분하는 기준으로 쓴다. */
const looksLegacy = (player: { contact?: number; eye?: number }) =>
  (player.contact ?? 0) > 82 ||
  (player.eye ?? 0) > 82 ||
  (player as { babip?: number }).babip !== undefined;

function legacyHitter(player: Player & { babip?: number }) {
  if (!looksLegacy(player)) return;
  player.contact = toScale(player.contact);
  player.power = toScale(player.power);
  player.eye = toScale(player.eye);
  player.speed = toScale(player.speed);
  player.defense = toScale(player.defense);
  // 구 babip 은 정의가 달라 버린다. 새 엔진에서는 컨택에서 파생된다.
  delete player.babip;
}

function legacyPitcher(item: Pitcher & { velocity?: number }) {
  if (item.velocity !== undefined) return;
  const tilt =
    ((item.id.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) % 9) - 4) /
    4;
  item.velocity = toScale(item.stuff + tilt * 9);
  item.stuff = toScale(item.stuff - tilt * 9);
  item.control = toScale(item.control);
  item.stamina = toScale(item.stamina);
}

// Existing completed statistics remain intact; an old active game resumes at 0-0.
export function migrateSeason(source: SeasonState): SeasonState {
  const season = clone(source);
  const migrateTeam = (team: TeamState) => {
    [...team.lineup.map((entry) => entry.player), ...team.bench].forEach(
      (player) => {
        legacyHitter(player);
      },
    );
    while (team.lineup.length + team.bench.length < 15) {
      const sourcePlayer = team.bench[0] ?? team.lineup[0]?.player;
      if (!sourcePlayer) break;
      const index = team.lineup.length + team.bench.length;
      team.bench.push({
        ...sourcePlayer,
        id: `${team.id}-legacy-ah${index}`,
        name: `보강 ${String(index).padStart(2, '0')}`,
        fatigue: 0,
      });
    }
    team.pitchers.forEach(legacyPitcher);
    while (team.pitchers.length < 11) {
      const sourcePitcher = team.pitchers[0];
      if (!sourcePitcher) break;
      const index = team.pitchers.length;
      team.pitchers.push({
        ...sourcePitcher,
        id: `${team.id}-legacy-ap${index}`,
        name: `보강투수 ${String(index).padStart(2, '0')}`,
        fatigue: 0,
        pitchCount: 0,
      });
    }
    team.minorHitters ??= Array.from({ length: 15 }, (_, index) => ({
      ...team.bench[index % Math.max(1, team.bench.length)],
      id: `${team.id}-legacy-mh${index + 1}`,
      name: `육성 ${String(index + 1).padStart(2, '0')}`,
      fatigue: 0,
    }));
    team.minorPitchers ??= Array.from({ length: 11 }, (_, index) => ({
      ...team.pitchers[index % Math.max(1, team.pitchers.length)],
      id: `${team.id}-legacy-mp${index + 1}`,
      name: `육성투수 ${String(index + 1).padStart(2, '0')}`,
      fatigue: 0,
      pitchCount: 0,
    }));
    const refreshGeneratedNames = (
      players: Array<{ id: string; name: string }>,
      role: 'hitter' | 'pitcher',
    ) => {
      players.forEach((player) => {
        if (/^(육성투수|육성|보강투수|보강)\s*\d+/.test(player.name))
          player.name = generatedPlayerName(player.id, role);
      });
    };
    refreshGeneratedNames(
      [
        ...team.lineup.map((entry) => entry.player),
        ...team.bench,
        ...team.minorHitters,
      ],
      'hitter',
    );
    refreshGeneratedNames([...team.pitchers, ...team.minorPitchers], 'pitcher');
  };
  Object.values(season.teams).forEach(migrateTeam);
  Object.values(season.records).forEach((record) => {
    record.ties ??= 0;
  });
  Object.values(season.playerStats).forEach((line) => {
    line.batting = { ...blankBatting(), ...line.batting };
    line.pitching = { ...blankPitching(), ...line.pitching };
  });
  const game = season.activeGame;
  if (game) {
    Object.values(game.teams).forEach(migrateTeam);
    game.count ??= { balls: 0, strikes: 0 };
    game.pitchNumber ??= Object.values(game.pitchingStats).reduce(
      (sum, line) => sum + line.pitches,
      0,
    );
    game.lastPitch ??= null;
    Object.entries(game.battingStats).forEach(([id, line]) => {
      game.battingStats[id] = { ...blankBatting(), ...line };
    });
    Object.entries(game.pitchingStats).forEach(([id, line]) => {
      game.pitchingStats[id] = { ...blankPitching(), ...line };
    });
    // Legacy logs shared plate-appearance ids; make restored log keys unique.
    if (Number((source as unknown as { version?: number }).version) < 4)
      game.logs.forEach((log, index) => {
        log.id = game.logs.length - index;
      });
  }
  season.version = 5;
  return season;
}

