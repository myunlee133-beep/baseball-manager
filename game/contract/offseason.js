// game/contract/offseason.js
/** 오프시즌 단계 진행. 시즌 종료(phase 'ended') 뒤 ①~⑥을 거쳐 다음 시즌 개막 전으로 넘어간다. 상태는 제자리 변경한다. */
import {standings,closeSeason,ageLeague,prepareNextSeason} from '../league-season.js';
import {teams,teamPlayers,positions} from '../../model.js';
import {settleIncome} from './finance.js';
import {FILL} from './league-fill.js';

export const STEPS=['close','retire','salary','fa','foreign','roster'];
export const STEP_LABELS={close:'시즌 마감',retire:'은퇴·방출',salary:'연봉 협상',fa:'FA',foreign:'외국인 계약',roster:'로스터 확정'};

export function beginOffseason(state){
  if(state.season.phase!=='ended'||state.offseason)return false;
  const order=standings(state).map(r=>r.team),year=state.season.year;
  settleIncome(state,order);
  closeSeason(state);
  state.offseason={step:'close',year,finalOrder:order,log:[`${year} 시즌 종료 · 1위 ${teams[order[0]]}`]};
  return true;
}
export function rosterProblems(state){
  const over=teams.map((_,team)=>({team,count:teamPlayers(state,team).length})).filter(t=>t.count>FILL.max);
  const warnings=[],empty=positions.filter(p=>!state.field[p]);
  if(empty.length)warnings.push(`비어 있는 수비 위치: ${empty.join(', ')}`);
  if(state.rotation.length<5)warnings.push(`선발 로테이션 ${state.rotation.length}명`);
  return {over,warnings};
}
/** 다음 단계로. ②를 떠날 때 노화, ⑥을 떠날 때 55명 검사 후 새 시즌 준비. 넘어가지 못하면 false. */
export function nextStep(state){
  const o=state.offseason;
  if(!o)return false;
  if(o.step==='roster'){
    if(rosterProblems(state).over.length)return false;
    prepareNextSeason(state);
    state.offseason=null;
    return true;
  }
  if(o.step==='retire'){ageLeague(state);o.log.push('선수단 나이 +1 · 성장·노화 반영');}
  o.step=STEPS[STEPS.indexOf(o.step)+1];
  return true;
}
