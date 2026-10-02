// game/contract/offseason.js
/** 오프시즌 단계 진행. 시즌 종료(phase 'ended') 뒤 ①~⑥을 거쳐 다음 시즌 개막 전으로 넘어간다. 상태는 제자리 변경한다. */
import {standings,closeSeason,ageLeague,prepareNextSeason} from '../league-season.js';
import {teams,teamPlayers,positions} from '../../model.js';
import {settleIncome,money} from './finance.js';
import {settleSalaries,projectedPayroll} from './salary.js';
import {beginFA,endFA,FA} from './fa.js';
import {FILL} from './league-fill.js';
import {runRetirements,aiReleaseOverflow,ageFreeAgents,retireUnsigned} from './release.js';

export const STEPS=['close','retire','salary','fa','foreign','roster'];
export const STEP_LABELS={close:'시즌 마감',retire:'은퇴·방출',salary:'연봉 협상',fa:'FA',foreign:'외국인 계약',roster:'로스터 확정'};

export function beginOffseason(state){
  if(state.season.phase!=='ended'||state.offseason)return false;
  const order=standings(state).map(r=>r.team),year=state.season.year;
  settleIncome(state,order);
  for(const f of Object.values(state.finance.teams))f.extra=0; // FA 보상금 가감은 시즌 단위
  closeSeason(state);
  state.offseason={step:'close',year,finalOrder:order,log:[`${year} 시즌 종료 · 1위 ${teams[order[0]]}`],freeAgents:[],retired:[]};
  return true;
}
/** 지금 단계를 떠날 수 없는 이유(없으면 null). */
export function stepBlock(state){
  const o=state.offseason;
  if(o?.step==='salary'){const over=projectedPayroll(state)-state.finance.cap;if(over>0)return `캡 초과 ${money(over)} — 선수를 방출하거나 낮게 제시해 주세요.`;}
  if(o?.step==='fa'&&o.fa&&o.fa.round<FA.rounds)return `FA 라운드를 모두 진행해 주세요 (${o.fa.round}/${FA.rounds})`;
  if(o?.step==='roster'&&rosterProblems(state).over.some(t=>t.team===0))return `로스터 ${FILL.max}명을 넘었습니다.`;
  return null;
}
export function rosterProblems(state){
  const over=teams.map((_,team)=>({team,count:teamPlayers(state,team).length})).filter(t=>t.count>FILL.max);
  const warnings=[],empty=positions.filter(p=>!state.field[p]);
  if(empty.length)warnings.push(`비어 있는 수비 위치: ${empty.join(', ')}`);
  if(state.rotation.length<5)warnings.push(`선발 로테이션 ${state.rotation.length}명`);
  return {over,warnings};
}
/** 다음 단계로. ①→② 은퇴 판정, ②를 떠날 때 AI 방출·노화, ⑥을 떠날 때 AI 방출·55명 검사·미계약자 은퇴 후 새 시즌. 넘어가지 못하면 false. */
export function nextStep(state){
  const o=state.offseason;
  if(!o)return false;
  o.freeAgents??=[];
  if(o.step==='roster'){
    aiReleaseOverflow(state);
    if(rosterProblems(state).over.length)return false;
    retireUnsigned(state);
    const ret=o.retired??[],n=ret.length,year=o.year;
    prepareNextSeason(state);
    if(n)state.season.news.push(`${year} 오프시즌 은퇴 ${n}명: ${ret.slice(0,10).map(r=>`${teams[r.team]} ${r.name}`).join(', ')}${n>10?` 외 ${n-10}명`:''}`);
    state.offseason=null;
    return true;
  }
  if(o.step==='salary'&&stepBlock(state))return false;
  if(o.step==='retire'){aiReleaseOverflow(state);o.ovrBefore=Object.fromEntries(state.players.filter(p=>!p.foreign).map(p=>[p.id,p.ovr]));ageLeague(state);ageFreeAgents(state);o.log.push('선수단 나이 +1 · 성장·노화 반영');}
  if(o.step==='salary'){beginFA(state);settleSalaries(state);}
  if(o.step==='fa'&&stepBlock(state))return false;
  if(o.step==='fa')endFA(state);
  o.step=STEPS[STEPS.indexOf(o.step)+1];
  if(o.step==='retire')runRetirements(state);
  return true;
}
