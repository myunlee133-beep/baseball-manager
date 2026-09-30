// game/growth.js
/** 3단계 성장·퇴화. 월간·오프시즌 틱에서 저장 능력치(20–80)를 나이 곡선대로 움직이고 OVR·POT를 다시 계산한다. 상태는 제자리 변경한다.
 *  규칙과 숫자는 docs/superpowers/specs/2026-09-29-growth-decay-design.md. 튜닝은 scripts/growth-smoke.mjs 결과로 한다. */
import {ovr,potCap,isReliever,weightsFor,OVR_BASE,OVR_SPREAD} from './player-ratings.js';
import {teams,teamPlayers} from '../model.js';
import {pushMessage} from './inbox.js';

export const OFFSEASON_SHARE=.7,MONTH_SHARE=.05,MONTH_TICKS=6,NOISE_SD=2;
export const FIRST_MIN_OVR=42,SECOND_MAX_OVR=48;
export const MONTH_PLAY={pa:50,spOuts:39,rpOuts:21};
export const BREAKOUT={young:.05,prime:.02,potMin:8,potMax:15,primeMin:3,primeMax:5};
export const COLLAPSE={age:34,chance:.05,ovr:-5,now:-3};
export const EVENT_OFFSEASON=.6;
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

/** 각성·급락 판정. 일어나면 eventYear·POT·pending 을 고치고 {type, now}(지금 더할 OVR)를 돌려준다. */
function rollEvent(p,{year,key,share,fit,t,inSeason}){
  const dev=p.dev,age=p.age;
  if(dev.eventYear===year)return null;
  const chance=p.foreign?0:age<=26?BREAKOUT.young*(fit?.burst??1)*bloomFactor(t.bloom,age):age<=29?BREAKOUT.prime*bloomFactor(t.bloom,age):0;
  if(chance&&rand(key+':breakout')<chance*share){
    dev.eventYear=year;
    let extra;
    if(age<=26){p.pot=Math.min(80,p.pot+between(key+':potup',BREAKOUT.potMin,BREAKOUT.potMax));extra=curve(age)*(fit?.grow??1)*t.effort;}
    else extra=between(key+':primeup',BREAKOUT.primeMin,BREAKOUT.primeMax);
    const now=inSeason?extra/2:extra;
    dev.pending+=extra-now;
    return {type:'breakout',now};
  }
  if(age>=COLLAPSE.age&&rand(key+':collapse')<COLLAPSE.chance*share){
    dev.eventYear=year;
    const now=inSeason?COLLAPSE.now:COLLAPSE.ovr;
    dev.pending+=COLLAPSE.ovr-now;
    return {type:'collapse',now};
  }
  return null;
}
const merge=(a,b)=>{for(const [k,v] of Object.entries(b)){a[k]=(a[k]||0)+v;if(!a[k])delete a[k];}return a;};
// 외국인(계약 시스템의 foreign)은 성장·각성 없이 하락·급락만 국내와 같다.
const baseChange=(p,fit,t)=>{const c=curve(p.age);if(c>0)return p.foreign?0:c*(fit?.grow??1)*t.effort;return c*t.aging;};

/** 월간 틱(현재 나이). 그달 출전량으로 적정 리그를 판정·누적하고, 연간 변화의 5%와 시즌 중 각성·급락을 반영한다. */
export function rollMonth(p,{year,month,mine,top,fit}){
  const dev=ensureDev(p),t=traits(p.id),key=`${p.id}:${year}:${month}`,before={ovr:p.ovr,pot:p.pot};
  const cur={pa:n(p.stats?.batting,'pa'),outs:n(p.stats?.pitching,'outs')};
  if(!fit){
    fit=judgeFit(p,{mine,played:playedEnough(p,{pa:cur.pa-dev.mark.pa,outs:cur.outs-dev.mark.outs})});
    if(fit?.tag==='firstOk'&&top.has(p.id))fit={...fit,burst:3};
    if(mine&&fit&&p.age<=26){dev.fit.sum+=fit.grow;dev.fit.n++;dev.fit.bsum+=fit.burst;}
  }
  dev.mark=cur;
  const event=rollEvent(p,{year,key,share:(1-EVENT_OFFSEASON)/MONTH_TICKS,fit,t,inSeason:true});
  const changed=grow(p,baseChange(p,fit,t)*MONTH_SHARE,key+':m',p.age<=26);
  if(event)merge(changed,grow(p,event.now,key+':e',p.age<=26));
  p.pot=potCap(p.pot,p.ovr);
  return {changed,before,event};
}

/** 오프시즌 틱(나이 +1 뒤 새 나이). 시즌 평균 적정 계수로 연간 변화의 70% + 개인차 + pending, 각성·급락, POT 규칙. */
export function rollOffseason(p,{year,mine,top,fit}){
  const dev=ensureDev(p),t=traits(p.id),key=`${p.id}:${year}:0`,before={ovr:p.ovr,pot:p.pot},age=p.age;
  if(!fit){
    if(mine&&dev.fit.n)fit={tag:'season',grow:dev.fit.sum/dev.fit.n,burst:dev.fit.bsum/dev.fit.n};
    else{fit=judgeFit(p,{mine,played:true});if(fit?.tag==='firstOk'&&top.has(p.id))fit={...fit,burst:3};}
  }
  const pending=dev.pending;dev.pending=0;
  const event=rollEvent(p,{year,key,share:EVENT_OFFSEASON,fit,t,inSeason:false});
  const dOvr=baseChange(p,fit,t)*OFFSEASON_SHARE+NOISE_SD*normal(key+':noise')+pending+(event?.now||0);
  const changed=grow(p,dOvr,key,age<=26);
  if(age>=27||p.foreign)p.pot=p.ovr;
  else if(age>=24){let rest=0;for(let a=age+1;a<=26;a++)rest+=curve(a);p.pot=Math.round(p.pot+(p.ovr+rest-p.pot)*.25);}
  p.pot=potCap(p.pot,p.ovr);
  dev.fit={sum:0,n:0,bsum:0};dev.mark={pa:0,outs:0};
  return {changed,before,event};
}

export const SCOUT='스카우트 팀장';
const everyone=state=>teams.flatMap((_,i)=>teamPlayers(state,i).map(p=>({p,mine:i===0})));
const sign=v=>v>0?`+${v}`:v<0?`−${-v}`:'0';
const fmtChanges=c=>Object.entries(c).map(([k,v])=>`${LABEL[k]} ${sign(v)}`).join(' · ');

function eventMessage({p,type,before}){
  if(type==='breakout')return {subject:`긴급 스카우트 리포트: ${p.name}, ${p.pitcher?'투구':'타격'}에 눈을 떴습니다`,
    body:[{p:`${p.name}(${p.age}세)의 기량이 한 단계 올라섰습니다. 평가를 올립니다.`},{table:{head:['','이전','이후'],rows:[['OVR',before.ovr,p.ovr],['POT',before.pot,p.pot]]}}]};
  return {subject:`긴급 스카우트 리포트: ${p.name}의 기량이 눈에 띄게 떨어졌습니다`,
    body:[{p:`${p.name}(${p.age}세)에게서 하락 조짐이 뚜렷합니다.`},{table:{head:['','이전','이후'],rows:[['OVR',before.ovr,p.ovr]]}}]};
}
/** 내 팀 이벤트는 중요 메시지, 다른 팀 이벤트는 시즌 중에만 리그 소식 한 줄. */
function announce(state,events,inSeason){
  for(const e of events){
    if(e.mine)pushMessage(state,{from:SCOUT,importance:'high',...eventMessage(e)});
    else if(inSeason)state.season.news=[...state.season.news,`${e.p.team} ${e.p.name}, ${e.type==='breakout'?'기량 급성장':'기량 급락'}`].slice(-20);
  }
}

/** hooks.monthlyTick. 새 달 1일에 호출된다. */
export function monthlyGrowth(state){
  const s=state.season,year=s.year,month=Number(s.date.slice(5,7));
  const frac=s.schedule.filter(g=>g.status==='final').length/Math.max(1,s.schedule.length);
  const list=everyone(state),top=topPerformers(list.map(x=>x.p),frac,p=>p.stats);
  const rows=[],events=[];
  for(const {p,mine} of list){
    const r=rollMonth(p,{year,month,mine,top});
    if(r.event)events.push({p,mine,type:r.event.type,before:r.before});
    if(mine&&Object.keys(r.changed).length)rows.push([p.name,fmtChanges(r.changed),`${r.before.ovr} → ${p.ovr}`]);
  }
  if(rows.length)pushMessage(state,{from:SCOUT,subject:`${month-1}월 스카우트 리포트`,
    body:[{p:`지난달 능력치가 바뀐 선수 ${rows.length}명입니다.`},{table:{head:['선수','변화','OVR'],rows}}]});
  announce(state,events,true);
  return {events};
}

/** hooks.offseasonTick. 나이 +1 뒤, 새 시즌 생성 전에 호출된다. state.season.year 는 끝난 시즌. */
export function offseasonGrowth(state){
  const year=state.season.year,list=everyone(state);
  const top=topPerformers(list.map(x=>x.p),1,p=>p.history?.[year]);
  const mineRows=[],events=[];
  for(const {p,mine} of list){
    const h=(p.history??={})[year]??={};h.ovr=p.ovr;h.pot=p.pot;
    const r=rollOffseason(p,{year,mine,top});
    if(r.event)events.push({p,mine,type:r.event.type,before:r.before});
    if(mine)mineRows.push({p,before:r.before});
  }
  mineRows.sort((a,b)=>Math.abs(b.p.ovr-b.before.ovr)-Math.abs(a.p.ovr-a.before.ovr));
  const body=[{p:`${year} 시즌을 마친 뒤의 평가입니다. 나이는 새 시즌 기준입니다.`},
    {table:{head:['선수','나이','OVR','POT'],rows:mineRows.map(({p,before})=>[p.name,p.age,`${before.ovr} → ${p.ovr} (${sign(p.ovr-before.ovr)})`,`${before.pot} → ${p.pot}`])}}];
  if(events.length)body.push({p:'리그 전체 각성·급락'},{table:{head:['구단','선수','나이','구분','OVR'],
    rows:events.map(e=>[e.p.team,e.p.name,e.p.age,e.type==='breakout'?'각성':'급락',`${e.before.ovr} → ${e.p.ovr}`])}});
  announce(state,events,false);
  pushMessage(state,{from:SCOUT,importance:'high',subject:`${year} 오프시즌 스카우트 리포트`,body});
  return {events};
}
