/** 연봉 협상(오프시즌 ③). 요구액 산정, 내 팀 제시·연봉조정, 전원 수용, 확정. 기록은 state.offseason.salary. 상태는 제자리 변경한다. */
import {teams,teamPlayers} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {seasonLine} from '../league-season.js';
import {FIN,ovrValue,serviceFactor,serviceYears,canAfford,hash01,domesticPayroll} from './finance.js';

export const SALARY={
  perfWeight:.4,minPA:100,minIP:30,
  raise:.6,cut:.5,cutCap:{big:.4,small:.3,line:10000}, // 삭감 상한: 1억 이상 40% · 미만 30%
  accept:[[.95,.85],[.90,.60],[.85,.35],[.80,.15]],   // 제시/요구 비율 → 수락 확률
  clubWins:.7,                                        // 연봉조정 구단안 채택 확률
};
const round100=v=>Math.round(v/100)*100;
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const spread=(a,m)=>Math.sqrt(mean(a.map(x=>(x-m)**2)))||1;
const line=(p,year)=>seasonLine(p.history?.[year],p.pitcher);
const ipOf=l=>l.outs/3;

/** 방금 끝난 시즌의 리그 기준(타자 100타석+, 투수 30이닝+) OPS·평균자책 평균과 표준편차. */
export function leaguePerf(state,year){
  const all=teams.flatMap((_,i)=>teamPlayers(state,i)),lines=all.map(p=>[p,line(p,year)]);
  const bat=lines.filter(([p,l])=>!p.pitcher&&l.pa>=SALARY.minPA).map(([,l])=>l.ops);
  const pit=lines.filter(([p,l])=>p.pitcher&&ipOf(l)>=SALARY.minIP).map(([,l])=>l.era);
  const bm=bat.length?mean(bat):.7,pm=pit.length?mean(pit):4.5;
  return {bat:{mean:bm,sd:spread(bat,bm)},pit:{mean:pm,sd:spread(pit,pm)}};
}
/** 가치 = OVR 가치 × (1−0.4w) + 성적 가치 × 0.4w. w는 출전 비중. */
export function playerValue(p,year,perf){
  const l=line(p,year),base=ovrValue(p);
  const w=p.pitcher?ipOf(l)/(ipOf(l)+60):l.pa/(l.pa+200);
  if(!w)return base;
  const z=p.pitcher?(perf.pit.mean-l.era)/perf.pit.sd:(l.ops-perf.bat.mean)/perf.bat.sd;
  const perfValue=Math.max(0,(50+8*z-45)/5),k=SALARY.perfWeight*w;
  return base*(1-k)+perfValue*k;
}
export const cutFloor=prev=>round100(prev*(1-(prev>=SALARY.cutCap.line?SALARY.cutCap.big:SALARY.cutCap.small)));
export function demandSalary(p,year,perf){
  const fair=Math.max(FIN.minSalary,playerValue(p,year,perf)*FIN.marketUnit*serviceFactor(serviceYears(p))),prev=p.contract.salary;
  const raw=fair>=prev?prev+(fair-prev)*SALARY.raise:Math.max(cutFloor(prev),prev-(prev-fair)*SALARY.cut);
  return Math.max(FIN.minSalary,round100(raw));
}
export const acceptChance=ratio=>ratio>=1?1:(SALARY.accept.find(([min])=>ratio>=min-1e-9)?.[1]??0);
export const negotiable=(p,year)=>!p.foreign&&p.contract?.years===1&&p.faYear!==year;

const record=o=>(o.salary??={});
export function offerSalary(state,id,offer){
  if(!Number.isFinite(offer))return {ok:false,reason:'제시액을 숫자로 입력해 주세요.'};
  offer=round100(offer);
  const o=state.offseason,p=state.players.find(x=>x.id===id);
  if(!o||o.step!=='salary')return {ok:false,reason:'연봉 협상 단계가 아닙니다.'};
  if(!p||!negotiable(p,o.year))return {ok:false,reason:'협상 대상이 아닙니다.'};
  if(record(o)[id])return {ok:false,reason:'이미 협상을 마친 선수입니다.'};
  const floor=cutFloor(p.contract.salary);
  if(offer<floor)return {ok:false,reason:`삭감 한도(${floor.toLocaleString('ko-KR')}만) 아래로 제시할 수 없습니다.`};
  const demand=demandSalary(p,o.year,leaguePerf(state,o.year));
  const check=canAfford(state,0,{salary:Math.max(offer,demand),replacing:p.contract.salary});
  if(!check.ok)return {ok:false,reason:offer>=demand?check.reason:`선수안(요구액)이 채택되면 ${check.reason}`};
  let result='accepted',salary=offer;
  if(offer<demand&&hash01(`${o.year}:${id}:accept`)>=acceptChance(offer/demand)){
    result=hash01(`${o.year}:${id}:arbitration`)<SALARY.clubWins?'club':'player';
    if(result==='player')salary=demand;
  }
  record(o)[id]={demand,offer,result,salary};
  o.log.push(`${p.name} 연봉 ${({accepted:'합의',club:'조정(구단안)',player:'조정(선수안)'})[result]} ${salary.toLocaleString('ko-KR')}만`);
  return {ok:true,reason:'',result,salary};
}
/** 내 팀에서 아직 협상하지 않은 대상 전원을 요구액으로. 처리한 인원을 돌려준다. */
export function acceptAllDemands(state){
  const o=state.offseason,perf=leaguePerf(state,o.year);let n=0;
  for(const p of state.players)if(negotiable(p,o.year)&&!record(o)[p.id]){const d=demandSalary(p,o.year,perf);record(o)[p.id]={demand:d,result:'demand',salary:d};n++;}
  return n;
}
/** AI가 캡을 넘으면 OVR 낮은 국내 선수부터 자유계약 시장으로(최소 규칙). */
function aiCapRelease(state,team){
  const o=state.offseason;
  while(domesticPayroll(teamPlayers(state,team))>state.finance.cap){
    const p=teamPlayers(state,team).filter(x=>!x.foreign).sort((a,b)=>a.ovr-b.ovr)[0];
    if(!p)break;
    state.league[team]=state.league[team].filter(x=>x.id!==p.id);
    (o.freeAgents??=[]).push({...p,group:'second',fromTeam:team,contract:null});
    o.log.push(`${teams[team]} ${p.name} 방출(캡 초과)`);
  }
}
/** ③을 떠날 때: 내 팀 미처리 수용, 전 구단 대상 확정, 다년 1년 차감, FA 자격자 임시 재계약(PR 4 전), AI 캡 초과 방출. */
export function settleSalaries(state){
  const o=state.offseason,year=o.year,perf=leaguePerf(state,year);
  acceptAllDemands(state);
  teams.forEach((_,team)=>{
    for(const p of teamPlayers(state,team)){
      if(p.foreign||!p.contract)continue;
      if(team===0&&record(o)[p.id]){p.contract={salary:record(o)[p.id].salary,years:1,kind:'reserve'};continue;}
      if(p.contract.years>1){p.contract.years-=1;continue;}
      const d=demandSalary(p,year,perf);
      if(p.faYear===year)p.faYear=year+FIN.refaSeasons; // PR 4(FA)에서 시장으로 교체
      p.contract={salary:d,years:1,kind:'reserve'};
    }
    if(team>0)aiCapRelease(state,team);
  });
}
