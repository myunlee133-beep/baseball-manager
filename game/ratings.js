/**
 * 20-80 스카우팅 스케일. 50이 평균, 표준편차 10.
 *
 * 사용자에게 보이는 능력치와 엔진이 실제로 쓰는 능력치를 분리한다.
 * 컨택 하나가 세 가지 히든 스탯의 평균이므로, 같은 컨택 60이라도
 * 삼진이 적은 유형과 인플레이 타구가 좋은 유형이 따로 존재한다.
 */
export const SCALE = { min: 20, max: 80, avg: 50, sd: 10 };
/** 능력치를 표준편차 단위로. 50 → 0, 60 → +1, 30 → -2. */
export const z = (rating) => (rating - SCALE.avg) / SCALE.sd;
export const clampRating = (value) => Math.max(SCALE.min, Math.min(SCALE.max, value));
/** id 에서 안정적인 의사난수. 같은 선수는 언제나 같은 히든 스탯을 갖는다. */
function hash(id, salt) {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i += 1) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
}
/** -1 ~ +1 범위의 안정적 편차. */
export const spread = (id, salt) => hash(id, salt) * 2 - 1;
/**
 * 화면 능력치에서 히든 스탯을 만든다.
 * 컨택은 세 스탯의 평균, 선구안은 두 스탯의 평균이라는 관계를 정확히 지킨다.
 * 편차는 선수마다 고정이라 스카우팅으로 알아낼 수는 있어도 화면에는 안 보인다.
 */
export function hiddenBatter(id, grades, override) {
    // 스케일 경계에 가까우면 편차를 줄 여지가 없다. 컨택 80인 선수는 세 히든이
    // 전부 80이어야만 평균이 80이 되므로, 경계에 다가갈수록 편차를 좁힌다.
    const room = (grade) => Math.min(1, Math.min(SCALE.max - grade, grade - SCALE.min) / 15);
    const contactRoom = room(grades.contact);
    const eyeRoom = room(grades.eye);
    const a = spread(id, 1) * 7 * contactRoom;
    const b = spread(id, 2) * 7 * contactRoom;
    const d = spread(id, 3) * 6 * eyeRoom;
    const draft = {
        avoidK: grades.contact + a,
        babip: grades.contact + b,
        swingContact: grades.contact - (a + b),
        borderlineJudge: grades.eye + d,
        patience: grades.eye - d,
        ...override,
    };
    // 오버라이드가 들어와도 "컨택 = 세 스탯의 평균", "선구안 = 두 스탯의 평균"은 반드시 지킨다.
    // 지정하지 않은 스탯이 차이를 흡수한다. 전부 지정했으면 균등하게 나눠 맞춘다.
    return {
        ...rebalance([draft.avoidK, draft.babip, draft.swingContact], grades.contact, ['avoidK', 'babip', 'swingContact'], override),
        ...rebalance([draft.borderlineJudge, draft.patience], grades.eye, ['borderlineJudge', 'patience'], override),
    };
}
/** 평균이 목표값이 되도록 조정한다. 고정된 스탯은 건드리지 않는다. */
function rebalance(values, target, keys, override) {
    const free = keys
        .map((key, i) => ({ key, i }))
        .filter(({ key }) => override?.[key] === undefined);
    const gap = target * values.length - values.reduce((sum, v) => sum + v, 0);
    const share = gap / (free.length || values.length);
    const out = {};
    keys.forEach((key, i) => {
        const adjust = free.length === 0 || free.some((f) => f.i === i) ? share : 0;
        out[key] = clampRating(Math.round(values[i] + adjust));
    });
    return out;
}
/** 성향. 능력치와 독립이며 선수마다 고정이다. */
export function tendencies(id, override) {
    return {
        gbfb: spread(id, 11) * 0.8,
        pull: spread(id, 12) * 0.8,
        ...override,
    };
}
/** 화면 표기. 20-80 스케일은 5단위로 읽는 게 관례다. */
export const gradeLabel = (rating) => rating >= 70
    ? '특급'
    : rating >= 60
        ? '우수'
        : rating >= 45
            ? '평균'
            : rating >= 35
                ? '부족'
                : '열세';
