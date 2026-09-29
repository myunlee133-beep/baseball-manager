/**
 * 투구 단위 경기 진행. playPitch 한 번이 공 하나를 처리한다. 견제사·보크·고의사구처럼
 * 공을 던지지 않고 끝나는 플레이도 한 번으로 친다 (이때 pitchNumber 는 늘지 않는다).
 *
 * 규칙은 KBO 리그 규정과 공식 야구규칙을 따른다. 사건 분류(실책 두 종류, 병살·삼중살·직선타 병살,
 * 태그업, 추가 진루, 폭투·포일·보크·견제)와 노브는 OOTP 엔진 설정(engine.cfg)을 참고했다 → calibration.ts
 *
 * 주자 한 명 한 명이 타구·수비수 어깨·아웃 카운트를 보고 진루/정지/아웃을 정한다.
 * 득점은 모두 scoreRunners 를 거친다. 끝내기 제한, 자책점, 승계 주자 실점, 승·패·세이브·홀드의 근거가 여기서 쌓인다.
 */
import { barrelQuality, countKey, effectivePitcherRatings, getSwingProfile, hidden, judgePitch, pitchLocationCopy, pitchLocationProbabilities, sampleLocation, swingOutcome, } from './pitch-model.js';
import { battedBall, hitBases, outProbability, } from './batted-ball.js';
import { EVENT_TUNING as TUNE } from './calibration.js';
import { assignPositions, canPlay, defenseReady, fielding, holdRating, lineupProblems, planDefense, POSITION_NAME, } from './fielding.js';
import { tendencies, z } from './ratings.js';
const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
/** KBO 정규시즌 연장 한도 (2025년부터 11회). 11회말이 끝나도 동점이면 무승부다. */
export const LAST_INNING = 11;
/** KBO 승리투수 요건: 선발은 5이닝. */
const STARTER_WIN_OUTS = 15;
export function emptyBattingLine() {
    return {
        games: 0,
        pa: 0,
        ab: 0,
        h: 0,
        doubles: 0,
        triples: 0,
        hr: 0,
        bb: 0,
        so: 0,
        rbi: 0,
        sacBunts: 0,
        sacFlies: 0,
        stolenBases: 0,
        caughtStealing: 0,
        runs: 0,
        hitByPitch: 0,
        intentionalWalks: 0,
        groundedIntoDp: 0,
        gameWinningRbi: 0,
        errors: 0,
        passedBalls: 0,
    };
}
export function emptyPitchingLine() {
    return {
        games: 0,
        starts: 0,
        outs: 0,
        pitches: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
        walks: 0,
        strikeouts: 0,
        runsAllowed: 0,
        earnedRuns: 0,
        battersFaced: 0,
        hitBatters: 0,
        intentionalWalks: 0,
        wildPitches: 0,
        balks: 0,
        wins: 0,
        losses: 0,
        saves: 0,
        holds: 0,
        blownSaves: 0,
        qualityStarts: 0,
    };
}
/** 자격에 맞게 위치를 정리한 팀. 정리할 수 없으면 예외 — 규칙을 어긴 라인업으로는 경기를 시작하지 않는다. */
function readyTeam(source) {
    const team = clone(source);
    team.lineup.forEach((entry) => delete entry.sub);
    if (lineupProblems(team.lineup).length === 0)
        return team;
    const positions = assignPositions(team.lineup.map((entry) => entry.player), Object.fromEntries(team.lineup.map((entry) => [entry.player.id, entry.position])));
    if (!positions)
        throw new Error(`${team.name} 라인업으로는 수비를 짤 수 없습니다: ${lineupProblems(team.lineup).join(' · ')}`);
    team.lineup = team.lineup.map((entry, index) => ({
        player: entry.player,
        position: positions[index],
    }));
    return team;
}
export function createGame(home, away, seed = Date.now()) {
    const teams = { away: readyTeam(away), home: readyTeam(home) };
    const battingStats = Object.fromEntries([...teams.home.lineup, ...teams.away.lineup].map((entry) => [
        entry.player.id,
        { ...emptyBattingLine(), games: 1 },
    ]));
    const pitchingStats = Object.fromEntries([teams.home, teams.away].map((team) => [
        team.currentPitcherId,
        { ...emptyPitchingLine(), games: 1, starts: 1 },
    ]));
    return {
        inning: 1,
        half: 'top',
        outs: 0,
        bases: [null, null, null],
        score: { away: 0, home: 0 },
        hits: { away: 0, home: 0 },
        errors: { away: 0, home: 0 },
        lineScore: { away: [0], home: [0] },
        battingIndex: { away: 0, home: 0 },
        teams,
        status: 'playing',
        rngSeed: seed >>> 0,
        plateAppearance: 0,
        count: { balls: 0, strikes: 0 },
        pitchNumber: 0,
        lastPitch: null,
        logs: [
            {
                id: 0,
                inning: 1,
                half: 'top',
                text: `플레이볼! ${away.name}의 공격입니다.`,
                tone: 'neutral',
            },
        ],
        lastPlay: '라인업이 전광판에 올랐습니다.',
        battingStats,
        pitchingStats,
        lob: { away: 0, home: 0 },
        ghostOuts: 0,
        appearances: ['away', 'home'].map((side) => ({
            pitcherId: teams[side].currentPitcherId,
            side,
            entryLead: 0,
            saveSituation: false,
            tyingRunNear: false,
            blown: false,
            exitLead: null,
        })),
        lastLeadChange: null,
        decisions: null,
    };
}
export function battingSide(state) {
    return state.half === 'top' ? 'away' : 'home';
}
export function fieldingSide(state) {
    return state.half === 'top' ? 'home' : 'away';
}
const otherSide = (side) => (side === 'home' ? 'away' : 'home');
export function getCurrentBatter(state) {
    const side = battingSide(state);
    return state.teams[side].lineup[state.battingIndex[side] % 9].player;
}
/** 대기 타석. */
export function getOnDeckBatter(state) {
    const side = battingSide(state);
    return state.teams[side].lineup[(state.battingIndex[side] + 1) % 9].player;
}
export function getCurrentPitcher(state) {
    const side = fieldingSide(state);
    const team = state.teams[side];
    return (team.pitchers.find((item) => item.id === team.currentPitcherId) ??
        team.pitchers[0]);
}
/** 경기 상태에 묶인 난수. 같은 시드면 같은 경기가 나온다. AI 판단도 이 난수를 쓴다. */
export function random(state) {
    state.rngSeed = (Math.imul(1664525, state.rngSeed) + 1013904223) >>> 0;
    return state.rngSeed / 4294967296;
}
// Cosmetic spray angle in degrees (−45 = 3루선, +45 = 1루선) for animation.
// Hashed rather than drawn from random() so recording it never changes a game.
function sprayAngle(state, min, max) {
    let hash = Math.imul(state.rngSeed ^ Math.imul(state.pitchNumber, 0x9e3779b1), 0x85ebca6b) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
    return min + (((hash ^ (hash >>> 16)) >>> 0) / 4294967296) * (max - min);
}
function runnerFrom(player, lineupIndex, pitcherId, unearned = false) {
    return {
        playerId: player.id,
        lineupIndex,
        name: player.name,
        speed: player.speed,
        pitcherId,
        unearned,
    };
}
function ensureInningSlot(state) {
    while (state.lineScore.away.length < state.inning)
        state.lineScore.away.push(0);
    while (state.lineScore.home.length < state.inning)
        state.lineScore.home.push(0);
}
function addLog(state, text, tone) {
    state.lastPlay = text;
    state.logs.unshift({
        id: (state.logs[0]?.id ?? 0) + 1,
        inning: state.inning,
        half: state.half,
        text,
        tone,
    });
    state.logs = state.logs.slice(0, 40);
}
function battingLine(state, playerId) {
    state.battingStats[playerId] ??= { ...emptyBattingLine(), games: 1 };
    return state.battingStats[playerId];
}
function pitchingLine(state, pitcherId) {
    state.pitchingStats[pitcherId] ??= { ...emptyPitchingLine(), games: 1 };
    return state.pitchingStats[pitcherId];
}
/** side 입장의 리드. 음수면 지고 있다. */
export function leadOf(state, side) {
    return state.score[side] - state.score[otherSide(side)];
}
const NUMBER = {
    P: 1,
    C: 2,
    '1B': 3,
    '2B': 4,
    '3B': 5,
    SS: 6,
    LF: 7,
    CF: 8,
    RF: 9,
};
const isOutfield = (position) => position === 'LF' || position === 'CF' || position === 'RF';
/** 투수의 수비. 라인업에 없으므로 고정값이다. */
const PITCHER_FIELDING = { range: 45, hands: 50, arm: 55, turn: 45 };
/** 그 위치를 맡은 선수의 수비. 위치 숙련도가 반영된다. */
export function fieldingAt(team, position) {
    if (position === 'P')
        return PITCHER_FIELDING;
    const entry = team.lineup.find((item) => item.position === position);
    return entry
        ? fielding(entry.player, position)
        : { range: 40, hands: 40, arm: 40, turn: 40 };
}
function fielderId(team, position) {
    return (team.lineup.find((item) => item.position === position)?.player.id ?? null);
}
// ─── 경기 종료와 기록 판정 ──────────────────────────────────────────────
function endGame(state, text, tone) {
    state.status = 'final';
    addLog(state, text, tone);
    assignDecisions(state);
}
/**
 * 승·패·세이브·홀드·블론세이브·결승타·퀄리티스타트 (야구규칙 9.17~9.19, KBO 홀드·결승타).
 * - 승: 마지막으로 리드를 잡은 순간 그 팀의 투수. 선발이 5이닝을 못 채웠으면 가장 길게 던진 구원.
 * - 패: 그 결승점 주자를 내보낸 투수 (승계 주자 책임).
 * - 세이브: 이긴 팀 마지막 투수(승리투수 제외)가 (a) 3점 차 이내 리드에서 1이닝 이상,
 *   (b) 동점 주자가 누상·타석·대기 타석일 때 등판해 1/3 이닝 이상, (c) 3이닝 이상 막았다.
 * - 홀드: 세이브 상황에 올라와 아웃 하나 이상 잡고 리드를 지킨 채 내려간 구원 (마지막 투수 제외).
 */
function assignDecisions(state) {
    const decisions = {
        win: null,
        loss: null,
        save: null,
        holds: [],
        blownSaves: [],
        gameWinningRbi: null,
    };
    const outsOf = (id) => state.pitchingStats[id]?.outs ?? 0;
    const lastOf = (side) => state.appearances.filter((app) => app.side === side).at(-1);
    const winner = state.score.home === state.score.away
        ? null
        : state.score.home > state.score.away
            ? 'home'
            : 'away';
    const change = state.lastLeadChange;
    if (winner && change?.side === winner) {
        const apps = state.appearances.filter((app) => app.side === winner);
        let win = change.winnerPitcherId;
        if (win === apps[0].pitcherId &&
            outsOf(win) < STARTER_WIN_OUTS &&
            apps.length > 1)
            win = apps
                .slice(1)
                .reduce((best, app) => outsOf(app.pitcherId) > outsOf(best.pitcherId) ? app : best).pitcherId;
        decisions.win = win;
        decisions.loss = change.loserPitcherId;
        decisions.gameWinningRbi = change.batterId;
        const closer = apps.at(-1);
        if (apps.length > 1 && closer.pitcherId !== win && !closer.blown) {
            const outs = outsOf(closer.pitcherId);
            const lead = closer.entryLead;
            if ((lead > 0 && lead <= 3 && outs >= 3) ||
                (closer.tyingRunNear && outs >= 1) ||
                (lead > 0 && outs >= 9))
                decisions.save = closer.pitcherId;
        }
    }
    state.appearances.forEach((app, index) => {
        const first = state.appearances.findIndex((item) => item.side === app.side) === index;
        if (app.blown)
            decisions.blownSaves.push(app.pitcherId);
        if (!first &&
            app !== lastOf(app.side) &&
            app.saveSituation &&
            !app.blown &&
            (app.exitLead ?? 0) > 0 &&
            outsOf(app.pitcherId) >= 1 &&
            app.pitcherId !== decisions.win)
            decisions.holds.push(app.pitcherId);
        // 퀄리티스타트: 선발 6이닝 이상 3자책 이하.
        const line = state.pitchingStats[app.pitcherId];
        if (first && line && line.outs >= 18 && line.earnedRuns <= 3)
            line.qualityStarts += 1;
    });
    if (decisions.win)
        pitchingLine(state, decisions.win).wins += 1;
    if (decisions.loss)
        pitchingLine(state, decisions.loss).losses += 1;
    if (decisions.save)
        pitchingLine(state, decisions.save).saves += 1;
    decisions.holds.forEach((id) => {
        pitchingLine(state, id).holds += 1;
    });
    decisions.blownSaves.forEach((id) => {
        pitchingLine(state, id).blownSaves += 1;
    });
    if (decisions.gameWinningRbi)
        battingLine(state, decisions.gameWinningRbi).gameWinningRbi += 1;
    state.decisions = decisions;
}
/**
 * 주자를 앞 주자부터 차례로 홈에 들인다. 인정된 득점 수를 돌려준다.
 * - 끝내기(5.08(b)): 9회말 이후 결승점이 들어오면 거기서 끝. 홈런만 모든 주자가 들어온다.
 * - 실점은 그 주자를 내보낸 투수에게 (승계 주자). 실책 주자이거나, 실책이 없었다면
 *   이미 3아웃이었을 이닝의 득점은 비자책 (9.16 이닝 재구성).
 */
function scoreRunners(state, runners, options) {
    const offense = battingSide(state);
    const defense = fieldingSide(state);
    let credited = 0;
    for (const runner of runners) {
        if (state.status === 'final' && !options.homeRun)
            break;
        const before = leadOf(state, offense);
        ensureInningSlot(state);
        state.score[offense] += 1;
        state.lineScore[offense][state.inning - 1] += 1;
        credited += 1;
        battingLine(state, runner.playerId).runs += 1;
        if (options.rbi && options.batterId)
            battingLine(state, options.batterId).rbi += 1;
        const chargedTo = runner.pitcherId ?? state.teams[defense].currentPitcherId;
        const charged = pitchingLine(state, chargedTo);
        charged.runsAllowed += 1;
        if (!runner.unearned &&
            !options.unearned &&
            state.outs + state.ghostOuts < 3)
            charged.earnedRuns += 1;
        if (before === -1) {
            const app = state.appearances
                .filter((item) => item.side === defense)
                .at(-1);
            if (app?.saveSituation)
                app.blown = true;
        }
        if (before === 0) {
            state.lastLeadChange = {
                side: offense,
                winnerPitcherId: state.teams[offense].currentPitcherId,
                loserPitcherId: chargedTo,
                batterId: options.rbi ? options.batterId : null,
            };
            if (offense === 'home' &&
                state.half === 'bottom' &&
                state.inning >= 9 &&
                state.status !== 'final') {
                state.status = 'final';
                addLog(state, `끝내기! ${runner.name}이(가) 홈을 밟습니다. ${state.teams.home.name} 승리!`, 'run');
            }
        }
    }
    return credited;
}
function recordOuts(state, outs) {
    if (outs <= 0)
        return;
    state.outs += outs;
    pitchingLine(state, state.teams[fieldingSide(state)].currentPitcherId).outs +=
        outs;
}
function finishHalfInning(state) {
    if (state.outs < 3 || state.status === 'final')
        return;
    state.lob[battingSide(state)] += state.bases.filter(Boolean).length;
    state.outs = 0;
    state.ghostOuts = 0;
    state.count = { balls: 0, strikes: 0 };
    state.bases = [null, null, null];
    if (state.half === 'top') {
        if (state.inning >= 9 && state.score.home > state.score.away)
            return endGame(state, `경기 종료. ${state.teams.home.name}이 승리했습니다.`, 'run');
        state.half = 'bottom';
        return;
    }
    if (state.inning >= 9 && state.score.home !== state.score.away) {
        const winner = state.score.home > state.score.away
            ? state.teams.home.name
            : state.teams.away.name;
        return endGame(state, `경기 종료. ${winner}이 승리했습니다.`, 'run');
    }
    if (state.inning >= LAST_INNING)
        return endGame(state, `경기 종료. ${LAST_INNING}회까지 승부를 내지 못해 무승부입니다.`, 'change');
    state.inning += 1;
    state.half = 'top';
    ensureInningSlot(state);
}
/**
 * 야구규칙 9.06(f): 끝내기 안타는 결승 주자가 진루한 베이스 수만큼만 루타로 인정한다.
 * 진루 전에 호출한다. 앞 주자부터 들어오므로 필요한 득점 수 번째 주자가 결승 주자다.
 */
function walkOffBases(state, hit) {
    if (battingSide(state) !== 'home' ||
        state.half !== 'bottom' ||
        state.inning < 9)
        return hit;
    const needed = leadOf(state, 'away') + 1;
    const winner = [2, 1, 0].filter((base) => state.bases[base])[needed - 1];
    return winner === undefined ? hit : Math.min(hit, 3 - winner);
}
const stay = (state, from) => ({
    runner: state.bases[from],
    from,
    to: from,
});
/** 볼넷·몸에 맞는 공: 밀려나는 주자만 한 베이스. */
function forcedMovers(state, batter) {
    const [first, second, third] = state.bases;
    const movers = [{ runner: batter, from: -1, to: 0 }];
    if (first)
        movers.push({ runner: first, from: 0, to: 1 });
    if (second)
        movers.push({ runner: second, from: 1, to: first ? 2 : 1 });
    if (third)
        movers.push({ runner: third, from: 2, to: first && second ? 'home' : 2 });
    return movers;
}
/** 모든 주자와 타자가 같은 수만큼. 실책·보크·폭투. */
function advanceAll(state, bases, batter) {
    const movers = [];
    state.bases.forEach((runner, base) => {
        if (runner)
            movers.push({
                runner,
                from: base,
                to: base + bases > 2 ? 'home' : (base + bases),
            });
    });
    if (batter)
        movers.push({ runner: batter, from: -1, to: (bases - 1) });
    return movers;
}
/** 플레이 결과를 경기 상태에 반영한다. 인정된 득점 수를 돌려준다. */
function commitPlay(state, play, batterId) {
    const outs = play.movers.filter((mover) => mover.to === 'out').length;
    const next = [null, null, null];
    for (const mover of play.movers) {
        if (typeof mover.to !== 'number')
            continue;
        if (next[mover.to])
            throw new Error(`주자 충돌: ${next[mover.to].name} / ${mover.runner.name} → ${mover.to + 1}루`);
        next[mover.to] = mover.runner;
    }
    const inningOver = state.outs + outs >= 3;
    const scorers = inningOver && play.forceOut
        ? []
        : play.movers
            .filter((mover) => mover.to === 'home')
            .sort((a, b) => b.from - a.from)
            .map((mover) => mover.runner);
    const runs = scoreRunners(state, scorers, {
        batterId,
        rbi: play.rbi,
        homeRun: play.homeRun,
        unearned: play.unearned,
    });
    state.bases = next;
    if (play.ghostOut)
        state.ghostOuts += 1;
    recordOuts(state, outs);
    return runs;
}
// ─── 타구 처리 ──────────────────────────────────────────────────────────
/** 추가 진루 방향 보정. 우익수 앞 타구면 3루까지, 좌익수 앞이면 짧은 송구라 어렵다. */
const DIRECTION_BONUS = {
    LF: -0.08,
    CF: 0.03,
    RF: 0.1,
};
/** 수비 쪽 AI 가 전진 수비를 거는가. 박빙 후반 3루 주자, 무사·1사. */
export function playsInfieldIn(state) {
    if (!state.bases[2] || state.outs >= 2 || state.inning < 7)
        return false;
    const lead = leadOf(state, fieldingSide(state));
    return lead >= 0 && lead <= 1;
}
function outfielderFor(spray) {
    return spray < -15 ? 'LF' : spray > 15 ? 'RF' : 'CF';
}
function direction(spray) {
    return spray < -30
        ? '좌측'
        : spray < -10
            ? '좌중간'
            : spray <= 10
                ? '중앙'
                : spray <= 30
                    ? '우중간'
                    : '우측';
}
function hitPlay(state, ball, hit, batter, running) {
    const team = state.teams[fieldingSide(state)];
    const infieldHit = hit === 1 && ball.type === 'ground' && ball.exitVelocity < 75;
    const thrower = isOutfield(ball.fielder)
        ? ball.fielder
        : outfielderFor(ball.sprayAngle);
    const arm = z(fieldingAt(team, thrower).arm);
    const twoOuts = state.outs === 2;
    const [first, second, third] = state.bases;
    const movers = [];
    const notes = [];
    let throwHome = false;
    const taken = new Set();
    const send = (runner, from, attempt, success, target, fallback) => {
        if (random(state) < attempt) {
            throwHome = true;
            if (random(state) < success) {
                movers.push({ runner, from, to: target });
                if (target !== 'home')
                    taken.add(target);
            }
            else {
                movers.push({ runner, from, to: 'out' });
                notes.push(`${runner.name}, ${target === 'home' ? '홈' : '3루'}에서 보살`);
            }
            return;
        }
        movers.push({ runner, from, to: fallback });
        taken.add(fallback);
    };
    if (third) {
        if (infieldHit && !(first && second)) {
            movers.push(stay(state, 2));
            taken.add(2);
        }
        else
            movers.push({ runner: third, from: 2, to: 'home' });
    }
    if (second) {
        if (hit >= 2)
            movers.push({ runner: second, from: 1, to: 'home' });
        else if (infieldHit) {
            const to = first && !taken.has(2) ? 2 : 1;
            movers.push({ runner: second, from: 1, to });
            taken.add(to);
        }
        else
            send(second, 1, clamp((0.62 +
                z(second.speed) * 0.07 +
                (twoOuts ? 0.25 : 0) +
                (DIRECTION_BONUS[thrower] ?? 0) +
                (running.has(1) ? 0.2 : 0) -
                arm * 0.06) *
                TUNE.extraBaseFromSecond, 0.1, 0.98), clamp(0.9 + z(second.speed) * 0.04 - arm * 0.06, 0.55, 0.99), 'home', 2);
    }
    if (first) {
        if (hit === 3)
            movers.push({ runner: first, from: 0, to: 'home' });
        else if (hit === 2)
            send(first, 0, clamp((0.45 +
                z(first.speed) * 0.07 +
                (twoOuts ? 0.3 : 0) +
                (Math.abs(ball.sprayAngle) > 22 ? 0.05 : 0) +
                (running.has(0) ? 0.3 : 0) -
                arm * 0.05) *
                TUNE.extraBaseFromFirst, 0.05, 0.97), clamp(0.88 + z(first.speed) * 0.05 - arm * 0.06, 0.5, 0.98), 'home', 2);
        else if (infieldHit || taken.has(2)) {
            movers.push({ runner: first, from: 0, to: 1 });
            taken.add(1);
        }
        else
            send(first, 0, clamp((0.26 +
                z(first.speed) * 0.05 +
                (DIRECTION_BONUS[thrower] ?? 0) * 1.2 +
                (twoOuts ? 0.1 : 0) +
                (running.has(0) ? 0.3 : 0) -
                arm * 0.05) *
                TUNE.extraBaseFromFirst, 0.02, 0.9), clamp(0.93 + z(first.speed) * 0.03 - arm * 0.05, 0.6, 0.99), 2, 1);
    }
    let batterTo = (hit - 1);
    // 앞 주자를 잡으려는 송구 사이에 타자는 2루까지 간다.
    if (hit === 1 && throwHome && !taken.has(1) && random(state) < 0.5) {
        batterTo = 1;
        notes.push('송구 사이 타자는 2루까지');
    }
    movers.push({ runner: batter, from: -1, to: batterTo });
    const label = hit === 1
        ? infieldHit
            ? '내야 안타'
            : ball.sprayAngle < -15
                ? '좌전 안타'
                : ball.sprayAngle > 15
                    ? '우전 안타'
                    : '중전 안타'
        : `${direction(ball.sprayAngle)} ${hit}루타`;
    return {
        movers,
        kind: hit === 1 ? 'single' : hit === 2 ? 'double' : 'triple',
        hit,
        text: `${label}!${notes.length ? ` ${notes.join(', ')}.` : ''}`,
        tone: 'hit',
        rbi: true,
        forceOut: false,
        atBat: true,
    };
}
/** 처리할 수 있던 타구를 놓치는가. 땅볼은 포구와 송구 두 번 실수할 수 있다. */
function errorRoll(state, ball, glove) {
    const hands = clamp(1 - z(glove.hands) * 0.3, 0.35, 2);
    const [fieldingBase, throwingBase] = ball.type === 'ground'
        ? [0.045, 0.03]
        : ball.type === 'popup'
            ? [0.007, 0]
            : [0.017, 0];
    const roll = random(state);
    if (roll < fieldingBase * hands * TUNE.fieldingError)
        return 'fielding';
    if (roll <
        (fieldingBase * TUNE.fieldingError + throwingBase * TUNE.throwingError) *
            hands)
        return 'throwing';
    return null;
}
function errorPlay(state, ball, kind, batter) {
    const fielder = ball.fielder;
    // 외야 낙구나 악송구는 공이 뒤로 빠져 모두 두 베이스씩 간다.
    const bases = kind === 'throwing' || isOutfield(fielder) ? 2 : 1;
    batter.unearned = true;
    return {
        movers: advanceAll(state, bases, batter),
        kind: 'error',
        errorBy: fielder,
        text: `${POSITION_NAME[fielder]} ${kind === 'throwing' ? '송구 실책' : '포구 실책'}! 타자 ${bases}루까지.`,
        tone: 'hit',
        rbi: false,
        forceOut: false,
        unearned: true,
        atBat: true,
        ghostOut: true,
    };
}
function groundOut(state, ball, batter, running) {
    const team = state.teams[fieldingSide(state)];
    const position = ball.fielder;
    const name = POSITION_NAME[position];
    const glove = fieldingAt(team, position);
    const infieldIn = playsInfieldIn(state);
    const [first, second, third] = state.bases;
    const out = {
        movers: [],
        kind: 'ground-out',
        text: `${name} 땅볼.`,
        tone: 'out',
        rbi: true,
        forceOut: true,
        atBat: true,
    };
    const batterOut = { runner: batter, from: -1, to: 'out' };
    if (state.outs === 2) {
        out.movers = [
            batterOut,
            ...[0, 1, 2]
                .filter((base) => state.bases[base])
                .map((base) => stay(state, base)),
        ];
        return out;
    }
    // 3루 주자: 땅볼에 홈으로 뛰는가 (contact play). 전진 수비면 홈 송구에 걸린다.
    const thirdGoes = (forced) => {
        if (!third)
            return null;
        if (forced)
            return { runner: third, from: 2, to: 'home' };
        const go = (infieldIn
            ? 0.3
            : ({ '1B': 0.65, '2B': 0.65, SS: 0.5, '3B': 0.25, P: 0.2 }[position] ?? 0.4)) +
            z(third.speed) * 0.1;
        return { runner: third, from: 2, to: random(state) < go ? 'home' : 2 };
    };
    if (first && !running.has(0)) {
        const pivot = fieldingAt(team, position === 'SS' || position === '3B' ? '2B' : 'SS');
        const dp = clamp((0.45 +
            (ball.exitVelocity - 85) * 0.006 +
            (z(glove.turn) + z(pivot.turn)) * 0.03 -
            z(batter.speed) * 0.08 -
            (infieldIn ? 0.08 : 0)) *
            TUNE.doublePlay, 0.08, 0.75);
        if (random(state) < dp) {
            // 삼중살: 무사 1·2루 이상에서 3루수 정면 땅볼, 3루-2루-1루.
            if (second &&
                state.outs === 0 &&
                position === '3B' &&
                random(state) < 0.04 * TUNE.triplePlay) {
                return {
                    movers: [
                        batterOut,
                        { runner: first, from: 0, to: 'out' },
                        { runner: second, from: 1, to: 'out' },
                        ...(third ? [stay(state, 2)] : []),
                    ],
                    kind: 'double-play',
                    text: '3루수 땅볼. 5-4-3 삼중살!',
                    tone: 'out',
                    rbi: false,
                    forceOut: true,
                    atBat: true,
                    gidp: true,
                };
            }
            // 만루 전진·투수·1루수·3루수 땅볼은 홈-1루 병살.
            if (first &&
                second &&
                third &&
                (infieldIn || ['P', '1B', '3B'].includes(position)) &&
                random(state) < 0.5) {
                return {
                    movers: [
                        batterOut,
                        { runner: third, from: 2, to: 'out' },
                        { runner: second, from: 1, to: 2 },
                        { runner: first, from: 0, to: 1 },
                    ],
                    kind: 'double-play',
                    text: `${name} 땅볼. ${NUMBER[position]}-2-3 병살타!`,
                    tone: 'out',
                    rbi: false,
                    forceOut: true,
                    atBat: true,
                    gidp: true,
                };
            }
            const movers = [
                batterOut,
                { runner: first, from: 0, to: 'out' },
            ];
            if (second)
                movers.push({ runner: second, from: 1, to: 2 });
            if (third)
                movers.push(second
                    ? { runner: third, from: 2, to: 'home' }
                    : {
                        runner: third,
                        from: 2,
                        to: state.outs === 0 && random(state) < 0.85 ? 'home' : 2,
                    });
            const pivotNumber = position === 'SS' || position === '3B' ? 4 : 6;
            return {
                movers,
                kind: 'double-play',
                text: `${name} 땅볼. ${NUMBER[position]}-${pivotNumber}-3 병살타!`,
                tone: 'out',
                rbi: false,
                forceOut: true,
                atBat: true,
                gidp: true,
            };
        }
        // 병살은 못 했지만 앞 주자는 잡는다 (야수선택). 느린 땅볼이면 타자만 잡는다.
        const fcChance = ['2B', 'SS', '3B', 'P'].includes(position)
            ? clamp(0.42 + (ball.exitVelocity - 80) * 0.005, 0.2, 0.6)
            : 0.15;
        const movers = [];
        if (random(state) < fcChance) {
            // 9.16(g): 포스아웃된 주자의 책임은 타자 주자가 이어받는다.
            movers.push({ runner: first, from: 0, to: 'out' }, {
                runner: {
                    ...batter,
                    pitcherId: first.pitcherId,
                    unearned: first.unearned,
                },
                from: -1,
                to: 0,
            });
            if (second)
                movers.push({ runner: second, from: 1, to: 2 });
            const scoring = thirdGoes(Boolean(second));
            if (scoring)
                movers.push(scoring);
            return {
                movers,
                kind: 'fielders-choice',
                text: `${name} 땅볼. ${first.name} 2루 포스아웃 (야수선택).`,
                tone: 'out',
                rbi: true,
                forceOut: true,
                atBat: true,
            };
        }
        movers.push(batterOut, { runner: first, from: 0, to: 1 });
        if (second)
            movers.push({ runner: second, from: 1, to: 2 });
        const scoring = thirdGoes(Boolean(second));
        if (scoring)
            movers.push(scoring);
        return {
            ...out,
            movers,
            text: `${name} 땅볼. 주자는 한 베이스씩 진루합니다.`,
        };
    }
    const movers = [];
    const notes = [];
    let batterSafe = false;
    // 3루 주자 판단을 먼저 한다. 홈 송구가 가면 타자는 1루에서 산다.
    if (third) {
        const scoring = thirdGoes(false);
        const throwHome = scoring.to === 'home' &&
            (infieldIn || position === '3B' || position === 'P'
                ? random(state) < 0.7
                : random(state) < 0.15);
        if (throwHome) {
            batterSafe = true;
            if (random(state) <
                clamp(0.55 - z(third.speed) * 0.08 + z(glove.arm) * 0.05, 0.2, 0.85)) {
                movers.push({ runner: third, from: 2, to: 'out' });
                notes.push(`${third.name} 홈에서 태그아웃 (야수선택)`);
                movers.push({
                    runner: {
                        ...batter,
                        pitcherId: third.pitcherId,
                        unearned: third.unearned,
                    },
                    from: -1,
                    to: 0,
                });
            }
            else {
                movers.push(scoring);
                notes.push('홈 승부가 늦어 모두 세이프 (야수선택)');
                movers.push({ runner: batter, from: -1, to: 0 });
            }
        }
        else
            movers.push(scoring);
    }
    if (second) {
        // 2루 주자는 우측 땅볼이면 3루로 간다. 3루가 막혀 있으면 못 간다.
        const rate = { '1B': 0.75, '2B': 0.75, SS: 0.35 }[position] ?? 0.1;
        const advance = running.has(1) || random(state) < rate;
        movers.push({
            runner: second,
            from: 1,
            to: advance && !movers.some((m) => m.to === 2) ? 2 : 1,
        });
    }
    // 1루 주자가 있는데 이 분기로 왔다면 히트앤드런으로 이미 뛰고 있었다.
    if (first)
        movers.push({
            runner: first,
            from: 0,
            to: movers.some((m) => m.to === 1) ? 0 : 1,
        });
    if (!batterSafe)
        movers.push(batterOut);
    const fc = batterSafe;
    return {
        movers,
        kind: fc ? 'fielders-choice' : 'ground-out',
        text: `${name} 땅볼.${notes.length ? ` ${notes.join(', ')}.` : ''}`,
        tone: 'out',
        rbi: true,
        forceOut: !fc,
        atBat: true,
    };
}
/** 내야 뜬공·직선타. 주자는 묶이고, 뛰던 주자는 귀루 못 하면 더블아웃. */
function infieldAirOut(state, ball, batter, running) {
    const position = ball.fielder;
    const name = POSITION_NAME[position];
    const line = ball.type === 'line';
    const movers = [{ runner: batter, from: -1, to: 'out' }];
    const notes = [];
    let doubled = false;
    // 야구규칙 5.09(a)(5) 인필드 플라이: 무사·1사 1·2루 이상 내야 뜬공은 타자 자동 아웃, 주자 포스 해제.
    const infieldFly = !line && state.bases[0] && state.bases[1] && state.outs < 2;
    // 직선타에 1루수·3루수·유격수 쪽 주자가 귀루하지 못하면 더블아웃.
    const near = position === '1B' ? 0 : position === '3B' ? 2 : state.bases[1] ? 1 : 0;
    [2, 1, 0].forEach((base) => {
        const runner = state.bases[base];
        if (!runner)
            return;
        const chance = state.outs >= 2 || doubled
            ? 0
            : running.has(base)
                ? line
                    ? 0.6
                    : 0.3
                : line && base === near
                    ? 0.07 * TUNE.lineDoublePlay
                    : 0;
        if (random(state) < chance) {
            doubled = true;
            movers.push({ runner, from: base, to: 'out' });
            notes.push(`${runner.name} 귀루하지 못해 더블아웃`);
        }
        else
            movers.push(stay(state, base));
    });
    return {
        movers,
        kind: line ? 'line-out' : 'pop-out',
        text: `${name} ${line ? '직선타' : infieldFly ? '인필드 플라이 (타자 자동 아웃)' : '내야 뜬공'}.${notes.length ? ` ${notes.join(', ')}!` : ''}`,
        tone: 'out',
        rbi: false,
        forceOut: false,
        atBat: true,
    };
}
/** 외야 뜬공. 잡은 뒤 주자마다 태그업을 판단한다. */
function outfieldOut(state, ball, batter, running) {
    const team = state.teams[fieldingSide(state)];
    const position = ball.fielder;
    const name = POSITION_NAME[position];
    const arm = z(fieldingAt(team, position).arm);
    const ev = ball.exitVelocity;
    const line = ball.type === 'line';
    const movers = [{ runner: batter, from: -1, to: 'out' }];
    const notes = [];
    let outs = state.outs + 1;
    let sacFly = false;
    let open2 = !state.bases[2];
    let open1 = !state.bases[1];
    const [first, second, third] = state.bases;
    if (third) {
        const attempt = outs < 3 &&
            clamp((0.55 +
                (ev - 88) * 0.03 +
                z(third.speed) * 0.1 -
                arm * 0.08 -
                (line ? 0.3 : 0)) *
                TUNE.tagupThird, 0.03, 0.98);
        if (attempt && random(state) < attempt) {
            open2 = true;
            if (random(state) <
                clamp(0.92 + (ev - 88) * 0.008 + z(third.speed) * 0.04 - arm * 0.06, 0.45, 0.995)) {
                movers.push({ runner: third, from: 2, to: 'home' });
                sacFly = true;
            }
            else {
                movers.push({ runner: third, from: 2, to: 'out' });
                outs += 1;
                notes.push(`${third.name} 태그업했지만 홈에서 보살`);
            }
        }
        else
            movers.push(stay(state, 2));
    }
    if (second) {
        if (running.has(1) && outs < 3 && random(state) < (ev < 85 ? 0.45 : 0.2)) {
            movers.push({ runner: second, from: 1, to: 'out' });
            outs += 1;
            open1 = true;
            notes.push(`${second.name} 귀루하지 못해 더블아웃`);
        }
        else {
            const attempt = outs < 3 &&
                open2 &&
                clamp((0.18 +
                    (ev - 90) * 0.02 +
                    { RF: 0.15, CF: 0.08, LF: -0.05 }[position] +
                    z(second.speed) * 0.05) *
                    TUNE.tagupSecond, 0, 0.85);
            if (attempt && random(state) < attempt) {
                open1 = true;
                if (random(state) < clamp(0.93 - arm * 0.04, 0.7, 0.99))
                    movers.push({ runner: second, from: 1, to: 2 });
                else {
                    movers.push({ runner: second, from: 1, to: 'out' });
                    outs += 1;
                    notes.push(`${second.name} 3루 태그업 아웃`);
                }
            }
            else
                movers.push(stay(state, 1));
        }
    }
    if (first) {
        if (running.has(0) && outs < 3 && random(state) < (ev < 85 ? 0.45 : 0.15)) {
            movers.push({ runner: first, from: 0, to: 'out' });
            notes.push(`${first.name} 귀루하지 못해 더블아웃`);
        }
        else if (outs < 3 && open1 && random(state) < (ev >= 100 ? 0.15 : 0.02))
            movers.push({ runner: first, from: 0, to: 1 });
        else
            movers.push(stay(state, 0));
    }
    return {
        movers,
        kind: sacFly ? 'sac-fly' : 'fly-out',
        text: `${name} ${line ? '직선타' : '플라이'}.${sacFly ? ' 3루 주자 태그업, 홈인! 희생플라이.' : ''}${notes.length ? ` ${notes.join(', ')}.` : ''}`,
        tone: sacFly ? 'run' : 'out',
        rbi: sacFly,
        forceOut: false,
        atBat: !sacFly,
        sacFly,
    };
}
function homeRunPlay(state, ball, batter) {
    return {
        movers: [...advanceAll(state, 4), { runner: batter, from: -1, to: 'home' }],
        kind: 'home-run',
        homeRun: true,
        rbi: true,
        forceOut: false,
        atBat: true,
        text: `${direction(ball.sprayAngle)} 담장을 넘어가는 홈런!`,
        tone: 'run',
    };
}
function resolveBattedBall(state, ball, batter, running) {
    const team = state.teams[fieldingSide(state)];
    const glove = fieldingAt(team, ball.fielder);
    // 전진 수비는 땅볼이 내야를 더 잘 빠져나간다.
    const judged = ball.type === 'ground' && playsInfieldIn(state)
        ? { ...ball, difficulty: ball.difficulty + 0.06 }
        : ball;
    if (random(state) >= outProbability(judged, glove.range, batter.speed))
        return hitPlay(state, ball, hitBases(ball, batter.speed, random(state)), batter, running);
    const error = errorRoll(state, ball, glove);
    if (error)
        return errorPlay(state, ball, error, batter);
    if (ball.type === 'ground')
        return groundOut(state, ball, batter, running);
    if (!isOutfield(ball.fielder))
        return infieldAirOut(state, ball, batter, running);
    return outfieldOut(state, ball, batter, running);
}
/**
 * 번트. 번트 능력(컨택·주력)이 타구 질을 정한다.
 * 뜬 번트 → 아웃(스퀴즈면 3루 주자 더블아웃), 약한 번트 → 선행 주자 아웃(야수선택),
 * 좋은 번트 → 희생번트, 아주 좋으면 번트 안타. 주자가 없으면 기습 번트다.
 * 스퀴즈(squeeze)는 투구와 함께 3루 주자가 뛴다. 그냥 번트에 3루 주자가 있으면 세이프티 스퀴즈다.
 */
function resolveBunt(state, batter, player, squeeze) {
    const skill = z(player.contact) * 0.6 + z(player.speed) * 0.25;
    const [first, second, third] = state.bases;
    const anyRunner = Boolean(first || second || third);
    const outs = state.outs;
    const quality = random(state) + skill * 0.06 * TUNE.bunting;
    const base = (from) => stay(state, from);
    const batterOut = { runner: batter, from: -1, to: 'out' };
    if (random(state) < 0.02 * TUNE.fieldingError) {
        batter.unearned = true;
        return {
            movers: advanceAll(state, 1, batter),
            kind: 'error',
            text: '번트 타구 처리 실책! 모두 세이프.',
            tone: 'hit',
            rbi: false,
            forceOut: false,
            unearned: true,
            atBat: true,
            ghostOut: true,
        };
    }
    if (quality < 0.1) {
        const movers = [batterOut];
        let note = '';
        [2, 1, 0].forEach((from) => {
            if (!state.bases[from])
                return;
            if (from === 2 && squeeze && outs < 2 && random(state) < 0.75) {
                movers.push({ runner: third, from: 2, to: 'out' });
                note = ` 뛰던 3루 주자까지 더블아웃!`;
            }
            else
                movers.push(base(from));
        });
        return {
            movers,
            kind: 'bunt-out',
            text: `번트가 떴습니다. 타자 아웃.${note}`,
            tone: 'out',
            rbi: false,
            forceOut: false,
            atBat: true,
        };
    }
    const hitChance = clamp((anyRunner
        ? 0.07 + z(player.speed) * 0.04 + skill * 0.02
        : 0.3 + z(player.speed) * 0.08 + skill * 0.04) * TUNE.buntForHit, 0.02, 0.6);
    if (random(state) < hitChance) {
        return {
            movers: advanceAll(state, 1, batter),
            kind: 'bunt',
            hit: 1,
            text: anyRunner ? '번트 안타! 주자도 한 베이스씩.' : '기습 번트 안타!',
            tone: 'hit',
            rbi: true,
            forceOut: false,
            atBat: true,
        };
    }
    if (!anyRunner)
        return {
            movers: [batterOut],
            kind: 'bunt-out',
            text: '기습 번트, 1루에서 아웃.',
            tone: 'out',
            rbi: false,
            forceOut: true,
            atBat: true,
        };
    // 약한 번트: 앞 주자가 포스 상태면 그 주자를 잡는다.
    if (quality < 0.3 && first && !squeeze) {
        const lead = second ? 1 : 0;
        const movers = [
            { runner: state.bases[lead], from: lead, to: 'out' },
            {
                runner: {
                    ...batter,
                    pitcherId: state.bases[lead].pitcherId,
                    unearned: state.bases[lead].unearned,
                },
                from: -1,
                to: 0,
            },
        ];
        if (lead === 1)
            movers.push({ runner: first, from: 0, to: 1 });
        if (third)
            movers.push(base(2));
        return {
            movers,
            kind: 'fielders-choice',
            text: `번트가 강했습니다. 선행 주자 ${state.bases[lead].name} ${lead + 2}루에서 아웃.`,
            tone: 'out',
            rbi: false,
            forceOut: true,
            atBat: true,
        };
    }
    // 희생번트. 세이프티 스퀴즈의 3루 주자는 공이 땅에 구르는 걸 보고 뛴다.
    const movers = [batterOut];
    let thirdScores = false;
    if (third) {
        thirdScores =
            squeeze || random(state) < clamp(0.55 + z(third.speed) * 0.1, 0.3, 0.85);
        movers.push(thirdScores ? { runner: third, from: 2, to: 'home' } : base(2));
    }
    if (second)
        movers.push({ runner: second, from: 1, to: third && !thirdScores ? 1 : 2 });
    if (first)
        movers.push({
            runner: first,
            from: 0,
            to: second && third && !thirdScores ? 0 : 1,
        });
    const sacrifice = outs < 2 &&
        movers.some((mover) => mover.from >= 0 && mover.to !== mover.from);
    // 2사 번트는 희생이 아니고, 타자가 1루에서 잡히면 이닝이 끝나 득점도 없다.
    if (!sacrifice && !thirdScores)
        return {
            movers,
            kind: 'bunt-out',
            text: '번트, 1루에서 아웃.',
            tone: 'out',
            rbi: false,
            forceOut: true,
            atBat: true,
        };
    return {
        movers,
        kind: 'bunt',
        text: `${squeeze ? '스퀴즈 번트' : third ? '세이프티 스퀴즈' : '희생번트'} 성공!${thirdScores ? ' 3루 주자 홈인.' : ' 주자 진루.'}`,
        tone: thirdScores ? 'run' : 'out',
        rbi: true,
        forceOut: true,
        atBat: !sacrifice,
        sacBunt: sacrifice,
    };
}
/** 누구를 뛰게 할 것인가. 2루 주자가 3루를 노릴 수 있으면 그쪽(1·2루면 더블 스틸)이 먼저다. */
export function stealTarget(state) {
    const [first, second, third] = state.bases;
    if (second && !third)
        return { from: 1, double: Boolean(first) };
    if (first && !second)
        return { from: 0, double: false };
    return null;
}
/** 도루 성공 확률. 주력 vs 포수 어깨·투수 주자 묶기. 3루 도루는 조금 더 어렵다. */
export function stealSuccessChance(state, from, options = {}) {
    const runner = state.bases[from];
    if (!runner)
        return 0;
    const catcher = fieldingAt(state.teams[fieldingSide(state)], 'C');
    const pitcher = getCurrentPitcher(state);
    return clamp((0.7 +
        z(runner.speed) * 0.09 -
        z(catcher.arm) * 0.05 -
        z(holdRating(pitcher)) * 0.035 -
        (from === 1 ? 0.03 : 0) -
        (options.pitchout ? 0.3 : 0) -
        (options.hitAndRun ? 0.06 : 0)) *
        TUNE.stealSuccess, 0.08, 0.96);
}
function attemptSteal(state, options) {
    const target = stealTarget(state);
    if (!target)
        return;
    const runner = state.bases[target.from];
    const trailing = target.double ? state.bases[0] : null;
    const box = battingLine(state, runner.playerId);
    const defense = state.teams[fieldingSide(state)];
    const base = target.from + 2;
    const success = random(state) < stealSuccessChance(state, target.from, options);
    if (state.lastPitch)
        state.lastPitch.steal = { from: target.from, success };
    const movers = [];
    if (success) {
        box.stolenBases += 1;
        // 포수 악송구면 한 베이스 더.
        const wild = random(state) < 0.03 * TUNE.throwingError;
        if (wild) {
            state.errors[fieldingSide(state)] += 1;
            const catcherId = fielderId(defense, 'C');
            if (catcherId)
                battingLine(state, catcherId).errors += 1;
        }
        if (trailing)
            battingLine(state, trailing.playerId).stolenBases += 1;
        // 도루한 주자는 한 베이스, 악송구면 공이 빠진 사이 모든 주자가 한 베이스 더.
        state.bases.forEach((item, from) => {
            if (!item)
                return;
            const stealing = from === target.from || (trailing && from === 0);
            const to = from + (stealing ? 1 : 0) + (wild ? 1 : 0);
            movers.push({
                runner: item,
                from: from,
                to: to > 2 ? 'home' : to,
            });
        });
        commitPlay(state, { movers, rbi: false, forceOut: false, unearned: wild }, null);
        addLog(state, `${runner.name}, ${base}루 도루 성공!${trailing ? ` ${trailing.name}도 2루로 (더블 스틸).` : ''}${wild ? ' 포수 송구가 빠져 한 베이스 더!' : ''}`, wild ? 'run' : 'hit');
    }
    else {
        box.caughtStealing += 1;
        movers.push({ runner, from: target.from, to: 'out' });
        if (trailing)
            movers.push({ runner: trailing, from: 0, to: 1 });
        state.bases.forEach((item, from) => {
            if (item && from !== target.from && !(trailing && from === 0))
                movers.push(stay(state, from));
        });
        commitPlay(state, { movers, rbi: false, forceOut: false }, null);
        addLog(state, `${runner.name}, ${base}루 도루 실패. 포수 송구에 걸립니다.`, 'out');
    }
}
/** 투구가 빠지는가. 폭투는 투수 제구, 포일은 포수 블로킹. 원바운드 유인구에서 주로 나온다. */
function wildPitchRoll(state, pitcher, location) {
    if (location !== 'chase-ball' && location !== 'borderline-ball')
        return null;
    const chase = location === 'chase-ball';
    const control = z(effectivePitcherRatings(pitcher).control);
    const block = z(fieldingAt(state.teams[fieldingSide(state)], 'C').hands);
    const roll = random(state);
    const wp = (chase ? 0.019 : 0.003) *
        clamp(1 - control * 0.25, 0.4, 1.8) *
        TUNE.wildPitch;
    if (roll < wp)
        return 'WP';
    if (roll <
        wp +
            (chase ? 0.005 : 0.001) *
                clamp(1 - block * 0.35, 0.3, 2) *
                TUNE.passedBall)
        return 'PB';
    return null;
}
function applyWildPitch(state, pitcher, kind) {
    if (kind === 'WP')
        pitchingLine(state, pitcher.id).wildPitches += 1;
    else {
        const catcherId = fielderId(state.teams[fieldingSide(state)], 'C');
        if (catcherId)
            battingLine(state, catcherId).passedBalls += 1;
    }
    const runs = commitPlay(state, {
        movers: advanceAll(state, 1),
        rbi: false,
        forceOut: false,
        unearned: kind === 'PB',
    }, null);
    addLog(state, `${kind === 'WP' ? '폭투' : '포일'}! 주자 모두 한 베이스씩.${runs ? ` ${runs}점이 들어옵니다.` : ''}`, runs ? 'run' : 'change');
}
/**
 * 투구 전 사건: 보크와 견제. 공을 던지지 않고 플레이가 끝났으면 true.
 * 견제는 발 빠른 주자일수록 자주 하고, 도루·히트앤드런으로 스타트를 끊은 주자일수록 잘 걸린다.
 */
function beforeDelivery(state, pitcher, runnersGoing) {
    const hold = z(holdRating(pitcher));
    if (random(state) < 0.0006 * clamp(1 - hold * 0.3, 0.5, 1.6) * TUNE.balk) {
        pitchingLine(state, pitcher.id).balks += 1;
        const runs = commitPlay(state, { movers: advanceAll(state, 1), rbi: false, forceOut: false }, null);
        addLog(state, `보크! 주자 모두 한 베이스씩 진루합니다.${runs ? ` ${runs}점.` : ''}`, runs ? 'run' : 'change');
        return true;
    }
    const from = state.bases[0] && !state.bases[1]
        ? 0
        : state.bases[1] && !state.bases[2]
            ? 1
            : null;
    if (from === null)
        return false;
    const runner = state.bases[from];
    const attempt = 0.05 *
        (1 + Math.max(0, z(runner.speed)) * 0.6) *
        (from === 1 ? 0.4 : 1) *
        TUNE.pickoff;
    if (random(state) >= attempt)
        return false;
    const roll = random(state);
    if (roll < 0.012 * TUNE.throwingError) {
        state.errors[fieldingSide(state)] += 1;
        const runs = commitPlay(state, {
            movers: advanceAll(state, 1),
            rbi: false,
            forceOut: false,
            unearned: true,
        }, null);
        addLog(state, `견제 악송구! 주자가 한 베이스 더 갑니다.${runs ? ` ${runs}점.` : ''}`, runs ? 'run' : 'change');
        return true;
    }
    const success = clamp((0.02 + (runnersGoing ? 0.12 : 0) + hold * 0.01 - z(runner.speed) * 0.005) *
        TUNE.pickoffSuccess, 0.003, 0.3);
    if (roll >= success)
        return false;
    const movers = state.bases.flatMap((item, base) => item
        ? [
            base === from
                ? { runner: item, from: base, to: 'out' }
                : stay(state, base),
        ]
        : []);
    commitPlay(state, { movers, rbi: false, forceOut: false }, null);
    addLog(state, `견제사! ${runner.name}이(가) ${from + 1}루에서 잡힙니다.`, 'out');
    finishHalfInning(state);
    return true;
}
// ─── 작전 ───────────────────────────────────────────────────────────────
/** 지금 쓸 수 있는 작전인가. 조건이 안 맞는 작전을 고르면 기본 타격·카운트 피치로 바뀐다. */
export function strategyAvailable(state, strategy) {
    const [first, second, third] = state.bases;
    switch (strategy) {
        case 'steal':
            return stealTarget(state) !== null;
        case 'hit-and-run':
            return Boolean(first && !(second && third));
        case 'squeeze':
            return Boolean(third) && state.outs < 2;
        case 'pitchout':
            return Boolean(first || second);
        default:
            return true;
    }
}
// ─── 수비 정리와 교체 ───────────────────────────────────────────────────
/**
 * 수비 전에 위치를 정리한다. 대타·대주자가 들어간 자리나 자격이 안 맞는 자리를 채운다 (OOTP 는
 * 이닝이 끝날 때 위치를 묻는다). 사람·AI 모두 같은 규칙으로 자동 정리되고 로그가 남는다.
 */
function ensureDefense(state, side) {
    const team = state.teams[side];
    if (defenseReady(team))
        return;
    const plan = planDefense(team);
    if (!plan) {
        addLog(state, `${team.name}: 남은 선수로는 수비 위치를 채울 수 없습니다.`, 'change');
        return;
    }
    const notes = [];
    for (const { index, player } of plan.replacements) {
        const outgoing = team.lineup[index].player;
        team.bench = [
            ...team.bench.filter((item) => item.id !== player.id),
            outgoing,
        ];
        team.usedPlayerIds.push(outgoing.id);
        team.lineup[index] = { player, position: plan.positions[index] };
        battingLine(state, player.id);
        notes.push(`${player.name} ${POSITION_NAME[plan.positions[index]]} 투입(${outgoing.name} 교체)`);
    }
    team.lineup.forEach((entry, index) => {
        if (entry.position !== plan.positions[index])
            notes.push(`${entry.player.name} → ${POSITION_NAME[plan.positions[index]]}`);
        entry.position = plan.positions[index];
        delete entry.sub;
    });
    if (notes.length)
        addLog(state, `${team.name} 수비 정리: ${notes.join(', ')}`, 'change');
}
/** 교체가 규칙에 맞는가. 문제가 있으면 이유를 돌려준다. 화면은 이것으로 버튼을 막는다. */
export function substitutionProblem(state, side, lineupIndex, benchPlayerId, type) {
    const team = state.teams[side];
    if (state.status === 'final')
        return '경기가 끝났습니다.';
    if (lineupIndex < 0 || lineupIndex >= team.lineup.length)
        return '타순을 확인하세요.';
    const incoming = team.bench.find((item) => item.id === benchPlayerId);
    if (!incoming)
        return '벤치에 없는 선수입니다.';
    if (team.usedPlayerIds.includes(benchPlayerId))
        return '교체로 물러난 선수는 다시 나올 수 없습니다.';
    const batting = battingSide(state) === side;
    if (type === 'pinch-hitter' &&
        (!batting || lineupIndex !== state.battingIndex[side] % 9))
        return '대타는 지금 타석에만 쓸 수 있습니다.';
    if (type === 'pinch-runner' &&
        (!batting ||
            !state.bases.some((runner) => runner?.lineupIndex === lineupIndex)))
        return '누상에 있는 주자에게만 대주자를 쓸 수 있습니다.';
    const position = team.lineup[lineupIndex].position;
    if (type === 'defense') {
        if (batting)
            return '대수비는 수비할 때 씁니다.';
        if (!canPlay(incoming, position))
            return `${incoming.name}은(는) ${POSITION_NAME[position] ?? position}로 출전할 수 없습니다.`;
    }
    const trial = clone(team);
    trial.lineup[lineupIndex] = {
        player: incoming,
        position,
        sub: type === 'defense' ? undefined : type === 'pinch-hitter' ? 'PH' : 'PR',
    };
    trial.bench = [
        ...trial.bench.filter((item) => item.id !== incoming.id),
        team.lineup[lineupIndex].player,
    ];
    trial.usedPlayerIds = [
        ...trial.usedPlayerIds,
        team.lineup[lineupIndex].player.id,
    ];
    if (!defenseReady(trial) && !planDefense(trial))
        return '이 교체를 하면 남은 선수로 수비 위치를 채울 수 없습니다.';
    return null;
}
export function substitutePlayer(source, side, lineupIndex, benchPlayerId, type) {
    if (substitutionProblem(source, side, lineupIndex, benchPlayerId, type))
        return source;
    const state = clone(source);
    const team = state.teams[side];
    const benchIndex = team.bench.findIndex((item) => item.id === benchPlayerId);
    const incoming = team.bench[benchIndex];
    const outgoing = team.lineup[lineupIndex].player;
    const label = type === 'pinch-hitter'
        ? '대타'
        : type === 'pinch-runner'
            ? '대주자'
            : '대수비';
    team.lineup[lineupIndex] = {
        player: incoming,
        position: team.lineup[lineupIndex].position,
        ...(type === 'defense'
            ? {}
            : { sub: type === 'pinch-hitter' ? 'PH' : 'PR' }),
    };
    team.bench.splice(benchIndex, 1, outgoing);
    team.usedPlayerIds.push(outgoing.id);
    battingLine(state, incoming.id);
    if (type === 'pinch-runner') {
        const base = state.bases.findIndex((item) => item?.lineupIndex === lineupIndex);
        // 대주자는 원래 주자의 책임 투수·자책 여부를 이어받는다.
        if (base >= 0)
            state.bases[base] = {
                ...state.bases[base],
                playerId: incoming.id,
                name: incoming.name,
                speed: incoming.speed,
            };
    }
    addLog(state, `${team.name} ${label}. ${outgoing.name} 대신 ${incoming.name}이 나옵니다.`, 'change');
    return state;
}
/** 투수 교체. 이전 등판을 닫고 새 등판의 세이브 상황을 기록한다. */
export function changePitcher(source, side, pitcherId) {
    const team = source.teams[side];
    if (source.status === 'final' ||
        team.currentPitcherId === pitcherId ||
        team.usedPitcherIds.includes(pitcherId))
        return source;
    const next = team.pitchers.find((item) => item.id === pitcherId);
    const current = team.pitchers.find((item) => item.id === team.currentPitcherId);
    if (!next || !current)
        return source;
    const state = clone(source);
    const live = state.teams[side];
    const lead = leadOf(state, side);
    const runners = fieldingSide(state) === side ? state.bases.filter(Boolean).length : 0;
    const previous = state.appearances.filter((app) => app.side === side).at(-1);
    if (previous)
        previous.exitLead = lead;
    state.appearances.push({
        pitcherId,
        side,
        entryLead: lead,
        saveSituation: lead > 0 && (lead <= 3 || lead <= runners + 2),
        tyingRunNear: lead > 0 && lead <= runners + 2,
        blown: false,
        exitLead: null,
    });
    live.usedPitcherIds.push(current.id);
    live.currentPitcherId = next.id;
    pitchingLine(state, next.id);
    addLog(state, `${live.name} 투수 교체. ${current.name}에서 ${next.name}(으)로 바뀝니다.`, 'change');
    return state;
}
// ─── 한 구 ──────────────────────────────────────────────────────────────
function endPlateAppearance(state, batter, batterBox, pitcherBox) {
    state.plateAppearance += 1;
    batterBox.pa += 1;
    pitcherBox.battersFaced += 1;
    batter.fatigue = clamp(batter.fatigue + 1.1, 0, 100);
    state.count = { balls: 0, strikes: 0 };
    const offense = battingSide(state);
    state.battingIndex[offense] = (state.battingIndex[offense] + 1) % 9;
    finishHalfInning(state);
}
export function playPitch(source, battingStrategy, pitchingStrategy) {
    const state = clone(source);
    if (state.status === 'final')
        return { state, battingStrategy, pitchingStrategy };
    const offense = battingSide(state);
    const defenseSide = fieldingSide(state);
    ensureDefense(state, defenseSide);
    if (!strategyAvailable(state, battingStrategy))
        battingStrategy = 'balanced';
    if (!strategyAvailable(state, pitchingStrategy))
        pitchingStrategy = 'attack';
    const done = () => {
        // 끝내기는 득점 도중에 경기가 끝나므로 승패 판정을 여기서 한다.
        if (state.status === 'final' && !state.decisions)
            assignDecisions(state);
        return { state, battingStrategy, pitchingStrategy };
    };
    const batterIndex = state.battingIndex[offense] % 9;
    const batter = state.teams[offense].lineup[batterIndex].player;
    const livePitcher = getCurrentPitcher(state);
    const batterBox = battingLine(state, batter.id);
    const pitcherBox = pitchingLine(state, livePitcher.id);
    const batterRunner = () => runnerFrom(batter, batterIndex, livePitcher.id);
    // 고의사구. KBO 는 2018년부터 공을 던지지 않는 자동 고의4구다.
    if (pitchingStrategy === 'intentional') {
        const runs = commitPlay(state, {
            movers: forcedMovers(state, batterRunner()),
            rbi: true,
            forceOut: false,
        }, batter.id);
        batterBox.bb += 1;
        batterBox.intentionalWalks += 1;
        pitcherBox.walks += 1;
        pitcherBox.intentionalWalks += 1;
        addLog(state, `${batter.name}, 고의사구로 1루에 나갑니다.${runs ? ' 밀어내기 득점.' : ''}`, runs ? 'run' : 'change');
        endPlateAppearance(state, batter, batterBox, pitcherBox);
        return done();
    }
    const bunting = battingStrategy === 'bunt' || battingStrategy === 'squeeze';
    const running = new Set();
    if (battingStrategy === 'hit-and-run') {
        running.add(0);
        if (state.bases[1])
            running.add(1);
    }
    if (battingStrategy === 'squeeze')
        running.add(2);
    if (state.bases.some(Boolean) &&
        beforeDelivery(state, livePitcher, battingStrategy === 'steal' || running.size > 0))
        return done();
    // 1. 타자는 카운트별 스윙 계획을 먼저 정한다. 작전이 걸리면 계획을 덮어쓴다.
    const countBefore = { ...state.count };
    const pitchout = pitchingStrategy === 'pitchout';
    const location = pitchout
        ? 'chase-ball'
        : sampleLocation(pitchLocationProbabilities(livePitcher, pitchingStrategy), random(state));
    const perceived = judgePitch(batter, location, random(state), random(state));
    const swingProbability = pitchout
        ? 0.02
        : battingStrategy === 'squeeze'
            ? perceived === 'chase-ball'
                ? 0.75
                : 0.97
            : battingStrategy === 'hit-and-run'
                ? perceived === 'chase-ball'
                    ? 0.55
                    : perceived === 'borderline-ball'
                        ? 0.85
                        : 0.97
                : getSwingProfile(batter, battingStrategy)[countKey(countBefore)][perceived];
    const swung = random(state) < swingProbability;
    const probabilities = swingOutcome(batter, livePitcher, location, bunting ? 'bunt' : battingStrategy, countBefore.strikes >= 2);
    const contact = clamp(probabilities.contact + (battingStrategy === 'hit-and-run' ? 0.03 : 0), 0, 0.98);
    livePitcher.pitchCount += 1;
    livePitcher.fatigue = clamp(livePitcher.fatigue + 0.14, 0, 100);
    pitcherBox.pitches += 1;
    state.pitchNumber += 1;
    const event = {
        number: state.pitchNumber,
        batterName: batter.name,
        pitcherName: livePitcher.name,
        strategy: pitchingStrategy,
        location,
        perceived,
        countBefore,
        countAfter: countBefore,
        swingProbability,
        swung,
        result: 'ball',
        plateAppearanceEnded: false,
    };
    let outcome = 'pending';
    let ball = null;
    if (!swung) {
        const hbp = 0.014 *
            clamp(1 - z(effectivePitcherRatings(livePitcher).control) * 0.2, 0.5, 1.6) *
            TUNE.hitByPitch;
        if (location === 'chase-ball' && !pitchout && random(state) < hbp) {
            outcome = 'hbp';
            event.result = 'hit-by-pitch';
        }
        else if (location === 'count-strike' ||
            location === 'borderline-strike') {
            state.count.strikes += 1;
            event.result = 'called-strike';
        }
        else {
            state.count.balls += 1;
            event.result = 'ball';
        }
    }
    else if (random(state) >= contact) {
        state.count.strikes += 1;
        event.result = 'swinging-strike';
    }
    else if (random(state) < probabilities.foul) {
        event.result = 'foul';
        const side = sprayAngle(state, -1, 1);
        event.play = {
            kind: 'foul',
            angle: Math.sign(side || 1) * (48 + Math.abs(side) * 14),
        };
        if (!bunting && random(state) < 0.018 * TUNE.foulOut) {
            outcome = 'foul-out';
            event.result = 'foul-out';
            event.play.kind = 'foul-out';
        }
        else if (state.count.strikes < 2 || bunting)
            state.count.strikes += 1;
    }
    else {
        event.result = 'in-play';
        outcome = 'in-play';
        if (!bunting) {
            // 좌우 매치업: 반대손 투수를 상대하면 조금 더 강하게 맞힌다.
            const platoon = batter.bats !== livePitcher.throws ? 1 : -1;
            ball = battedBall({
                hidden: hidden(batter),
                tend: tendencies(batter.id, batter.tendencies),
                power: batter.power -
                    batter.fatigue * 0.08 +
                    platoon * 3 -
                    (battingStrategy === 'hit-and-run' ? 8 : 0),
                bats: batter.bats,
                quality: barrelQuality[location],
                stuff: effectivePitcherRatings(livePitcher).stuff,
            }, [random(state), random(state), random(state)]);
            event.batted = {
                exitVelocity: Math.round(ball.exitVelocity),
                launchAngle: Math.round(ball.launchAngle),
                sprayAngle: Math.round(ball.sprayAngle),
                type: ball.type,
                fielder: ball.fielder,
            };
            if (ball.homeRun)
                event.result = 'home-run';
        }
    }
    if (outcome === 'pending' && state.count.balls >= 4) {
        outcome = 'walk';
        event.result = 'walk';
    }
    if (outcome === 'pending' && state.count.strikes >= 3) {
        outcome = 'strikeout';
        event.result = 'strikeout';
    }
    event.countAfter = { ...state.count };
    event.plateAppearanceEnded = outcome !== 'pending';
    state.lastPitch = event;
    if (outcome === 'pending') {
        const label = event.result === 'ball'
            ? '볼'
            : event.result === 'called-strike'
                ? '루킹 스트라이크'
                : event.result === 'foul'
                    ? '파울'
                    : '헛스윙 스트라이크';
        addLog(state, `${batter.name}, ${pitchLocationCopy[location]} · ${label}. ${state.count.balls}B ${state.count.strikes}S`, 'neutral');
        // 파울이면 볼 데드. 뛰던 주자는 돌아간다 (5.06(c)).
        if (event.result === 'foul' || !state.bases.some(Boolean))
            return done();
        const wild = wildPitchRoll(state, livePitcher, location);
        if (wild)
            applyWildPitch(state, livePitcher, wild);
        else if (battingStrategy === 'squeeze' && state.bases[2]) {
            // 스퀴즈를 댔는데 번트를 못 댔다. 뛰던 3루 주자는 협살.
            const runner = state.bases[2];
            if (random(state) < 0.8) {
                battingLine(state, runner.playerId).caughtStealing += 1;
                if (state.lastPitch)
                    state.lastPitch.steal = { from: 2, success: false };
                commitPlay(state, {
                    movers: [
                        { runner, from: 2, to: 'out' },
                        ...[0, 1]
                            .filter((b) => state.bases[b])
                            .map((b) => stay(state, b)),
                    ],
                    rbi: false,
                    forceOut: false,
                }, null);
                addLog(state, `스퀴즈 실패! ${runner.name}, 3루와 홈 사이에서 협살됩니다.`, 'out');
            }
            else
                addLog(state, `스퀴즈 실패, ${runner.name}은(는) 간신히 3루로 돌아갑니다.`, 'neutral');
        }
        else if (battingStrategy === 'steal' || battingStrategy === 'hit-and-run')
            attemptSteal(state, {
                pitchout,
                hitAndRun: battingStrategy === 'hit-and-run',
            });
        finishHalfInning(state);
        return done();
    }
    if (outcome === 'walk' || outcome === 'hbp') {
        const runs = commitPlay(state, {
            movers: forcedMovers(state, batterRunner()),
            rbi: true,
            forceOut: false,
        }, batter.id);
        if (outcome === 'walk') {
            batterBox.bb += 1;
            pitcherBox.walks += 1;
        }
        else {
            batterBox.hitByPitch += 1;
            pitcherBox.hitBatters += 1;
        }
        addLog(state, `${batter.name}, ${outcome === 'walk' ? '볼넷' : '몸에 맞는 공'}. ${runs ? '밀어내기 득점합니다.' : '1루로 걸어 나갑니다.'}`, runs ? 'run' : 'hit');
    }
    else if (outcome === 'strikeout') {
        batterBox.ab += 1;
        batterBox.so += 1;
        pitcherBox.strikeouts += 1;
        // 스트라이크 낫아웃 (5.05(a)(2)): 1루가 비었거나 2사면 타자가 뛸 수 있다.
        const loose = swung &&
            !bunting &&
            (location === 'chase-ball' || location === 'borderline-ball') &&
            random(state) <
                (location === 'chase-ball' ? 0.05 : 0.01) *
                    clamp(1 - z(fieldingAt(state.teams[defenseSide], 'C').hands) * 0.3, 0.4, 1.8);
        if (loose &&
            (!state.bases[0] || state.outs === 2) &&
            random(state) < clamp(0.3 + z(batter.speed) * 0.05, 0.1, 0.5)) {
            pitcherBox.wildPitches += 1;
            commitPlay(state, {
                movers: forcedMovers(state, batterRunner()),
                rbi: false,
                forceOut: false,
            }, null);
            addLog(state, `${batter.name}, 헛스윙 삼진… 그런데 공이 빠졌습니다! 스트라이크 낫아웃으로 1루 진루.`, 'hit');
        }
        else {
            recordOuts(state, 1);
            const kind = battingStrategy === 'bunt' || battingStrategy === 'squeeze'
                ? '번트 실패 삼진'
                : swung
                    ? '헛스윙 삼진'
                    : '루킹 삼진';
            addLog(state, `${batter.name}, ${kind}.`, 'out');
            // 삼진 뒤에도 뛰던 주자는 승부 (삼진 도루자 병살).
            if (state.outs < 3 &&
                (battingStrategy === 'steal' || battingStrategy === 'hit-and-run'))
                attemptSteal(state, {
                    pitchout,
                    hitAndRun: battingStrategy === 'hit-and-run',
                });
        }
    }
    else if (outcome === 'foul-out') {
        batterBox.ab += 1;
        const side = event.play.angle < 0 ? ['C', '3B', 'LF'] : ['C', '1B', 'RF'];
        const catcher = side[Math.floor(random(state) * 3)];
        recordOuts(state, 1);
        addLog(state, `${batter.name}, ${POSITION_NAME[catcher]} 파울플라이 아웃.`, 'out');
    }
    else {
        const runnerOut = batterRunner();
        const play = bunting
            ? resolveBunt(state, runnerOut, batter, battingStrategy === 'squeeze')
            : ball.homeRun
                ? homeRunPlay(state, ball, runnerOut)
                : resolveBattedBall(state, ball, runnerOut, running);
        event.play = {
            kind: play.kind,
            angle: ball ? ball.sprayAngle : sprayAngle(state, -20, 20),
        };
        const credited = play.hit && !play.homeRun ? walkOffBases(state, play.hit) : play.hit;
        const runs = commitPlay(state, play, batter.id);
        if (play.atBat)
            batterBox.ab += 1;
        if (play.sacFly)
            batterBox.sacFlies += 1;
        if (play.sacBunt)
            batterBox.sacBunts += 1;
        if (play.gidp)
            batterBox.groundedIntoDp += 1;
        if (play.homeRun) {
            state.hits[offense] += 1;
            batterBox.h += 1;
            batterBox.hr += 1;
            pitcherBox.hitsAllowed += 1;
            pitcherBox.homeRunsAllowed += 1;
        }
        else if (credited) {
            state.hits[offense] += 1;
            batterBox.h += 1;
            if (credited === 2)
                batterBox.doubles += 1;
            if (credited === 3)
                batterBox.triples += 1;
            pitcherBox.hitsAllowed += 1;
        }
        if (play.errorBy) {
            state.errors[defenseSide] += 1;
            const glove = fielderId(state.teams[defenseSide], play.errorBy);
            if (glove)
                battingLine(state, glove).errors += 1;
        }
        const scored = runs
            ? ` ${play.homeRun ? `${runs}점 홈런` : `${runs}점`}!`
            : '';
        addLog(state, `${batter.name}, ${play.text}${scored}`, runs ? 'run' : play.tone);
    }
    endPlateAppearance(state, batter, batterBox, pitcherBox);
    return done();
}
export function inningLabel(state) {
    return `${state.inning}회${state.half === 'top' ? '초' : '말'}`;
}
