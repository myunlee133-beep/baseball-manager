/**
 * 리그 지표 범위 검사. 400경기(시드 1~400 고정)를 돌려 리그 성적과 타석 내용물이
 * 범위 안에 있는지 본다. 약 25초 걸려서 기본 `npm test` 와 분리했다 → `npm run test:league`
 *
 * 시드가 고정이라 같은 코드는 항상 같은 숫자를 낸다. 범위는 "여기까지 바뀌면 보정이
 * 깨졌다고 본다"는 선이다. 400경기 묶음끼리의 흔들림(타율 ±.006, 삼진 ±0.4%p)보다
 * 넉넉하고, 엔진 오류(예: 인지 정확도 오역 → 루킹 삼진 47%, 볼넷 13%)는 걸리게 잡았다.
 * 보정을 의도적으로 바꿨다면 scripts/league-calib.ts 로 다시 잰 뒤 범위를 고친다.
 */
import { blankTally, fmt, metrics, playInto, type Metrics } from './league-measure';

const RANGE: Record<keyof Metrics, [number, number]> = {
  타율: [.255, .290], 출루율: [.320, .360], 장타율: [.390, .450], BABIP: [.295, .335],
  '삼진%': [16.5, 22], '볼넷%': [8, 11], '홈런%': [2.2, 3.4],
  '투구/타석': [3.6, 4.0], 경기당득점: [8, 11],
  선발투구수: [85, 100], 선발이닝: [4.8, 6.2], 팀당투수: [3.5, 4.8], 구원투구수: [14, 22], 구원이닝: [.8, 1.4],
  '존밖스윙%': [22, 34], '존안스윙%': [63, 75], '존밖컨택%': [55, 67], '존안컨택%': [82, 89],
  '헛스윙%': [8, 13], '루킹삼진%': [12, 30],
  // 사건 빈도 (팀·경기당). KBO 수준에서 크게 벗어나면 걸린다.
  팀당실책: [.4, .9], 팀당병살: [.5, 1.1], 팀당도루시도: [.7, 1.8], '도루성공%': [65, 85], '사구%': [.9, 1.9],
  팀당폭투: [.2, .6], 팀당포일: [0, .2], 팀당희생번트: [.1, .6], 팀당희생플라이: [.1, .4], 팀당고의사구: [.02, .3],
  팀당잔루: [6, 9], '자책비율%': [85, 96], '무승부%': [0, 5], 경기당세이브: [.3, .7], 경기당홀드: [.5, 1.8],
};

const t = blankTally();
for (let seed = 1; seed <= 400; seed += 1) playInto(seed, t);
const m = metrics(t);
const failures: string[] = [];
console.log('지표            값      허용 범위');
for (const k of Object.keys(RANGE) as (keyof Metrics)[]) {
  const [lo, hi] = RANGE[k]; const ok = m[k] >= lo && m[k] <= hi;
  console.log(`${ok ? ' ' : '✗'} ${k.padEnd(12)} ${fmt(k, m[k]).padStart(6)}   ${fmt(k, lo)} ~ ${fmt(k, hi)}`);
  if (!ok) failures.push(`${k} ${fmt(k, m[k])} (허용 ${fmt(k, lo)}~${fmt(k, hi)})`);
}
if (failures.length) {
  console.error(`\n리그 지표 범위 검사 실패 ${failures.length}건:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\n리그 지표 범위 검사 통과: 400경기 · ${Object.keys(RANGE).length}개 지표`);

