// game/contract/fa.js
/** FA(오프시즌 ④): 자격자를 시장으로 옮기고 3라운드 입찰로 계약한다. 기록은 state.offseason.fa. 상태는 제자리 변경한다. */
import {teams,teamPlayers} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {FIN,canAfford,teamFinance,hash01,money} from './finance.js';
import {leaguePerf,playerValue} from './salary.js';
import {removeFromTeam,toFreeAgent} from './release.js';
import {FILL} from './league-fill.js';

export const FA={
  rounds:3,maxYears:4,maxExternal:3,protect:12,
  gradeRank:{A:3,B:10},                      // 구단 내 연봉 순위: 3위 이내 A, 10위 이내 B, 그 밖 C
  comp:{A:{money:3,player:2},B:{money:2,player:1.5}}, // 보상금 배수(직전 연봉 기준): 보상금만 / 보상선수 + 보상금. C는 없음
  market:.6,askFloor:.7,                     // 요구액 = max(가치 × 시장단가 × .6, 직전 연봉 × .7)
  hold:[1.05,1,.95],                         // 라운드별 선수가 받아들이는 점수 배수(앞 라운드일수록 더 요구)
  homeBonus:.10,contenderBonus:.10,durationStep:.06,
  aiPremium:[.95,1.2],
  keepRoster:50,                             // AI 원소속팀은 인원이 이보다 적으면 OVR과 무관하게 재계약 제시                       // AI 구단 제시액 = 요구액 × (0.95 ~ 1.20, 구단·선수별 해시)
};
const round100=v=>Math.round(v/100)*100;
const aiYears=p=>p.age>=30?3:2;
/** 30세 이상은 긴 계약, 27세 이하는 짧은 계약을 선호한다(연봉 기준 보정). */
export const durationPref=(years,age)=>1+(age>=30?1:age<=27?-1:0)*FA.durationStep*(years-2);
export const contenderBonus=(o,team)=>FA.contenderBonus*(teams.length-1-Math.max(0,o.finalOrder.indexOf(team)))/(teams.length-1);
export function offerScore(o,entry,offer){
  const bonus=(offer.team===entry.fromTeam?FA.homeBonus:0)+contenderBonus(o,offer.team);
  return offer.salary*durationPref(offer.years,entry.player.age)*(1+bonus);
}
const grade=rank=>rank<FA.gradeRank.A?'A':rank<FA.gradeRank.B?'B':'C';

/** ③ 정산 직전에 부른다: FA 자격자(계약 마지막 해 + faYear == 올해)를 팀에서 빼 시장 풀로 옮긴다. */
export function beginFA(state){
  const o=state.offseason,year=o.year,perf=leaguePerf(state,year),pool=[];
  teams.forEach((_,team)=>{
    const dom=teamPlayers(state,team).filter(p=>!p.foreign&&p.contract);
    const rank=new Map([...dom].sort((a,b)=>b.contract.salary-a.contract.salary).map((p,k)=>[p.id,k]));
    for(const p of dom.filter(p=>p.faYear===year&&p.contract.years===1)){
      const prev=p.contract.salary,ask=Math.max(FIN.minSalary,round100(Math.max(playerValue(p,year,perf)*FIN.marketUnit*FA.market,prev*FA.askFloor)));
      removeFromTeam(state,team,p.id);
      pool.push({id:p.id,fromTeam:team,grade:grade(rank.get(p.id)),prev,ask,player:toFreeAgent(p,team)});
    }
  });
  o.fa={round:0,pool,mine:{},signed:Object.fromEntries(teams.map((_,i)=>[i,0])),log:[]};
  o.log.push(`FA 시장 개장 · 자격자 ${pool.length}명`);
}
/** 보상 방식을 정한다: 보상금만 낼 수 있으면 보상금, 아니면 보호선수(12명) 외 최고 OVR 1명 + 보상금. 불가능하면 null. */
export function compensation(state,entry,team,salary){
  const c=FA.comp[entry.grade];
  if(!c||team===entry.fromTeam)return {kind:'none',money:0};
  const room=teamFinance(state,team).budgetRoom,pay=Math.round(entry.prev*c.money);
  if(room>=salary+pay)return {kind:'money',money:pay};
  const roster=teamPlayers(state,team).filter(p=>!p.foreign),protect=new Set([...roster].sort((a,b)=>b.ovr-a.ovr).slice(0,FA.protect).map(p=>p.id));
  const target=roster.filter(p=>!protect.has(p.id)).sort((a,b)=>b.ovr-a.ovr)[0],pay2=Math.round(entry.prev*c.player);
  if(!target||room<salary+pay2||teamFinance(state,entry.fromTeam).capRoom<target.contract.salary)return null;
  return {kind:'player',money:pay2,playerId:target.id};
}
/** 내 팀 제시: 라운드가 끝나기 전까지 선수당 하나, 덮어쓸 수 있다. */
export function offerFa(state,id,{years,salary}){
  const o=state.offseason,fa=o?.fa;
  if(!o||o.step!=='fa'||!fa)return {ok:false,reason:'FA 단계가 아닙니다.'};
  if(fa.round>=FA.rounds)return {ok:false,reason:'라운드가 모두 끝났습니다.'};
  const entry=fa.pool.find(e=>e.id===id&&e.signedBy===undefined);
  if(!entry)return {ok:false,reason:'계약 가능한 FA가 아닙니다.'};
  if(!Number.isFinite(salary)||!Number.isInteger(years)||years<1||years>FA.maxYears)return {ok:false,reason:'기간(1~4년)과 연봉을 확인해 주세요.'};
  salary=round100(salary);
  if(salary<FIN.minSalary)return {ok:false,reason:`최저연봉(${FIN.minSalary.toLocaleString('ko-KR')}만) 이상이어야 합니다.`};
  const check=canAfford(state,0,{salary});
  if(!check.ok)return check;
  fa.mine[id]={years,salary};
  return {ok:true,reason:''};
}
function sign(state,entry,offer){
  const o=state.offseason,fa=o.fa,p=entry.player,{team,years,salary}=offer,year=o.year;
  const comp=compensation(state,entry,team,salary);
  Object.assign(p,{team:teams[team],teamIndex:team,group:'second',contract:{salary,years,kind:'fa'},faYear:year+years});
  delete p.fromTeam;
  if(team>0){ // AI: 1군 후보면 같은 유형 최저 OVR 1군을 2군으로 내리고 보직 부여
    const first=p.ovr>=50;
    p.group=first?'first':'second';p.role=p.pitcher?(p.ratings.stamina>=45?'SP':'RP'):(first?'주전':'벤치');
    if(first){const out=teamPlayers(state,team).filter(x=>!x.foreign&&x.group==='first'&&x.pitcher===p.pitcher).sort((a,b)=>a.ovr-b.ovr)[0];if(out){out.group='second';if(out.role==='주전')out.role='벤치';if(out.role==='SP')out.role='RP';}}
  }
  (team?state.league[team]:state.players).push(p);
  entry.signedBy=team;entry.years=years;entry.salary=salary;
  if(team!==entry.fromTeam)fa.signed[team]++;
  const f=state.finance.teams;
  let note='';
  if(comp.money){
    f[team].extra=(f[team].extra??0)-comp.money;f[entry.fromTeam].extra=(f[entry.fromTeam].extra??0)+comp.money;
    note=` · 보상금 ${money(comp.money)}`;
  }
  if(comp.kind==='player'){
    const q=state.league[team]?.find(x=>x.id===comp.playerId)??state.players.find(x=>x.id===comp.playerId);
    removeFromTeam(state,team,q.id);
    Object.assign(q,{team:teams[entry.fromTeam],teamIndex:entry.fromTeam,group:'second'});if(q.role==='주전')q.role='벤치';
    (entry.fromTeam?state.league[entry.fromTeam]:state.players).push(q);
    note+=` · 보상선수 ${q.name}`;
  }
  const line=`${p.name}(${entry.grade}) → ${teams[team]} ${years}년 ${money(salary)}${note}`;
  o.log.push(`FA 계약 ${line}`);fa.log.push(line);
}
/** 한 라운드 진행: AI 제시 생성 → 선수별로 유효한 최고 점수 제시를 고르고 기준 이상이면 계약. */
export function runFaRound(state){
  const o=state.offseason,fa=o?.fa;
  if(!o||o.step!=='fa'||!fa||fa.round>=FA.rounds)return false;
  const year=o.year,th=FA.hold[fa.round];fa.round++;
  const open=()=>fa.pool.filter(e=>e.signedBy===undefined);
  const offers=new Map(fa.pool.map(e=>[e.id,[]]));
  for(const [id,m] of Object.entries(fa.mine))if(offers.has(id))offers.get(id).push({team:0,...m});
  const aiOffer=(team,e)=>({team,years:aiYears(e.player),salary:round100(e.ask*(FA.aiPremium[0]+(FA.aiPremium[1]-FA.aiPremium[0])*hash01(`${year}:${team}:${e.id}:prem`)))});
  for(let team=1;team<teams.length;team++){
    for(const e of open().filter(e=>e.fromTeam===team&&(e.player.ovr>=45||teamPlayers(state,team).length<FA.keepRoster)))offers.get(e.id).push(aiOffer(team,e)); // 원소속팀 재계약 시도(인원이 모자라면 OVR과 무관하게)
    const t=teamFinance(state,team);
    const target=open().filter(e=>e.fromTeam!==team&&e.player.ovr>=50&&e.ask<=t.capRoom).sort((a,b)=>b.player.ovr-a.player.ovr)[0]; // 외부 영입: 여유 안에서 최고 OVR 1명
    if(target)offers.get(target.id).push(aiOffer(team,target));
  }
  for(const e of [...open()].sort((a,b)=>b.player.ovr-a.player.ovr)){
    const valid=offers.get(e.id).filter(of=>{
      if(teamPlayers(state,of.team).length>=FILL.max)return false;
      if(of.team!==e.fromTeam&&fa.signed[of.team]>=FA.maxExternal)return false;
      return canAfford(state,of.team,{salary:of.salary}).ok&&compensation(state,e,of.team,of.salary)!==null;
    }).sort((a,b)=>offerScore(o,e,b)-offerScore(o,e,a)||a.team-b.team);
    const best=valid[0];
    if(best&&offerScore(o,e,best)>=e.ask*th)sign(state,e,best);
  }
  const left=open().length;
  o.log.push(`FA ${fa.round}라운드 종료 · 계약 ${fa.pool.length-left}명 / 남은 선수 ${left}명`);
  return true;
}
/** ④를 떠날 때: 계약하지 못한 선수는 자유계약 시장(⑥ 영입, 끝나면 은퇴)으로. */
export function endFA(state){
  const o=state.offseason,fa=o.fa;
  if(!fa)return;
  const rest=fa.pool.filter(e=>e.signedBy===undefined);
  (o.freeAgents??=[]).push(...rest.map(e=>e.player));
  if(rest.length)o.log.push(`FA 미계약 ${rest.length}명 → 자유계약 시장`);
}
