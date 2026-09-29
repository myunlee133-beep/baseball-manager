// game/growth.js
/** 3단계 성장·퇴화. 월간·오프시즌 틱에서 저장 능력치(20–80)를 나이 곡선대로 움직이고 OVR·POT를 다시 계산한다. 상태는 제자리 변경한다.
 *  규칙과 숫자는 docs/superpowers/specs/2026-09-29-growth-decay-design.md. 튜닝은 scripts/growth-smoke.mjs 결과로 한다. */
import {ovr,isReliever,weightsFor,OVR_BASE,OVR_SPREAD} from './player-ratings.js';

export const OFFSEASON_SHARE=.7,MONTH_SHARE=.05,MONTH_TICKS=6,NOISE_SD=2;
export const FIRST_MIN_OVR=42,SECOND_MAX_OVR=48;
export const MONTH_PLAY={pa:50,spOuts:39,rpOuts:21};
// 성장기·하락기 능력치별 배율. OVR 가중치로 정규화하므로 OVR 변화량은 곡선 그대로다.
export const MULT={
  grow:{contact:1,eye:.8,power:1.2,speed:.8,defense:1,velocity:1.2,stuff:1,control:1,stamina:1},
  fall:{contact:1,eye:.5,power:1,speed:1.5,defense:1.2,velocity:1.5,stuff:1,control:.5,stamina:1.2},
};
export const LABEL={contact:'컨택',eye:'선구안',power:'파워',speed:'스피드',defense:'수비',velocity:'구속',stuff:'구위',control:'제구',stamina:'체력'};
const KEYS={hitter:['contact','eye','power','speed','defense'],pitcher:['velocity','stuff','control','stamina']};

export const blankDev=()=>({fit:{sum:0,n:0,bsum:0},mark:{pa:0,outs:0},pending:0,eventYear:null});
export const ensureDev=p=>p.dev??=blankDev();

/** 새 나이(오프시즌) 또는 현재 나이(월간)의 연간 평균 OVR 변화. */
export function curve(age){
  if(age<=21)return 4.5;if(age<=23)return 3.5;if(age<=25)return 2.5;if(age===26)return 1.5;
  if(age<=31)return 0;if(age<=33)return -1;if(age<=35)return -2;if(age<=37)return -3;return -4.5;
}

// 문자열 키 해시 난수. 같은 키는 언제나 같은 값이라 같은 저장에서 다시 돌리면 결과가 같다.
// game/ratings.js 의 spread 는 끝 글자만 다른 키끼리 값이 붙어 나와(최종 섞기 없음) 여기서는 FNV-1a + murmur3 finalizer 를 쓴다.
export function rand(key){
  let h=2166136261;
  for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
  return (h>>>0)/4294967296;
}
export function normal(key){const u=Math.max(1e-9,rand(key+':u')),v=rand(key+':v');return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
export const between=(key,lo,hi)=>lo+Math.floor(rand(key)*(hi-lo+1));

/** 선수마다 고정된 숨은 특성. 저장하지 않는다. */
export function traits(id){
  const r=k=>rand(`${id}:trait:${k}`),b=r('bloom');
  return {effort:.85+.3*r('effort'),bloom:b<.25?'early':b<.75?'normal':'late',adapt:r('adapt'),aging:.6+.8*r('aging')};
}
export function bloomFactor(bloom,age){if(bloom==='normal')return 1;return (bloom==='early')===(age<=23)?1.5:.5;}

/** 26세 이하 적정 리그 판정. 내 팀만 판정하고 AI 구단은 항상 적정(AI 1·2군 이동이 생길 때까지의 임시 규칙). 부상자는 null. */
export function judgeFit(p,{mine,played}){
  if(!mine)return {tag:'ai',grow:1.2,burst:2};
  if(p.group==='first'){
    if(p.ovr<FIRST_MIN_OVR)return {tag:'over',grow:.8+.2*traits(p.id).adapt,burst:1};
    if(!played)return {tag:'bench',grow:.7,burst:.5};
    return {tag:'firstOk',grow:1.2,burst:2};
  }
  if(p.group==='second')return p.ovr<SECOND_MAX_OVR?{tag:'secondOk',grow:1.2,burst:2}:{tag:'under',grow:.7,burst:.5};
  return null;
}
/** d = 그달 증가분 {pa, outs}. */
export function playedEnough(p,d){
  if(!p.pitcher)return d.pa>=MONTH_PLAY.pa;
  return d.outs>=(isReliever(p)?MONTH_PLAY.rpOuts:MONTH_PLAY.spOuts);
}

const n=(o,k)=>o?.[k]||0;
export function ops(b){
  const ab=n(b,'ab'),h=n(b,'h'),bb=n(b,'bb'),hbp=n(b,'hitByPitch'),tb=h+n(b,'doubles')+2*n(b,'triples')+3*n(b,'hr');
  return (h+bb+hbp)/Math.max(1,ab+bb+hbp+n(b,'sacFlies'))+tb/Math.max(1,ab);
}
export const era=q=>n(q,'earnedRuns')*27/Math.max(1,n(q,'outs'));
/** 출전 기준(시즌 200타석·선발 50이닝·불펜 25이닝 × frac)을 채운 선수 중 타자 OPS, 투수 평균자책 상위 25%의 id. lineOf(p) = {batting, pitching}. */
export function topPerformers(players,frac,lineOf){
  const rows=players.map(p=>({p,l:lineOf(p)||{}}));
  const top=(list,score)=>list.sort((a,b)=>score(b)-score(a)).slice(0,Math.ceil(list.length/4)).map(x=>x.p.id);
  const bat=rows.filter(({p,l})=>!p.pitcher&&n(l.batting,'pa')>=200*frac);
  const arm=rows.filter(({p,l})=>p.pitcher&&n(l.pitching,'outs')>=(isReliever(p)?75:150)*frac);
  return new Set([...top(bat,x=>ops(x.l.batting)),...top(arm,x=>-era(x.l.pitching))]);
}

/** OVR 변화량 dOvr 를 능력치에 나눈다. 소수는 key 해시로 확률 반올림하고 20–80으로 자른다. 바뀐 능력치 {키: 변화}. */
export function applyDelta(p,dOvr,key){
  const out={};
  if(!dOvr)return out;
  const m=MULT[dOvr>0?'grow':'fall'],w=weightsFor(p),d=dOvr*OVR_BASE.sd/OVR_SPREAD;
  const k=Object.entries(w).reduce((s,[x,wx])=>s+wx*m[x],0);
  for(const x of KEYS[p.pitcher?'pitcher':'hitter']){
    const c=d*m[x]/(x in w?k:1),base=Math.floor(c),step=base+(rand(`${key}:${x}`)<c-base?1:0);
    const next=Math.max(20,Math.min(80,p.ratings[x]+step));
    if(next!==p.ratings[x]){out[x]=next-p.ratings[x];p.ratings[x]=next;}
  }
  p.ovr=ovr(p);
  return out;
}
/** capped(26세 이하 성장기)면 양수 변화가 POT를 넘지 않게 줄이고, 반올림으로 넘치면 가중치 큰 능력치부터 1씩 되돌린다. */
export function grow(p,dOvr,key,capped){
  if(capped&&dOvr>0)dOvr=Math.min(dOvr,Math.max(0,p.pot-p.ovr));
  const changed=applyDelta(p,dOvr,key);
  if(capped&&p.ovr>p.pot){
    const w=weightsFor(p),order=Object.keys(w).sort((a,b)=>w[b]-w[a]);
    for(let i=0;i<20&&ovr(p)>p.pot;i++){
      const x=order.find(k=>(changed[k]||0)>0)??order.find(k=>p.ratings[k]>20);
      p.ratings[x]--;changed[x]=(changed[x]||0)-1;if(!changed[x])delete changed[x];
    }
    p.ovr=ovr(p);
  }
  return changed;
}
