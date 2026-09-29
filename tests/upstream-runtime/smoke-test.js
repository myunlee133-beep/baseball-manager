import { createBlueTeam, createRedTeam } from '../../game/data.js';
import { LAST_INNING, changePitcher, createGame, playPitch, playPlateAppearance, simulateGame, substitutePlayer, } from '../../game/engine.js';
import { createMiniSeason, recordFinishedUserGame, startTodayGame, } from '../../game/season.js';
const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
for (let seed = 1; seed <= 100; seed += 1) {
    const game = simulateGame(createGame(createBlueTeam(), createRedTeam(), seed));
    assert(game.status === 'final', `seed ${seed}: 경기가 종료되지 않음`);
    assert(game.inning >= 9, `seed ${seed}: 9회 이전 종료`);
    assert(game.score.home !== game.score.away || game.inning === LAST_INNING, `seed ${seed}: ${LAST_INNING}회 전에 무승부로 종료`);
    ['away', 'home'].forEach((side) => {
        const ids = new Set([...game.teams[side].lineup.map((entry) => entry.player.id), ...game.teams[side].bench.map((player) => player.id)]);
        const runs = Object.entries(game.battingStats).filter(([id]) => ids.has(id)).reduce((sum, [, line]) => sum + line.runs, 0);
        assert(runs === game.score[side], `seed ${seed}: ${side} 득점 기록 ${runs} ≠ 점수 ${game.score[side]}`);
        const pitcherIds = new Set(game.teams[side].pitchers.map((pitcher) => pitcher.id));
        const allowed = Object.entries(game.pitchingStats).filter(([id]) => pitcherIds.has(id));
        const conceded = allowed.reduce((sum, [, line]) => sum + line.runsAllowed, 0);
        const other = side === 'home' ? 'away' : 'home';
        assert(conceded === game.score[other], `seed ${seed}: ${side} 실점 기록 ${conceded} ≠ 상대 점수 ${game.score[other]}`);
        allowed.forEach(([, line]) => assert(line.earnedRuns <= line.runsAllowed, `seed ${seed}: 자책점이 실점보다 많음`));
    });
    const decisions = game.decisions;
    assert(decisions, `seed ${seed}: 승패 판정 없음`);
    if (game.score.home !== game.score.away) {
        const winner = game.score.home > game.score.away ? 'home' : 'away';
        const has = (side, id) => Boolean(id && game.teams[side].pitchers.some((pitcher) => pitcher.id === id));
        assert(has(winner, decisions.win), `seed ${seed}: 승리투수가 이긴 팀 투수가 아님`);
        assert(has(winner === 'home' ? 'away' : 'home', decisions.loss), `seed ${seed}: 패전투수가 진 팀 투수가 아님`);
        assert(!decisions.save || has(winner, decisions.save), `seed ${seed}: 세이브 투수가 이긴 팀 투수가 아님`);
    }
    else
        assert(!decisions.win && !decisions.loss, `seed ${seed}: 무승부인데 승패가 있음`);
    assert(game.teams.home.lineup.length === 9, `seed ${seed}: 홈팀 라인업 손상`);
    assert(game.teams.away.lineup.length === 9, `seed ${seed}: 원정팀 라인업 손상`);
    assert(Object.values(game.pitchingStats).reduce((sum, line) => sum + line.pitches, 0) === game.pitchNumber, `seed ${seed}: 투구 수 불일치`);
    assert(Object.values(game.battingStats).reduce((sum, line) => sum + line.pa, 0) ===
        game.plateAppearance, `seed ${seed}: 타석 수 불일치`);
    Object.values(game.battingStats).forEach((line) => assert(line.pa === line.ab + line.bb + line.hitByPitch + line.sacBunts + line.sacFlies, `seed ${seed}: 타석 세부 기록 불일치`));
    Object.values(game.battingStats).forEach((line) => assert(line.doubles + line.triples + line.hr <= line.h, `seed ${seed}: 장타 기록 불일치`));
}
const buntSuccesses = new Map();
const twoOutBuntSuccesses = new Map();
let stealAttempts = 0;
const baseStates = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
];
for (let seed = 1; seed <= 100; seed += 1) {
    baseStates.forEach((occupied, stateIndex) => {
        const buntGame = createGame(createBlueTeam(), createRedTeam(), seed * 17 + stateIndex);
        buntGame.half = 'bottom';
        occupied.forEach((onBase, baseIndex) => {
            if (!onBase)
                return;
            const player = buntGame.teams.home.lineup[baseIndex].player;
            buntGame.bases[baseIndex] = {
                playerId: player.id,
                lineupIndex: baseIndex,
                name: player.name,
                speed: player.speed,
            };
        });
        const bunt = playPlateAppearance(buntGame, 'bunt', 'attack').state;
        if (bunt.lastPlay.includes('성공') || bunt.lastPlay.includes('번트 안타')) {
            const key = occupied.map((onBase) => (onBase ? '1' : '0')).join('');
            buntSuccesses.set(key, (buntSuccesses.get(key) ?? 0) + 1);
        }
        const twoOutGame = createGame(createBlueTeam(), createRedTeam(), seed * 29 + stateIndex);
        twoOutGame.half = 'bottom';
        twoOutGame.outs = 2;
        occupied.forEach((onBase, baseIndex) => {
            if (!onBase)
                return;
            const player = twoOutGame.teams.home.lineup[baseIndex].player;
            twoOutGame.bases[baseIndex] = {
                playerId: player.id,
                lineupIndex: baseIndex,
                name: player.name,
                speed: player.speed,
            };
        });
        const twoOutBunt = playPlateAppearance(twoOutGame, 'bunt', 'attack').state;
        // 2사 번트는 희생번트가 될 수 없다. 살면 번트 안타다.
        const twoOutLine = twoOutBunt.battingStats[twoOutGame.teams.home.lineup[0].player.id];
        assert(!twoOutLine || twoOutLine.sacBunts === 0, '2사 번트에 희생번트가 기록됨');
        if (twoOutBunt.lastPlay.includes('번트 안타')) {
            const key = occupied.map((onBase) => (onBase ? '1' : '0')).join('');
            twoOutBuntSuccesses.set(key, (twoOutBuntSuccesses.get(key) ?? 0) + 1);
        }
    });
    const stealGame = createGame(createBlueTeam(), createRedTeam(), seed + 500);
    stealGame.half = 'bottom';
    stealGame.bases[0] = {
        playerId: stealGame.teams.home.lineup[0].player.id,
        lineupIndex: 0,
        name: stealGame.teams.home.lineup[0].player.name,
        speed: 85,
    };
    const steal = playPitch(stealGame, 'steal', 'attack').state;
    stealAttempts += Object.values(steal.battingStats).reduce((total, line) => total + line.stolenBases + line.caughtStealing, 0);
}
assert(baseStates.every((state) => buntSuccesses.get(state.map((onBase) => (onBase ? '1' : '0')).join(''))), '8가지 루 상태 번트 중 성공하지 않은 경우가 있음');
assert(baseStates.every((state) => twoOutBuntSuccesses.get(state.map((onBase) => (onBase ? '1' : '0')).join(''))), '2아웃 8가지 루 상태 번트 안타가 나오지 않은 경우가 있음');
assert(stealAttempts > 30 && stealAttempts <= 100, '타석이 이어지는 투구의 도루 시도 기록 불일치');
const initial = createGame(createBlueTeam(), createRedTeam(), 42);
const benchPlayer = initial.teams.home.bench[0];
const outgoing = initial.teams.home.lineup[0].player;
const substituted = substitutePlayer(initial, 'home', 0, benchPlayer.id, 'defense');
assert(substituted.teams.home.lineup[0].player.id === benchPlayer.id, '야수 교체 실패');
assert(substituted.teams.home.usedPlayerIds.includes(outgoing.id), '교체 아웃 선수 처리 실패');
const currentPitcher = initial.teams.home.currentPitcherId;
const nextPitcher = initial.teams.home.pitchers.find((pitcher) => pitcher.id !== currentPitcher);
const pitchingChange = changePitcher(initial, 'home', nextPitcher.id);
assert(pitchingChange.teams.home.currentPitcherId === nextPitcher.id, '투수 교체 실패');
assert(pitchingChange.teams.home.usedPitcherIds.includes(currentPitcher), '교체 투수 재등판 방지 실패');
const lineupSeason = createMiniSeason();
const lineupTeam = lineupSeason.teams[lineupSeason.userTeamId];
const lineupCandidate = lineupTeam.bench[0];
const lineupOutgoing = lineupTeam.lineup[0].player;
const customLineupIds = [
    lineupCandidate.id,
    ...lineupTeam.lineup.slice(1).map((entry) => entry.player.id),
];
const customLineupSeason = startTodayGame(lineupSeason, customLineupIds);
const customizedTeam = customLineupSeason.teams[customLineupSeason.userTeamId];
assert(customizedTeam.lineup[0].player.id === lineupCandidate.id, '후보 선수 선발 등록 실패');
assert(customizedTeam.bench.some((player) => player.id === lineupOutgoing.id), '선발 제외 선수 후보 이동 실패');
let season = createMiniSeason();
for (let day = 1; day <= 24; day += 1) {
    season = startTodayGame(season);
    const activeGame = season.activeGame;
    assert(activeGame, `${day}일차: 사용자 경기 생성 실패`);
    const finalGame = simulateGame(activeGame);
    season = recordFinishedUserGame(season, finalGame);
}
assert(season.status === 'complete', '24일 미니 시즌이 종료되지 않음');
assert(Object.values(season.records).every((record) => record.wins + record.losses + record.ties === 24), '구단별 24경기 기록 불일치');
assert(season.schedule.every((game) => game.status === 'final'), '미완료 일정이 남아 있음');
assert(Object.keys(season.playerStats).length > 0, '시즌 선수 기록이 누적되지 않음');
console.log('엔진 스모크 테스트 통과: 100경기 완주, 교체, 24일 미니 시즌');
