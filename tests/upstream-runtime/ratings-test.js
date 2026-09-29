import assert from 'node:assert/strict';
import { hiddenBatter, tendencies } from '../../game/ratings.js';
import { battedBall, outProbability, classify } from '../../game/batted-ball.js';
import { swingOutcome, pitchLocationProbabilities, getSwingProfile, pitchingPlan } from '../../game/pitch-model.js';
const bat = (over = {}) => ({
    id: 'b1', name: '타자', position: 'CF', bats: '우',
    contact: 50, eye: 50, power: 50, speed: 50, defense: 50, fatigue: 0, ...over,
});
const pit = (over = {}) => ({
    id: 'p1', name: '투수', throws: '우', role: '선발',
    velocity: 50, stuff: 50, control: 50, stamina: 50, pitchCount: 0, fatigue: 0, ...over,
});
let s = 987654321;
const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
// 요구사항 1: 컨택은 세 히든 스탯의 평균, 선구안은 두 히든 스탯의 평균이다.
for (const id of ['a', 'zz', 'player-7', 'kbo-2033-11']) {
    for (const [contact, eye] of [[30, 40], [50, 50], [72, 66], [80, 20]]) {
        const h = hiddenBatter(id, { contact, eye, power: 50, speed: 50, defense: 50 });
        assert.ok(Math.abs((h.avoidK + h.babip + h.swingContact) / 3 - contact) <= 1, `컨택 평균이 어긋남: ${id} ${contact} → ${(h.avoidK + h.babip + h.swingContact) / 3}`);
        assert.ok(Math.abs((h.borderlineJudge + h.patience) / 2 - eye) <= 1, '선구안 평균이 어긋남');
    }
}
// 히든 스탯을 직접 지정해도 평균은 유지된다.
const forced = hiddenBatter('x', { contact: 60, eye: 50, power: 50, speed: 50, defense: 50 }, { babip: 75 });
assert.equal(forced.babip, 75);
assert.ok(Math.abs((forced.avoidK + forced.babip + forced.swingContact) / 3 - 60) <= 1, '오버라이드 후에도 평균 유지');
// 요구사항 1: 선구안이 높으면 빠른 카운트 스윙이 준다 (2스트라이크에서는 같다).
const calm = getSwingProfile(bat({ id: 'calm', eye: 75 }));
const wild = getSwingProfile(bat({ id: 'calm', eye: 25 }));
assert.ok(calm['0-0']['count-strike'] < wild['0-0']['count-strike'], '빠른 카운트 스윙이 줄어야 한다');
assert.ok(calm['0-2']['count-strike'] === wild['0-2']['count-strike'], '2스트라이크에서는 참을 수 없다');
// 요구사항 2: 구속이 높을수록 헛스윙이 는다.
const slow = swingOutcome(bat(), pit({ velocity: 25 }), 'count-strike', 'balanced', false);
const fast = swingOutcome(bat(), pit({ velocity: 75 }), 'count-strike', 'balanced', false);
assert.ok(fast.contact < slow.contact, '구속이 헛스윙을 만든다');
// 요구사항 2: 구위가 좋을수록 피BABIP 이 준다.
const babipFor = (stuff) => {
    let hits = 0, n = 0;
    for (let i = 0; i < 40000; i += 1) {
        const ball = battedBall({
            hidden: hiddenBatter('b1', bat()), tend: tendencies('b1'), power: 50, bats: '우', quality: .9, stuff,
        }, [rng(), rng(), rng()]);
        if (ball.homeRun)
            continue;
        n += 1;
        if (rng() >= outProbability(ball, 50, 50))
            hits += 1;
    }
    return hits / n;
};
const weakStuff = babipFor(25), strongStuff = babipFor(75);
assert.ok(strongStuff < weakStuff - .02, `구위가 피BABIP 을 낮춰야 한다: ${weakStuff.toFixed(3)} → ${strongStuff.toFixed(3)}`);
// 요구사항 2: 제구가 좋을수록 의도한 위치에 더 자주 간다 → 볼넷이 줄고 유리한 카운트가 는다.
const loose = pitchLocationProbabilities(pit({ control: 25 }), 'attack');
const tight = pitchLocationProbabilities(pit({ control: 75 }), 'attack');
assert.ok(tight['count-strike'] > loose['count-strike'], '제구가 좋으면 스트라이크가 는다');
assert.ok(tight['chase-ball'] < loose['chase-ball'], '제구가 좋으면 빠지는 공이 준다');
for (const p of [loose, tight]) {
    assert.ok(Math.abs(Object.values(p).reduce((a, b) => a + b, 0) - 1) < 1e-9, '확률 합이 1이어야 한다');
}
// 카운트표: 각 행의 합은 1이고, 평균 투수 기준 존 투구 비율이 카운트 유불리를 따라간다.
const zoneShare = (strategy) => {
    const p = pitchLocationProbabilities(pit(), strategy);
    return p['count-strike'] + p['borderline-strike'];
};
const zoneAt = (count) => {
    const [a, c, h] = pitchingPlan[count];
    return a * zoneShare('attack') + c * zoneShare('corners') + h * zoneShare('chase');
};
for (const [count, row] of Object.entries(pitchingPlan)) {
    assert.ok(Math.abs(row[0] + row[1] + row[2] - 1) < 1e-9, `카운트표 ${count} 의 합이 1이 아니다`);
    assert.ok(row.every((v) => v >= 0), `카운트표 ${count} 에 음수가 있다`);
}
// 볼이 늘수록 존 안으로, 스트라이크가 늘수록 밖으로.
for (const strikes of [0, 1, 2]) {
    const row = [0, 1, 2, 3].map((balls) => zoneAt(`${balls}-${strikes}`));
    row.slice(1).forEach((v, i) => assert.ok(v > row[i], `${strikes}스트라이크에서 볼이 늘면 존 비율이 올라야 한다`));
}
for (const balls of [0, 1, 2, 3]) {
    const col = [0, 1, 2].map((strikes) => zoneAt(`${balls}-${strikes}`));
    col.slice(1).forEach((v, i) => assert.ok(v < col[i], `${balls}볼에서 스트라이크가 늘면 존 비율이 내려가야 한다`));
}
// 요구사항 3: 뜬공/땅볼 성향이 타구 유형을 가른다.
const typeMix = (gbfb) => {
    const counts = { ground: 0, line: 0, fly: 0, popup: 0 };
    for (let i = 0; i < 30000; i += 1) {
        const ball = battedBall({
            hidden: hiddenBatter('b1', bat()), tend: { gbfb, pull: 0 }, power: 50, bats: '우', quality: .9, stuff: 50,
        }, [rng(), rng(), rng()]);
        counts[ball.type] += 1;
    }
    return counts;
};
const grounder = typeMix(-.8), flyer = typeMix(.8);
assert.ok(grounder.ground > flyer.ground, '땅볼형이 땅볼을 더 친다');
assert.ok(flyer.fly > grounder.fly, '뜬공형이 뜬공을 더 친다');
// 요구사항 3: 당겨치기 성향이 방향을 가른다. 우타자는 음수가 당긴 쪽이다.
const sprayMean = (pull) => {
    let sum = 0;
    for (let i = 0; i < 20000; i += 1) {
        sum += battedBall({
            hidden: hiddenBatter('b1', bat()), tend: { gbfb: 0, pull }, power: 50, bats: '우', quality: .9, stuff: 50,
        }, [rng(), rng(), rng()]).sprayAngle;
    }
    return sum / 20000;
};
assert.ok(sprayMean(.8) < sprayMean(-.8), '당겨치는 우타자는 좌측으로 간다');
// 요구사항 3: 배정된 수비수의 능력치가 처리 확률을 정한다.
let better = 0, worse = 0;
for (let i = 0; i < 20000; i += 1) {
    const ball = battedBall({
        hidden: hiddenBatter('b1', bat()), tend: tendencies('b1'), power: 50, bats: '우', quality: .9, stuff: 50,
    }, [rng(), rng(), rng()]);
    if (ball.homeRun)
        continue;
    assert.ok(ball.fielder !== null, '인플레이 타구에는 수비수가 배정되어야 한다');
    better += outProbability(ball, 75, 50);
    worse += outProbability(ball, 25, 50);
}
assert.ok(better > worse, '수비가 좋을수록 더 많이 처리한다');
// 홈런은 별도 주사위가 아니라 속도와 각도에서 나온다.
let hr = 0, hrChecked = 0;
for (let i = 0; i < 40000; i += 1) {
    const ball = battedBall({
        hidden: hiddenBatter('b1', bat()), tend: tendencies('b1'), power: 70, bats: '우', quality: 1, stuff: 50,
    }, [rng(), rng(), rng()]);
    if (!ball.homeRun)
        continue;
    hr += 1;
    hrChecked += 1;
    assert.ok(ball.launchAngle >= 18 && ball.launchAngle <= 45, `홈런 각도가 비현실적: ${ball.launchAngle}`);
    assert.ok(ball.exitVelocity >= 95, `홈런 타구 속도가 비현실적: ${ball.exitVelocity}`);
    assert.equal(ball.fielder, null, '홈런에는 수비수가 없다');
}
assert.ok(hr > 0, '파워 70이면 홈런이 나와야 한다');
assert.equal(classify(5), 'ground');
assert.equal(classify(18), 'line');
assert.equal(classify(35), 'fly');
assert.equal(classify(60), 'popup');
console.log(`능력치·타구 테스트 통과: 히든 평균 불변식, 구속·구위·제구, 카운트표 존 비율 순서, 성향 2축, 수비 배정, 홈런 ${hrChecked}개 각도·속도 검사`);
