// 화면 종합값(OVR)과 잠재력(POT). 엔진 입력은 개별 능력치(20–80)이고 OVR은 표시·성장 상한용이다.

// 포지션·보직별 가중치. 불펜은 체력을 보지 않고, 이닝이 적은 만큼 3점 낮게 본다.
export const OVR_WEIGHTS={
  hitter:{contact:.30,eye:.20,power:.30,speed:.10,defense:.10},
  premium:{contact:.27,eye:.18,power:.25,speed:.10,defense:.20}, // C·SS·CF
  dh:{contact:.35,eye:.25,power:.40},
  starter:{velocity:.20,stuff:.35,control:.30,stamina:.15},
  reliever:{velocity:.25,stuff:.45,control:.30},
};
export const RELIEVER_PENALTY=3;
// 2026 개막 1군 276명의 가중 평균 분포. 고정값이라 이후 시즌도 같은 잣대로 비교된다.
// 이 값을 바꾸면 모든 선수의 OVR이 다시 매겨진다.
export const OVR_BASE={mean:47.08115942028983,sd:4.452285371868722};
export const OVR_SPREAD=8;

// 체력 45 미만은 불펜형. 선발 보직이어도 경기당 이닝이 짧으면 불펜 가중치로 본다.
export const isReliever=p=>p.pitcher&&p.ratings.stamina<45;
function weightsFor(p){
  if(p.pitcher)return isReliever(p)?OVR_WEIGHTS.reliever:OVR_WEIGHTS.starter;
  if(p.pos==='DH')return OVR_WEIGHTS.dh;
  return ['C','SS','CF'].includes(p.pos)?OVR_WEIGHTS.premium:OVR_WEIGHTS.hitter;
}
export function weightedRating(p){
  const w=weightsFor(p);
  return Object.entries(w).reduce((s,[k,x])=>s+x*p.ratings[k],0)-(isReliever(p)?RELIEVER_PENALTY:0);
}
const clamp=v=>Math.max(20,Math.min(80,Math.round(v)));
export const ovr=p=>clamp(50+OVR_SPREAD*(weightedRating(p)-OVR_BASE.mean)/OVR_BASE.sd);
// POT는 OVR보다 낮을 수 없고 80을 넘지 않는다.
export const potCap=(pot,current)=>Math.min(80,Math.max(current,pot));
