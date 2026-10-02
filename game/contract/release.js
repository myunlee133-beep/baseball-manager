// game/contract/release.js
/** 은퇴·방출·자유계약 시장. 시장은 오프시즌 동안만 state.offseason.freeAgents 에 있다. 상태는 제자리 변경한다. */
import {teams,teamPlayers,movePlayer} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {fairSalary,canAfford,hash01} from './finance.js';
import {FILL} from './league-fill.js';

export const RETIRE={
  // [나이 상한, 기본 확률]. 판정은 노화 전 나이로 한다
  byAge:[[32,0],[33,.02],[34,.05],[35,.10],[36,.18],[37,.28],[38,.40],[39,.55],[41,.70],[Infinity,.90]],
  strong:{ovr:60,factor:.5},weak:{ovr:40,factor:1.5},
};
export function retireChance(p){
  if(p.foreign)return 0;
  const base=RETIRE.byAge.find(([max])=>p.age<=max)[1];
  const f=p.ovr>=RETIRE.strong.ovr?RETIRE.strong.factor:p.ovr<=RETIRE.weak.ovr?RETIRE.weak.factor:1;
  return Math.min(1,base*f);
}
/** 팀에서 선수를 뺀다. 내 팀은 movePlayer로 라인업·로테이션·불펜에서 먼저 정리한다. */
export function removeFromTeam(state,team,id){
  if(team===0){movePlayer(state,id,'second');state.players=state.players.filter(p=>p.id!==id);}
  else state.league[team]=state.league[team].filter(p=>p.id!==id);
}
export const toFreeAgent=(p,team)=>({...p,group:'second',role:p.pitcher?null:p.role==='주전'?'벤치':p.role,fromTeam:team,contract:null});

/** ①→② 때 리그 전체 은퇴 판정. 같은 해·같은 선수면 결과가 같다. */
export function runRetirements(state){
  const o=state.offseason,out=[];
  teams.forEach((_,team)=>{
    for(const p of [...teamPlayers(state,team)]){
      if(hash01(`${o.year}:${p.id}:retire`)<retireChance(p)){removeFromTeam(state,team,p.id);out.push({id:p.id,name:p.name,team,age:p.age,ovr:p.ovr});}
    }
  });
  o.retired=out;
  const mine=out.filter(r=>r.team===0).map(r=>r.name);
  o.log.push(`은퇴 ${out.length}명${mine.length?` · ${teams[0]} ${mine.join(', ')}`:''}`);
  return out;
}
export function releasePlayer(state,id){
  const o=state.offseason,p=state.players.find(x=>x.id===id);
  if(!o||!['retire','salary','roster'].includes(o.step)||!p)return false;
  removeFromTeam(state,0,id);
  (o.freeAgents??=[]).push(toFreeAgent(p,0));
  o.log.push(`${teams[0]} ${p.name} 방출`);
  return true;
}
export const askingSalary=p=>fairSalary(p);
export function signFreeAgent(state,id){
  const o=state.offseason;
  if(!o||o.step!=='roster')return {ok:false,reason:'자유계약 선수 영입은 로스터 확정 단계에서 할 수 있습니다.'};
  const k=(o.freeAgents??=[]).findIndex(p=>p.id===id);
  if(k<0)return {ok:false,reason:'자유계약 시장에 없는 선수입니다.'};
  if(state.players.length>=FILL.max)return {ok:false,reason:`로스터 ${FILL.max}명이 찼습니다.`};
  if(o.freeAgents[k].foreign)return {ok:false,reason:'외국인 선수는 자유계약 시장에서 영입할 수 없습니다.'};
  const p=o.freeAgents[k],salary=askingSalary(p),check=canAfford(state,0,{salary});
  if(!check.ok)return check;
  o.freeAgents.splice(k,1);
  const {fromTeam,...rest}=p;
  state.players.push({...rest,team:teams[0],teamIndex:0,group:'second',contract:{salary,years:1,kind:'reserve'}});
  o.log.push(`${teams[0]} ${p.name} 영입(자유계약)`);
  return {ok:true,reason:''};
}
/** AI 구단이 55명을 넘으면 OVR 낮은 국내 선수부터 방출한다(최소 규칙, 게임성 단계에서 교체). */
export function aiReleaseOverflow(state){
  const o=state.offseason;let n=0;
  for(let team=1;team<teams.length;team++){
    while(teamPlayers(state,team).length>FILL.max){
      const p=teamPlayers(state,team).filter(x=>!x.foreign).sort((a,b)=>a.ovr-b.ovr)[0];
      if(!p)break;
      removeFromTeam(state,team,p.id);
      (o.freeAgents??=[]).push(toFreeAgent(p,team));
      n++;
    }
  }
  if(n)o.log.push(`AI 구단 방출 ${n}명`);
  return n;
}
/** 노화 단계에서 시장 선수도 나이를 먹는다(성장·노화 훅은 리그 선수에만 적용). */
export function ageFreeAgents(state){for(const p of state.offseason.freeAgents??[])p.age+=1;}
/** ⑥을 떠날 때 시장에 남은 선수는 은퇴한다. */
export function retireUnsigned(state){
  const o=state.offseason,n=(o.freeAgents??[]).length;
  if(n)o.log.push(`미계약 자유계약 선수 ${n}명 은퇴`);
  o.freeAgents=[];
  return n;
}
