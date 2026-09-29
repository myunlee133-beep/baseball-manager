/**
 * 리그 환경 노브. 능력치가 아니라 리그 전체의 성적 수준을 정한다.
 * 값을 바꾼 뒤에는 scripts/league-calib.ts 로 2,000경기를 돌려 확인한다.
 *
 * 카운트별 투수 작전 배합(pitchingPlan)도 볼넷률을 정하는 노브지만,
 * 칸마다 의미가 있어 표 그대로 pitch-model.ts 에 둔다.
 *
 * 보정 순서: 리그 성적을 직접 맞추지 않고 타석 내용물(스윙·컨택)을 먼저 실제 수준에
 * 맞춘 뒤, 삼진·볼넷이 따라오는지 확인했다. 컨택 기준을 올려 삼진률만 맞추면
 * 존 안 컨택이 92% 로 비현실적이 되면서 루킹 삼진이 절반을 넘는다.
 *
 * 기준값 (2,000경기): 존 밖 스윙 27% · 존 안 스윙 66% · 존 밖 컨택 61% · 존 안 컨택 86% ·
 * 헛스윙 10% · 삼진 20.0% · 볼넷 9.8% · 홈런 2.8% · 타율 .266 · 투구/타석 3.86 — scripts/league-calib.ts
 */
export const LEAGUE_TUNING = {
  /** 평균 타자·평균 투수가 한가운데 공에 스윙했을 때의 컨택률. 삼진률을 정한다. */
  contactBase: 0.9,
  /** 최적 각도(28도)·중앙 담장 기준으로 홈런에 필요한 타구 속도(mph). 홈런률을 정한다. */
  homeRunEV: 102.75,
  /** 수비 개입 전 안타 확률 배율. BABIP 과 타율을 정한다. */
  hitDifficulty: 1.025,
  /** 볼로 인지한 공에 스윙하는 확률 배율. 존 밖 스윙률(리그 타자들의 공격성)을 정한다. */
  chaseSwing: 2.8,
  /** 존 밖 공(보더라인 볼·유인구)에 스윙했을 때의 컨택 배율. 존 밖 컨택률을 정한다. */
  chaseContact: 0.87,
};

/**
 * 사건 빈도 노브. OOTP 의 engine.cfg 와 같은 구성이다 (1 = 100%). 올리면 그 사건이 더 자주
 * (…Success 는 더 잘) 일어난다. 기본값에서 리그 지표를 맞췄으므로 바꾼 뒤에는 league-calib 로 확인한다.
 */
export const EVENT_TUNING = {
  fieldingError: 1,
  throwingError: 1,
  doublePlay: 1,
  triplePlay: 1,
  lineDoublePlay: 1,
  tagupSecond: 1,
  tagupThird: 1,
  extraBaseFromFirst: 1,
  extraBaseFromSecond: 1,
  stealSuccess: 1,
  bunting: 1,
  buntForHit: 1,
  wildPitch: 1,
  passedBall: 1,
  balk: 1,
  pickoff: 1,
  pickoffSuccess: 1,
  hitByPitch: 1,
  foulOut: 1,
};

