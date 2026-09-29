import assert from 'node:assert/strict';
import { createBlueTeam, createRedTeam } from '../../game/data.js';
import { changePitcher, createGame, getCurrentBatter, getCurrentPitcher, playPitch, substitutePlayer } from '../../game/engine.js';
import { swingOutcome, getSwingProfile, pitchLocationProbabilities, pitchLocations, recognitionProbability, hidden, barrelQuality } from '../../game/pitch-model.js';
import { createMiniSeason, migrateSeason, startTodayGame } from '../../game/season.js';
const fresh = (seed = 42) => createGame(createBlueTeam(), createRedTeam(), Math.imul(seed, 2654435761) >>> 0);
const initial = fresh();
const snapshot = JSON.stringify(initial);
assert.deepEqual(playPitch(initial, 'balanced', 'attack'), playPitch(initial, 'balanced', 'attack'));
assert.equal(JSON.stringify(initial), snapshot, 'playPitch must not mutate its input');
const policy = (value) => Object.fromEntries(Object.entries(getSwingProfile(getCurrentBatter(initial))).map(([key]) => [key, Object.fromEntries(pitchLocations.map((location) => [location, value]))]));
const seen = new Set();
for (let seed = 1; seed <= 1600; seed++) {
    const game = fresh(seed);
    game.count = { balls: seed % 4, strikes: seed % 3 };
    if (seed % 4 === 0)
        getCurrentBatter(game).swingProfile = policy(0);
    if (seed % 4 === 1)
        getCurrentBatter(game).swingProfile = policy(1);
    const before = structuredClone(game.count);
    const result = playPitch(game, 'balanced', ['attack', 'corners', 'chase'][seed % 3]).state;
    const pitch = result.lastPitch;
    seen.add(pitch.result);
    assert.equal(result.pitchNumber, 1);
    assert.equal(result.pitchingStats[getCurrentPitcher(game).id].pitches, 1);
    assert.equal(getCurrentPitcher(game).pitchCount, 0);
    assert(result.count.balls >= 0 && result.count.balls <= 3);
    assert(result.count.strikes >= 0 && result.count.strikes <= 2);
    assert.equal(result.plateAppearance, pitch.plateAppearanceEnded ? 1 : 0);
    assert.equal(Object.values(result.battingStats).reduce((n, line) => n + line.pa, 0), result.plateAppearance);
    if (pitch.plateAppearanceEnded)
        assert.deepEqual(result.count, { balls: 0, strikes: 0 });
    else {
        assert.equal(result.battingIndex.away, 0);
        if (pitch.result === 'ball')
            assert.deepEqual(result.count, { balls: before.balls + 1, strikes: before.strikes });
        else if (pitch.result === 'foul')
            assert.deepEqual(result.count, { balls: before.balls, strikes: Math.min(2, before.strikes + 1) });
        else
            assert.deepEqual(result.count, { balls: before.balls, strikes: before.strikes + 1 });
    }
    if (pitch.result === 'walk') {
        assert.equal(before.balls, 3);
        assert.equal(pitch.swung, false);
    }
    if (pitch.result === 'strikeout')
        assert.equal(before.strikes, 2);
}
for (const name of ['ball', 'called-strike', 'swinging-strike', 'foul', 'in-play', 'home-run', 'walk', 'strikeout'])
    assert(seen.has(name), `Missing pitch branch: ${name}`);
// Seek deterministic pitches for baseball boundary conditions, without replacing the RNG.
function findPitch(prepare, accept, batting = 'balanced') {
    for (let seed = 1; seed < 2000; seed++) {
        const game = fresh(seed);
        prepare(game);
        const next = playPitch(game, batting, 'corners').state;
        if (accept(next))
            return { before: game, after: next };
    }
    throw new Error('Boundary test fixture not found');
}
const loaded = (game) => {
    game.teams.away.lineup.slice(1, 4).forEach(({ player }, index) => { game.bases[index] = { playerId: player.id, lineupIndex: index + 1, name: player.name, speed: player.speed }; });
};
const walked = findPitch((game) => { loaded(game); game.count.balls = 3; getCurrentBatter(game).swingProfile = policy(0); }, (game) => game.lastPitch?.result === 'walk').after;
assert.equal(walked.score.away, 1);
assert.equal(walked.bases[0]?.playerId, initial.teams.away.lineup[0].player.id);
assert.equal(walked.battingStats[initial.teams.away.lineup[0].player.id].ab, 0);
const strikeout = findPitch((game) => { game.outs = 2; game.count.strikes = 2; getCurrentBatter(game).swingProfile = policy(0); }, (game) => game.lastPitch?.result === 'strikeout').after;
assert.equal(strikeout.half, 'bottom');
assert.equal(strikeout.outs, 0);
const buntK = findPitch((game) => { game.count.strikes = 2; getCurrentBatter(game).swingProfile = policy(1); }, (game) => game.lastPitch?.result === 'strikeout', 'bunt').after;
assert.equal(buntK.battingStats[initial.teams.away.lineup[0].player.id].so, 1);
const stealing = findPitch((game) => { loaded(game); game.bases[1] = null; game.bases[2] = null; game.outs = 2; game.count = { balls: 1, strikes: 1 }; }, (game) => game.half === 'bottom' && !game.lastPitch?.plateAppearanceEnded, 'steal').after;
assert.equal(stealing.plateAppearance, 0);
assert.equal(stealing.battingIndex.away, 0);
assert.deepEqual(stealing.count, { balls: 0, strikes: 0 });
assert.equal(Object.values(stealing.pitchingStats).reduce((sum, line) => sum + line.outs, 0), 1);
const walkOff = findPitch((game) => { game.half = 'bottom'; game.inning = 9; loaded(game); game.count.balls = 3; getCurrentBatter(game).swingProfile = policy(0); }, (game) => game.lastPitch?.result === 'walk').after;
assert.equal(walkOff.status, 'final');
assert.deepEqual(playPitch(walkOff, 'balanced', 'attack').state, walkOff);
const active = fresh();
active.count = { balls: 3, strikes: 2 };
assert.deepEqual(changePitcher(active, 'home', active.teams.home.pitchers[1].id).count, active.count);
assert.deepEqual(substitutePlayer(active, 'away', 0, active.teams.away.bench[0].id, 'pinch-hitter').count, active.count);
const season = startTodayGame(createMiniSeason());
season.activeGame = active;
const reloaded = migrateSeason(JSON.parse(JSON.stringify(season)));
assert.deepEqual(playPitch(reloaded.activeGame, 'balanced', 'chase'), playPitch(active, 'balanced', 'chase'), 'Saved count/RNG must resume identically');
const legacy = JSON.parse(JSON.stringify(season));
legacy.version = 3;
delete legacy.activeGame.count;
delete legacy.activeGame.lastPitch;
delete legacy.activeGame.pitchNumber;
for (const team of Object.values(legacy.activeGame.teams))
    for (const entry of team.lineup)
        delete entry.player.babip;
const migrated = migrateSeason(legacy);
assert.equal(migrated.version, 5);
assert.deepEqual(migrated.activeGame.count, { balls: 0, strikes: 0 });
assert.ok(hidden(getCurrentBatter(migrated.activeGame)).babip >= 20, '구 저장본도 히든 스탯을 갖춰야 한다');
assert.equal(playPitch(migrated.activeGame, 'balanced', 'attack').state.pitchNumber, 1);
const batter = getCurrentBatter(initial), pitcher = getCurrentPitcher(initial);
for (const strategy of ['attack', 'corners', 'chase']) {
    const low = pitchLocationProbabilities({ ...pitcher, control: 25 }, strategy);
    const high = pitchLocationProbabilities({ ...pitcher, control: 75 }, strategy);
    assert(Math.abs(Object.values(high).reduce((sum, n) => sum + n, 0) - 1) < 1e-10);
    const target = strategy === 'attack' ? ['count-strike'] : strategy === 'corners' ? ['borderline-strike', 'borderline-ball'] : ['chase-ball'];
    assert(target.reduce((sum, k) => sum + high[k], 0) > target.reduce((sum, k) => sum + low[k], 0));
}
for (const location of pitchLocations) {
    assert(recognitionProbability({ ...batter, eye: 75 }, location) > recognitionProbability({ ...batter, eye: 25 }, location));
}
for (const strategy of ['balanced']) {
    const rates = pitchLocations.map((location) => swingOutcome(batter, pitcher, location, strategy, false));
    // 나쁜 위치일수록 맞히기 어렵고, 맞혀도 파울이 된다. 타구의 질은 barrelQuality 가 맡는다.
    rates.slice(1).forEach((rate, i) => { assert(rate.contact < rates[i].contact); assert(rate.foul > rates[i].foul); });
    pitchLocations.slice(1).forEach((location, i) => assert(barrelQuality[location] < barrelQuality[pitchLocations[i]]));
}
const healthy = swingOutcome(batter, { ...pitcher, stamina: 75, pitchCount: 80 }, 'count-strike', 'balanced', false);
const tired = swingOutcome(batter, { ...pitcher, stamina: 30, pitchCount: 80 }, 'count-strike', 'balanced', false);
assert(healthy.contact < tired.contact, 'Stamina must retain pitching effectiveness');
// Equal opponents and approach, fresh stamina per PA: isolate the batting abilities.
function profileStats(overrides, count = 12000) {
    const totals = { pa: 0, ab: 0, h: 0, bb: 0, so: 0, bases: 0, hr: 0, pitches: 0 };
    for (let seed = 1; seed <= count; seed++) {
        const game = fresh(seed + 12000);
        Object.assign(getCurrentBatter(game), { id: 'test-hitter', contact: 50, power: 50, eye: 50, speed: 50, defense: 50, hidden: undefined, tendencies: undefined }, overrides);
        // The same count-dependent pitching policy for every profile.
        let final = game;
        for (let pitch = 0; final.plateAppearance === 0 && pitch < 100; pitch++) {
            const mix = (Math.imul(seed + pitch * 37, 2654435761) >>> 0) % 100;
            const strategy = final.count.balls === 3 ? 'attack' : final.count.strikes === 2 && mix < 50 ? 'chase' : mix < 55 ? 'attack' : mix < 90 ? 'corners' : 'chase';
            final = playPitch(final, 'balanced', strategy).state;
        }
        assert.equal(final.plateAppearance, 1);
        const line = final.battingStats['test-hitter'];
        totals.pa += line.pa;
        totals.ab += line.ab;
        totals.h += line.h;
        totals.bb += line.bb;
        totals.so += line.so;
        totals.hr += line.hr;
        totals.bases += line.h + line.doubles + line.triples * 2 + line.hr * 3;
        totals.pitches += final.pitchNumber;
    }
    return { avg: totals.h / totals.ab, obp: (totals.h + totals.bb) / totals.pa, slg: totals.bases / totals.ab, bb: totals.bb / totals.pa, k: totals.so / totals.pa, hr: totals.hr / totals.pa, pitches: totals.pitches / totals.pa };
}
const slap = profileStats({ contact: 72, power: 28, eye: 40, hidden: { babip: 70 } });
const ops = profileStats({ contact: 38, power: 74, eye: 74, hidden: { babip: 46 } });
const slugger = profileStats({ contact: 38, power: 74, eye: 30, hidden: { babip: 46 } });
console.table({ slap, ops, slugger });
assert(slap.avg > ops.avg && slap.avg > slugger.avg, '컨택형이 가장 높은 타율을 낸다');
// 선구안만 다른 두 프로필(ops/slugger)을 비교해야 선구안의 효과가 드러난다.
assert(ops.obp > slugger.obp, '같은 컨택·파워라면 선구안이 출루율을 만든다');
assert(ops.obp - ops.avg > slap.obp - slap.avg, '선구안은 타율 밖의 출루를 만든다');
assert(ops.slg > slap.slg && slugger.slg > slap.slg, '파워형이 더 높은 장타율을 낸다');
assert(ops.bb > slugger.bb, '선구안이 볼넷률을 가른다');
assert(slap.k < ops.k && slap.k < slugger.k, '컨택이 삼진을 줄인다');
// 요구사항: 선구안이 높을수록 빠른 카운트에서 참아 타석당 투구 수가 늘어난다.
assert(ops.pitches > slugger.pitches, '선구안이 높으면 타석당 투구 수가 늘어난다');
assert(ops.pitches > slap.pitches, '선구안이 높으면 타석당 투구 수가 늘어난다');
console.log('투구 테스트 통과: 카운트·볼넷·삼진·파울·도루·교체·저장 복원·능력치별 36,000타석');
