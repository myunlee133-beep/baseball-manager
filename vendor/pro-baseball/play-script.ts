import {
  battingSide,
  fieldingSide,
  getCurrentBatter,
  getCurrentPitcher,
} from './engine';
import type {
  GameState,
  PitchEvent,
  PitchLocation,
  PlayKind,
  Side,
} from './types';

// Top-down field in feet: x → 1루 쪽, y → 중견수 쪽, home plate at the origin.
export type FieldPoint = [number, number];
// Field point plus height above the ground, in feet.
export type Point3 = [number, number, number];

export const FIELD_SPOTS: Record<string, FieldPoint> = {
  C: [0, -7],
  '1B': [68, 78],
  '2B': [58, 143],
  SS: [-58, 143],
  '3B': [-68, 78],
  LF: [-160, 250],
  CF: [0, 305],
  RF: [160, 250],
};
export const BASES: FieldPoint[] = [
  [63.6, 63.6],
  [0, 127.3],
  [-63.6, 63.6],
];
export const MOUND: FieldPoint = [0, 60.5];
export const HOME: FieldPoint = [0, 0];

export interface Track {
  id: string;
  kind: 'ball' | 'runner' | 'fielder' | 'pose';
  pose?: 'windup' | 'swing' | 'leave';
  label?: string;
  side?: Side;
  points: Point3[];
  start: number;
  duration: number;
  easing: string;
  fade?: boolean;
}

export interface PlayScript {
  tracks: Track[];
  duration: number;
  result: PitchEvent['result'];
  playKind?: PlayKind;
  pitchLocation: PitchLocation;
  contactAt?: number;
  // Static nameplates replaced by a moving token while the play runs.
  hidden: string[];
}

const PLATE_TARGET: Record<PitchLocation, [number, number]> = {
  'count-strike': [0, 2.6],
  'borderline-strike': [0.75, 3.2],
  'borderline-ball': [1.2, 1.7],
  'chase-ball': [1.8, 0.9],
};
const RELEASE = 260;
const PITCH_FLIGHT = 380;
const INFIELD = ['P', '1B', '2B', 'SS', '3B'];
const OUTFIELD = ['LF', 'CF', 'RF'];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const polar = (angle: number, distance: number): FieldPoint => [
  distance * Math.sin((angle * Math.PI) / 180),
  distance * Math.cos((angle * Math.PI) / 180),
];
const at = ([x, y]: FieldPoint, h = 0): Point3 => [x, y, h];
const spotOf = (position: string): FieldPoint =>
  position === 'P' ? MOUND : FIELD_SPOTS[position];
const distance = (a: FieldPoint, b: FieldPoint) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (positions: string[], target: FieldPoint) =>
  positions.reduce((best, position) =>
    distance(spotOf(position), target) < distance(spotOf(best), target)
      ? position
      : best,
  );
// Base index: −1 = batter's box, 0–2 = 1루–3루, 3 = scored.
const baseSpot = (base: number): FieldPoint =>
  base < 0 || base > 2 ? HOME : BASES[base];
const legTime = (speed: number) => 520 - speed * 1.5;

function flight(from: Point3, to: Point3, peak: number, steps = 18): Point3[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return [
      lerp(from[0], to[0], t),
      lerp(from[1], to[1], t),
      lerp(from[2], to[2], t) + 4 * peak * t * (1 - t),
    ];
  });
}

function grounder(from: Point3, to: Point3, steps = 18): Point3[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return [
      lerp(from[0], to[0], t),
      lerp(from[1], to[1], t),
      Math.abs(Math.sin(t * Math.PI * 3)) * 5 * (1 - t),
    ];
  });
}

function basePath(from: number, to: number): Point3[] {
  const points = [at(baseSpot(from))];
  for (let base = from + 1; base <= to; base += 1)
    points.push(at(baseSpot(base)));
  return points;
}

// Turns one pitch (prev → next) into timed tracks. Anything else — simulations, substitutions — returns null.
export function buildPlayScript(
  prev: GameState,
  next: GameState,
): PlayScript | null {
  const pitch = next.lastPitch;
  if (
    !pitch ||
    prev.status !== 'playing' ||
    next.pitchNumber !== prev.pitchNumber + 1
  )
    return null;
  const side = battingSide(prev);
  const defense = fieldingSide(prev);
  const batter = getCurrentBatter(prev);
  const tracks: Track[] = [];
  const hidden = new Set<string>();
  const nameAt = (position: string) =>
    position === 'P'
      ? getCurrentPitcher(prev).name
      : prev.teams[defense].lineup.find((entry) => entry.position === position)
          ?.player.name;
  const addBall = (
    id: string,
    points: Point3[],
    start: number,
    duration: number,
  ) => {
    tracks.push({
      id,
      kind: 'ball',
      points,
      start,
      duration,
      easing: 'linear',
    });
    return start + duration;
  };
  const addFielder = (
    position: string,
    points: Point3[],
    start: number,
    duration: number,
  ) => {
    if (hidden.has(`fielder:${position}`)) return;
    hidden.add(`fielder:${position}`);
    tracks.push({
      id: `fielder:${position}`,
      kind: 'fielder',
      label: nameAt(position),
      side: defense,
      points,
      start,
      duration,
      easing: 'ease-out',
    });
  };

  // 1. Windup, pitch, swing.
  const arrive = RELEASE + PITCH_FLIGHT;
  const [plateX, plateH] = PLATE_TARGET[pitch.location];
  tracks.push({
    id: 'pitcher',
    kind: 'pose',
    pose: 'windup',
    points: [],
    start: 0,
    duration: 420,
    easing: 'ease-in-out',
  });
  addBall(
    'pitch',
    flight(
      [0, 55, 6.2],
      [plateX * (pitch.number % 2 ? 1 : -1), 0.6, plateH],
      1.2,
      10,
    ),
    RELEASE,
    PITCH_FLIGHT,
  );
  if (pitch.swung)
    tracks.push({
      id: 'batter',
      kind: 'pose',
      pose: 'swing',
      points: [],
      start: arrive - 130,
      duration: 240,
      easing: 'ease-out',
    });

  // 2. Batted ball and the fielders chasing it.
  const play = pitch.play;
  const contact = arrive;
  if (play) {
    const bat: Point3 = [0, 1.5, 3];
    const toward = (feet: number) => polar(play.angle, feet);
    switch (play.kind) {
      case 'foul':
        addBall('batted', flight(bat, at(toward(170)), 55), contact, 900);
        break;
      case 'foul-out': {
        const spot = toward(120);
        const fielder = nearest(['C', '1B', '3B', 'LF', 'RF'], spot);
        const caught = addBall(
          'batted',
          flight(bat, at(spot, 6), 70),
          contact,
          1200,
        );
        addFielder(
          fielder,
          [at(spotOf(fielder)), at(spot)],
          contact,
          caught - contact,
        );
        break;
      }
      case 'pop-out':
      case 'line-out': {
        const spot = toward(play.kind === 'pop-out' ? 120 : 105);
        const fielder = nearest(INFIELD, spot);
        const caught = addBall(
          'batted',
          flight(bat, at(spot, 6), play.kind === 'pop-out' ? 80 : 6),
          contact,
          play.kind === 'pop-out' ? 1300 : 420,
        );
        addFielder(
          fielder,
          [at(spotOf(fielder)), at(spot)],
          contact,
          caught - contact,
        );
        break;
      }
      case 'ground-out':
      case 'double-play':
      case 'fielders-choice':
      case 'error':
      case 'bunt': {
        const spot = toward(play.kind === 'bunt' ? 28 : 112);
        const fielder = nearest(
          play.kind === 'bunt' ? ['P', 'C', '1B', '3B'] : INFIELD,
          spot,
        );
        const reach = addBall(
          'batted',
          grounder(bat, at(spot)),
          contact,
          play.kind === 'bunt' ? 520 : 650,
        );
        addFielder(
          fielder,
          [at(spotOf(fielder)), at(spot)],
          contact,
          reach - contact,
        );
        let from = at(spot, 4);
        let released = reach + 60;
        if (play.kind === 'double-play') {
          addFielder(
            '2B',
            [at(spotOf('2B')), at(BASES[1])],
            contact,
            reach - contact,
          );
          released =
            addBall(
              'turn',
              flight(from, at(BASES[1], 4), 5, 8),
              released,
              320,
            ) + 60;
          from = at(BASES[1], 4);
        }
        if (play.kind === 'fielders-choice') {
          // 선행 주자를 잡으러 2루로 던진다.
          addFielder(
            fielder === 'SS' ? '2B' : 'SS',
            [at(spotOf(fielder === 'SS' ? '2B' : 'SS')), at(BASES[1])],
            contact,
            reach - contact,
          );
          addBall('throw', flight(from, at(BASES[1], 4), 5, 8), released, 320);
        } else if (fielder !== '1B') {
          addFielder('1B', [at(spotOf('1B')), at(BASES[0])], contact, 450);
          addBall('throw', flight(from, at(BASES[0], 4), 6, 8), released, 380);
        }
        break;
      }
      case 'bunt-out': {
        const spot = toward(22);
        const fielder = nearest(['P', 'C', '1B', '3B'], spot);
        const reach = addBall(
          'batted',
          flight(bat, at(spot, 3), 18, 10),
          contact,
          700,
        );
        addFielder(
          fielder,
          [at(spotOf(fielder)), at(spot)],
          contact,
          reach - contact,
        );
        break;
      }
      case 'fly-out':
      case 'sac-fly': {
        const spot = toward(265);
        const fielder = nearest(OUTFIELD, spot);
        const caught = addBall(
          'batted',
          flight(bat, at(spot, 6), 85),
          contact,
          1150,
        );
        addFielder(fielder, [at(spotOf(fielder)), at(spot)], contact, 1100);
        if (play.kind === 'sac-fly')
          addBall(
            'throw',
            flight(at(spot, 6), [0, 2, 4], 20),
            caught + 80,
            700,
          );
        break;
      }
      case 'single':
      case 'double':
      case 'triple': {
        const [carry, peak, time] = {
          single: [195, 14, 650],
          double: [300, 38, 950],
          triple: [335, 45, 1000],
        }[play.kind];
        const land = toward(carry);
        const rest = toward(carry + 28);
        const bounced = addBall(
          'batted',
          flight(bat, at(land), peak, 16),
          contact,
          time,
        );
        const stopped = addBall(
          'roll',
          grounder(at(land), at(rest), 8),
          bounced,
          320,
        );
        const fielder = nearest(OUTFIELD, rest);
        addFielder(
          fielder,
          [at(spotOf(fielder)), at(rest)],
          contact,
          stopped - contact,
        );
        addBall(
          'throw',
          flight(at(rest, 5), at(BASES[1], 4), 25, 10),
          stopped + 80,
          650,
        );
        break;
      }
      case 'home-run': {
        addBall(
          'batted',
          flight(bat, at(toward(430), 20), 110, 22),
          contact,
          1500,
        );
        const fielder = nearest(OUTFIELD, toward(350));
        addFielder(
          fielder,
          [at(spotOf(fielder)), at(toward(350))],
          contact,
          1200,
        );
        break;
      }
    }
  }

  // Steal: catcher's throw to the bag.
  const steal = pitch.steal;
  if (steal) {
    const bag = steal.from === 2 ? HOME : BASES[steal.from + 1];
    const cover = steal.from === 0 ? 'SS' : steal.from === 1 ? '3B' : 'C';
    addFielder(
      cover,
      [at(spotOf(cover)), at(bag)],
      RELEASE,
      PITCH_FLIGHT + 200,
    );
    addBall('throw', flight([0, 0, 5], at(bag, 4), 5, 8), arrive + 100, 420);
  }

  // 3. Runners: match bases by player id, send the lead runners home for each run scored.
  const nextBase = new Map(
    next.bases.flatMap((runner, base) =>
      runner ? [[runner.playerId, base] as const] : [],
    ),
  );
  const movers = prev.bases.flatMap((runner, base) =>
    runner
      ? [
          {
            id: runner.playerId,
            name: runner.name,
            speed: runner.speed,
            from: base,
          },
        ]
      : [],
  );
  const batterRuns = pitch.plateAppearanceEnded && pitch.result !== 'strikeout';
  if (batterRuns)
    movers.push({
      id: batter.id,
      name: batter.name,
      speed: batter.speed,
      from: -1,
    });
  let runs = next.score[side] - prev.score[side];
  const runStart = play ? contact + 120 : arrive + 200;
  // A runner who is thrown out keeps running until the last throw arrives.
  const outAt = Math.max(
    ...tracks
      .filter((track) => track.kind === 'ball')
      .map((track) => track.start + track.duration),
  );
  [...movers]
    .sort((a, b) => b.from - a.from)
    .forEach((mover) => {
      let to = nextBase.get(mover.id) ?? null;
      if (to === null && runs > 0) {
        to = 3;
        runs -= 1;
      }
      if (to === mover.from) return;
      const thrownOut =
        to === null &&
        (mover.from === -1 ||
          (play?.kind === 'double-play' && mover.from === 0) ||
          (steal && !steal.success && mover.from === steal.from));
      const points =
        to === null
          ? thrownOut
            ? basePath(mover.from, mover.from + 1)
            : [at(baseSpot(mover.from))]
          : basePath(mover.from, to);
      if (thrownOut) {
        const [x, y] = points[1];
        points[1] = [lerp(points[0][0], x, 0.6), lerp(points[0][1], y, 0.6), 0];
      }
      const legs = to === null ? (thrownOut ? 0.6 : 0.7) : to - mover.from;
      const start = steal && mover.from === steal.from ? RELEASE : runStart;
      hidden.add(mover.id);
      tracks.push({
        id: `runner:${mover.id}`,
        kind: 'runner',
        label: mover.name,
        side,
        points,
        start,
        duration: thrownOut
          ? Math.max(legTime(mover.speed) * legs, outAt - start)
          : legTime(mover.speed) * legs,
        easing: 'linear',
        fade: to === null || to === 3,
      });
    });
  if (batterRuns)
    tracks.push({
      id: 'batter',
      kind: 'pose',
      pose: 'leave',
      points: [],
      start: runStart,
      duration: 160,
      easing: 'linear',
    });

  return {
    tracks,
    duration: Math.max(...tracks.map((track) => track.start + track.duration)),
    result: pitch.result,
    playKind: play?.kind,
    pitchLocation: pitch.location,
    contactAt: play ? contact : undefined,
    hidden: [...hidden],
  };
}

