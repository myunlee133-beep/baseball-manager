import type { HiddenBatter, Tendencies } from './ratings';
export type Side = 'away' | 'home';
export type Half = 'top' | 'bottom';
/** 타격은 기본 타격 하나다. 번트와 도루는 별도 작전으로 남긴다. id 'balanced' 는 저장 데이터 호환을 위해 유지. */
export type BattingStrategy =
  | 'balanced'
  | 'bunt'
  | 'squeeze'
  | 'hit-and-run'
  | 'steal';
/** attack·corners·chase 는 투구 배합, pitchout·intentional 은 OOTP 식 수비 작전이다. */
export type PitchingStrategy =
  | 'attack'
  | 'corners'
  | 'chase'
  | 'pitchout'
  | 'intentional';
export type PitchLocation =
  | 'count-strike'
  | 'borderline-strike'
  | 'borderline-ball'
  | 'chase-ball';
export type CountKey = `${0 | 1 | 2 | 3}-${0 | 1 | 2}`;
export interface PitchCount {
  balls: number;
  strikes: number;
}
export type SwingProfile = Record<CountKey, Record<PitchLocation, number>>;
export type PlayKind =
  | 'single'
  | 'double'
  | 'triple'
  | 'home-run'
  | 'ground-out'
  | 'fly-out'
  | 'pop-out'
  | 'line-out'
  | 'double-play'
  | 'fielders-choice'
  | 'error'
  | 'sac-fly'
  | 'bunt'
  | 'bunt-out'
  | 'foul'
  | 'foul-out';
/** 수비 위치. P 는 타구 처리에만 쓰고 라인업에는 없다. */
export type FieldingPosition =
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'LF'
  | 'CF'
  | 'RF';
export type LineupPosition = FieldingPosition | 'DH';
export interface PitchEvent {
  number: number;
  batterName: string;
  pitcherName: string;
  strategy: PitchingStrategy;
  location: PitchLocation;
  perceived: PitchLocation;
  countBefore: PitchCount;
  countAfter: PitchCount;
  swingProbability: number;
  swung: boolean;
  result:
    | 'ball'
    | 'called-strike'
    | 'swinging-strike'
    | 'foul'
    | 'foul-out'
    | 'in-play'
    | 'home-run'
    | 'walk'
    | 'hit-by-pitch'
    | 'strikeout';
  plateAppearanceEnded: boolean;
  // Presentation only (animation): never feeds back into the simulation.
  play?: { kind: PlayKind; angle: number };
  /** 타구 정보. 연출과 기록에 쓰고 시뮬레이션으로 되먹이지 않는다. */
  batted?: {
    exitVelocity: number;
    launchAngle: number;
    sprayAngle: number;
    type: string;
    fielder: string | null;
  };
  steal?: { from: 0 | 1 | 2; success: boolean };
}
export type GameStatus = 'playing' | 'final';
export type SubstitutionType = 'pinch-hitter' | 'pinch-runner' | 'defense';

/** 화면에 보이는 타자 능력치는 20-80 스케일 다섯 개뿐이다. */
export interface Player {
  id: string;
  name: string;
  position: string;
  bats: '좌' | '우';
  /** 삼진 회피 · 인플레이 타구 질 · 스윙 컨택률의 평균. 세 히든 스탯은 화면에 없다. */
  contact: number;
  /** 보더라인 선구 · 인내심의 평균. */
  eye: number;
  power: number;
  speed: number;
  defense: number;
  fatigue: number;
  /** 지정하면 자동 파생 대신 이 값을 쓴다. 스카우팅·에디터용. */
  hidden?: Partial<HiddenBatter>;
  /** 타구 성향. 지정하지 않으면 id 에서 고정 생성한다. */
  tendencies?: Partial<Tendencies>;
  swingProfile?: SwingProfile;
  /** 출전 가능한 수비 위치와 숙련도(0~1). 없으면 position 에서 파생한다. 목록에 없는 위치로는 출전할 수 없다. */
  positions?: Partial<Record<FieldingPosition, number>>;
}

/** 투수 능력치도 20-80 스케일 네 개다. */
export interface Pitcher {
  id: string;
  name: string;
  throws: '좌' | '우';
  role: '선발' | '중계' | '마무리';
  /** 헛스윙을 만든다. */
  velocity: number;
  /** 피BABIP 을 낮춘다. */
  stuff: number;
  /** 의도한 곳에 던지게 해 볼넷을 줄이고 삼진을 늘린다. */
  control: number;
  stamina: number;
  /** 주자 묶기(견제·퀵모션). 없으면 제구에서 파생한다. */
  hold?: number;
  pitchCount: number;
  fatigue: number;
}

export interface LineupEntry {
  player: Player;
  position: string;
  /** 대타·대주자로 들어와 아직 수비 위치를 받지 않았다. 다음 수비 전에 정리된다. */
  sub?: 'PH' | 'PR';
}

export interface TeamState {
  id: string;
  name: string;
  shortName: string;
  city: string;
  color: string;
  lineup: LineupEntry[];
  bench: Player[];
  pitchers: Pitcher[];
  /** 2군은 1군과 분리해 보관하며, 콜업/말소 시 서로 선수를 맞교환한다. */
  minorHitters: Player[];
  minorPitchers: Pitcher[];
  currentPitcherId: string;
  usedPlayerIds: string[];
  usedPitcherIds: string[];
}

export interface BattingLine {
  games: number;
  pa: number;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  so: number;
  rbi: number;
  sacBunts: number;
  sacFlies: number;
  stolenBases: number;
  caughtStealing: number;
  runs: number;
  hitByPitch: number;
  intentionalWalks: number;
  groundedIntoDp: number;
  /** KBO 공식 기록 결승타. */
  gameWinningRbi: number;
  /** 수비 기록. 타자 줄에 함께 둔다. */
  errors: number;
  passedBalls: number;
}

export interface PitchingLine {
  games: number;
  starts: number;
  outs: number;
  pitches: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  walks: number;
  strikeouts: number;
  runsAllowed: number;
  earnedRuns: number;
  battersFaced: number;
  hitBatters: number;
  intentionalWalks: number;
  wildPitches: number;
  balks: number;
  wins: number;
  losses: number;
  saves: number;
  holds: number;
  blownSaves: number;
  qualityStarts: number;
}

/** 투수 한 번의 등판. 세이브·홀드·블론세이브 판정에 쓴다. */
export interface Appearance {
  pitcherId: string;
  side: Side;
  /** 등판 시점 리드(투수 팀 기준). 음수면 지고 있었다. */
  entryLead: number;
  /** 등판 시점이 세이브 상황이었나 (3점 차 이내 리드, 또는 동점 주자가 누상·타석·대기 타석). */
  saveSituation: boolean;
  /** 동점 주자가 누상·타석·대기 타석에 있었다. 이때는 1/3 이닝만 막아도 세이브다. */
  tyingRunNear: boolean;
  blown: boolean;
  /** 강판 시점 리드. 아직 던지는 중이면 null. */
  exitLead: number | null;
}

export interface GameDecisions {
  win: string | null;
  loss: string | null;
  save: string | null;
  holds: string[];
  blownSaves: string[];
  gameWinningRbi: string | null;
}

export interface Runner {
  playerId: string;
  lineupIndex: number;
  name: string;
  speed: number;
  /** 이 주자를 내보낸 투수. 득점하면 이 투수의 실점이다 (승계 주자). */
  pitcherId?: string;
  /** 실책으로 나간 주자. 득점해도 비자책이다. */
  unearned?: boolean;
}

export interface ScoreState {
  away: number;
  home: number;
}

export interface LineScore {
  away: number[];
  home: number[];
}

export interface GameLog {
  id: number;
  inning: number;
  half: Half;
  text: string;
  tone: 'neutral' | 'hit' | 'run' | 'out' | 'change';
}

export interface GameState {
  inning: number;
  half: Half;
  outs: number;
  bases: [Runner | null, Runner | null, Runner | null];
  score: ScoreState;
  hits: ScoreState;
  errors: ScoreState;
  lineScore: LineScore;
  battingIndex: ScoreState;
  teams: Record<Side, TeamState>;
  status: GameStatus;
  rngSeed: number;
  plateAppearance: number;
  count: PitchCount;
  pitchNumber: number;
  lastPitch: PitchEvent | null;
  logs: GameLog[];
  lastPlay: string;
  battingStats: Record<string, BattingLine>;
  pitchingStats: Record<string, PitchingLine>;
  /** 잔루. */
  lob: ScoreState;
  /** 실책이 없었다면 잡았을 아웃 수. 이닝 재구성으로 자책점을 가른다 (야구규칙 9.16). */
  ghostOuts: number;
  appearances: Appearance[];
  /** 마지막 역전·리드 순간. 승·패·결승타의 근거다. */
  lastLeadChange: {
    side: Side;
    winnerPitcherId: string;
    loserPitcherId: string;
    batterId: string | null;
  } | null;
  decisions: GameDecisions | null;
}

export interface PlayResult {
  state: GameState;
  battingStrategy: BattingStrategy;
  pitchingStrategy: PitchingStrategy;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  /** KBO 무승부. 승률 계산(승 ÷ (승+패))에서 빠진다. */
  ties: number;
  runsFor: number;
  runsAgainst: number;
}

export interface ScheduleGame {
  id: string;
  day: number;
  homeId: string;
  awayId: string;
  status: 'scheduled' | 'final';
  score?: { home: number; away: number };
}

export interface SeasonPlayerLine {
  batting: BattingLine;
  pitching: PitchingLine;
}

export interface SeasonState {
  version: 5;
  day: number;
  totalDays: number;
  userTeamId: string;
  status: 'dashboard' | 'playing' | 'complete';
  teams: Record<string, TeamState>;
  records: Record<string, TeamRecord>;
  schedule: ScheduleGame[];
  playerStats: Record<string, SeasonPlayerLine>;
  activeGameId: string | null;
  activeGame: GameState | null;
  lastResult: ScheduleGame | null;
}

