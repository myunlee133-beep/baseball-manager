import { createBlueTeam, createRedTeam } from '../../vendor/pro-baseball/data';
import { aiPrepare, chooseAiBattingStrategy, chooseAiPitchingStrategy, createGame, fieldingSide, battingSide, playPitch, simulateHalfInning } from '../../vendor/pro-baseball/engine';
import { BASES, buildPlayScript } from '../../vendor/pro-baseball/play-script';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const endsAt = (points: number[][], [x, y]: number[]) => {
  const last = points[points.length - 1];
  return Math.abs(last[0] - x) < 0.01 && Math.abs(last[1] - y) < 0.01;
};

const seen = new Set<string>();
for (let seed = 1; seed <= 40; seed += 1) {
  let state = createGame(createBlueTeam(), createRedTeam(), seed);
  while (state.status === 'playing') {
    const prepared = aiPrepare(state, fieldingSide(state));
    const prev = aiPrepare(prepared, battingSide(prepared));
    const next = playPitch(prev, chooseAiBattingStrategy(prev), chooseAiPitchingStrategy(prev)).state;
    const script = buildPlayScript(prev, next);
    const where = `seed ${seed} 투구 ${next.pitchNumber}`;
    // 견제·보크·고의사구는 공을 던지지 않는다. 연출도 없다.
    if (next.pitchNumber === prev.pitchNumber) {
      assert(!script, `${where}: 투구 없는 플레이에 스크립트가 생김`);
      state = next;
      continue;
    }
    assert(script, `${where}: 투구 1개인데 스크립트 없음`);
    const play = next.lastPitch!.play;
    if (play) seen.add(play.kind);
    for (const track of script!.tracks) {
      assert(track.start >= 0 && track.duration > 0, `${where}: ${track.id} 시간 오류`);
      assert(track.kind === 'pose' || track.points.length > 0, `${where}: ${track.id} 경로 없음`);
      assert(track.points.flat().every(Number.isFinite), `${where}: ${track.id} 좌표 오류`);
    }
    const side = prev.half === 'top' ? 'away' : 'home';
    const runnerTracks = script!.tracks.filter((track) => track.kind === 'runner');
    const scored = runnerTracks.filter((track) => track.points.length > 1 && endsAt(track.points, [0, 0])).length;
    assert(scored === next.score[side] - prev.score[side], `${where}: 득점 ${next.score[side] - prev.score[side]}점인데 홈 도착 트랙 ${scored}개`);
    if (play?.kind === 'home-run') {
      const batter = runnerTracks.find((track) => track.id === `runner:${prev.teams[side].lineup[prev.battingIndex[side] % 9].player.id}`);
      assert(batter && batter.points.length === 5 && endsAt(batter.points, [0, 0]), `${where}: 홈런 타자가 베이스를 한 바퀴 돌지 않음`);
    }
    if (play?.kind === 'ground-out') {
      const toFirst = script!.tracks.find((track) => track.id === 'throw');
      assert(toFirst ? endsAt(toFirst.points, BASES[0]) : script!.hidden.includes('fielder:1B'), `${where}: 땅볼 아웃인데 1루 송구 없음`);
    }
    state = next;
  }
}
for (const kind of ['single', 'double', 'home-run', 'ground-out', 'fly-out', 'foul']) assert(seen.has(kind), `검증 표본에 ${kind} 없음`);

const start = createGame(createBlueTeam(), createRedTeam(), 7);
assert(buildPlayScript(start, simulateHalfInning(start)) === null, '반 이닝 시뮬레이션에 스크립트가 생김');
assert(buildPlayScript(start, start) === null, '변화 없는 상태에 스크립트가 생김');

console.log(`연출 스크립트 테스트 통과: 40경기 모든 투구 · ${[...seen].sort().join(', ')}`);

