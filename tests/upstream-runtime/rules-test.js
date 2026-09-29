/**
 * 규칙 검사. KBO 규정·야구규칙과 선수 위치 무결성을 상황을 만들어 직접 확인한다.
 */
import { createBlueTeam, createRedTeam } from '../../game/data.js';
import { LAST_INNING, createGame, playPitch, playPlateAppearance, simulateHalfInning, substitutePlayer, substitutionProblem, } from '../../game/engine.js';
import { canPlay, lineupProblems } from '../../game/fielding.js';
import { createMiniSeason, planLineup } from '../../game/season.js';
const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const runnerOf = (game, index, speed) => {
    const player = game.teams.home.lineup[index].player;
    return {
        playerId: player.id,
        lineupIndex: index,
        name: player.name,
        speed: speed ?? player.speed,
        pitcherId: game.teams.away.currentPitcherId,
    };
};
/** 9회말 이후, 동점, 주자 배치를 지정한 홈 공격 상황. */
function bottomOfNinth(seed, bases, outs = 0, inning = 9) {
    const game = createGame(createBlueTeam(), createRedTeam(), seed);
    game.inning = inning;
    game.half = 'bottom';
    game.outs = outs;
    game.score = { away: 3, home: 3 };
    game.lineScore = { away: Array(inning).fill(0), home: Array(inning).fill(0) };
    game.lineScore.away[0] = 3;
    game.lineScore.home[0] = 3;
    game.battingIndex.home = 3;
    bases.forEach((on, base) => {
        if (on)
            game.bases[base] = runnerOf(game, base);
    });
    return game;
}
// 1. 끝내기 (5.08(b), 9.06(f)): 홈런이 아니면 결승점까지만, 루타도 결승 주자가 간 만큼만.
let walkOffs = 0;
for (let seed = 1; seed <= 400; seed += 1) {
    const game = bottomOfNinth(seed, [true, true, true]);
    const batterId = game.teams.home.lineup[3].player.id;
    const after = playPlateAppearance(game, 'balanced', 'attack').state;
    if (after.status !== 'final')
        continue;
    walkOffs += 1;
    const line = after.battingStats[batterId];
    if (line.hr)
        assert(after.score.home - after.score.away === 4, `seed ${seed}: 끝내기 만루홈런은 4점 모두 인정`);
    else {
        assert(after.score.home - after.score.away === 1, `seed ${seed}: 끝내기는 결승점까지만 (${after.score.home}:${after.score.away})`);
        assert(line.doubles + line.triples === 0, `seed ${seed}: 3루 주자 끝내기 안타는 단타로 기록`);
    }
    assert(after.decisions, `seed ${seed}: 끝내기 뒤 승패 판정 없음`);
}
assert(walkOffs > 100, `끝내기 표본 부족 ${walkOffs}`);
// 2. 연장 한도: 11회말이 끝나도 동점이면 무승부, 10회말 동점이면 11회로.
let ties = 0;
for (let seed = 1; seed <= 200; seed += 1) {
    const eleventh = simulateHalfInning(bottomOfNinth(seed, [false, false, false], 0, LAST_INNING));
    if (eleventh.score.home === eleventh.score.away) {
        ties += 1;
        assert(eleventh.status === 'final' && eleventh.decisions?.win === null, `seed ${seed}: 11회말 동점이면 승패 없는 무승부`);
    }
    const tenth = simulateHalfInning(bottomOfNinth(seed, [false, false, false], 0, 10));
    if (tenth.score.home === tenth.score.away)
        assert(tenth.status === 'playing' && tenth.inning === 11, `seed ${seed}: 10회말 동점이면 11회로`);
}
assert(ties > 50, `무승부 표본 부족 ${ties}`);
// 3. 파울이면 볼 데드: 도루 주자는 돌아간다 (5.06(c)). 고의사구는 공을 던지지 않는다.
let fouls = 0;
for (let seed = 1; seed <= 400; seed += 1) {
    const game = bottomOfNinth(seed, [true, false, false]);
    game.score = { away: 0, home: 0 };
    game.inning = 3;
    const after = playPitch(game, 'steal', 'attack').state;
    if (after.lastPitch?.result !== 'foul')
        continue;
    fouls += 1;
    assert(after.bases[0]?.playerId === game.bases[0].playerId && !after.bases[1], `seed ${seed}: 파울인데 주자가 진루`);
    assert(!after.lastPitch.steal, `seed ${seed}: 파울인데 도루 판정`);
}
assert(fouls > 20, `파울 표본 부족 ${fouls}`);
const walkGame = bottomOfNinth(1, [false, true, false]);
const walked = playPitch(walkGame, 'balanced', 'intentional').state;
assert(walked.pitchNumber === walkGame.pitchNumber &&
    walked.bases[0] &&
    walked.battingStats[walkGame.teams.home.lineup[3].player.id]
        .intentionalWalks === 1, '고의사구: 공 없이 1루, 고의사구 기록');
// 4. 인필드 플라이: 무사 1·2루 내야 뜬공은 타자만 아웃, 주자는 그대로.
let infieldFlies = 0;
for (let seed = 1; seed <= 1500 && infieldFlies < 5; seed += 1) {
    const game = bottomOfNinth(seed, [true, true, false]);
    game.inning = 3;
    game.score = { away: 0, home: 0 };
    const after = playPlateAppearance(game, 'balanced', 'attack').state;
    if (!after.lastPlay.includes('인필드 플라이'))
        continue;
    infieldFlies += 1;
    assert(after.outs === 1 && after.bases[0] && after.bases[1], `seed ${seed}: 인필드 플라이인데 주자가 움직였거나 아웃 수가 틀림`);
}
assert(infieldFlies > 0, '인필드 플라이 표본 없음');
// 5. 위치 무결성. 자격 없는 위치로는 대수비·선발 출전을 할 수 없다.
const game = createGame(createBlueTeam(), createRedTeam(), 5);
const home = game.teams.home;
const catcherIndex = home.lineup.findIndex((entry) => entry.position === 'C');
const outfielder = home.bench.find((player) => !canPlay(player, 'C'));
assert(substitutionProblem(game, 'home', catcherIndex, outfielder.id, 'defense'), '비포수를 포수 대수비로 넣을 수 있음');
assert(substitutePlayer(game, 'home', catcherIndex, outfielder.id, 'defense') ===
    game, '막힌 교체가 반영됨');
// 대타를 포수 자리에 쓰면 다음 수비 때 벤치 포수로 자동 정리된다.
const batting = createGame(createBlueTeam(), createRedTeam(), 6);
batting.half = 'bottom';
batting.battingIndex.home = catcherIndex;
const pinch = substitutePlayer(batting, 'home', catcherIndex, outfielder.id, 'pinch-hitter');
assert(pinch !== batting, '대타 교체 실패');
pinch.half = 'top';
const fielded = playPitch(pinch, 'balanced', 'attack').state;
const catcher = fielded.teams.home.lineup.find((entry) => entry.position === 'C').player;
assert(canPlay(catcher, 'C') && catcher.id !== outfielder.id, '대타 뒤 포수 자리가 정리되지 않음');
assert(lineupProblems(fielded.teams.home.lineup).length === 0, `수비 정리 뒤 라인업 위반: ${lineupProblems(fielded.teams.home.lineup).join(', ')}`);
// 벤치 포수가 없으면 포수 자리 대타 자체가 막힌다.
const noBackup = createGame(createBlueTeam(), createRedTeam(), 7);
noBackup.half = 'bottom';
noBackup.battingIndex.home = catcherIndex;
noBackup.teams.home.bench = noBackup.teams.home.bench.filter((player) => !canPlay(player, 'C'));
assert(substitutionProblem(noBackup, 'home', catcherIndex, noBackup.teams.home.bench[0].id, 'pinch-hitter'), '포수가 없어지는 대타가 허용됨');
// 수비 못 하는 선수만으로는 경기를 시작하지 않는다.
const broken = createBlueTeam();
broken.lineup = broken.lineup.map((entry) => ({
    ...entry,
    player: { ...entry.player, position: 'DH', positions: {} },
}));
let threw = false;
try {
    createGame(broken, createRedTeam(), 1);
}
catch {
    threw = true;
}
assert(threw, '수비 불가 라인업으로 경기가 시작됨');
// 시즌 선발 라인업: 타순을 바꿔도 각자 자격 있는 위치를 받는다.
const season = createMiniSeason();
const team = season.teams[season.userTeamId];
const reversed = team.lineup.map((entry) => entry.player.id).reverse();
const planned = planLineup(team, reversed);
assert(planned && lineupProblems(planned).length === 0, '타순 변경 뒤 위치 배정 실패');
assert(planned.every((entry, index) => entry.player.id === reversed[index]), '타순이 유지되지 않음');
console.log(`규칙 테스트 통과: 끝내기 ${walkOffs}건 · 11회 무승부 ${ties}건 · 파울 도루 ${fouls}건 · 인필드 플라이 · 고의사구 · 위치 무결성`);
