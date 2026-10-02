// game/contract/finance.js
/** 계약·재정: 연봉 산정, 하드캡, 구단 예산. 금액 단위는 모두 만 원(1억 = 10,000). */
import {teams,teamPlayers} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {SALARY_2026} from './salary-2026.js';

export const FIN={
  cap:1400000,                    // 140억. 국내 선수 전원 연봉 합계 상한(하드캡). 외국인 제외
  minSalary:3000,                 // 최저연봉 3,000만
  marketUnit:50000,               // 가치 1당 시장단가 5억
  service:[[3,.2],[6,.4],[Infinity,.6]], // 연차 상한 → 계수 (FA 전 협상력)
  // 모기업 지원금(팀 번호 순: KT 삼성 한화 SSG 키움 NC LG 롯데 두산 KIA). 상 170억 / 중 150억 / 하 120억
  support:[1500000,1700000,1500000,1700000,1200000,1500000,1700000,1500000,1500000,1700000],
  rankTop:200000,rankStep:20000,  // 순위 수입 1위 20억, 한 계단마다 2억 감소
  firstYearIncome:100000,         // 전년 순위가 없는 첫 시즌 10억
  krwPerUsd:.14,                  // 1달러 = 1,400원 = 0.14만 원
  generatedSalary:[3000,4000],    // 가상 선수 연봉 범위
  entryAge:{hs:19,college:23},faSeasons:{hs:8,college:7},refaSeasons:4,
  militaryAge:27,militaryYears:2, // 27세 이상은 군 복무 2년을 뺀다(추정)
};

const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;};
export const hash01=hash; // 재현 가능한 0~1 판정(은퇴 등)

export const money=v=>v<0?`-${money(-v)}`:v>=10000?`${Number((v/10000).toFixed(1))}억`:`${Math.round(v).toLocaleString('ko-KR')}만`;
export const ovrValue=p=>Math.max(0,(p.ovr-45)/5);
export const serviceFactor=years=>FIN.service.find(([max])=>years<=max)[1];
export const entryOf=p=>p.entry??(hash(`${p.id}:entry`)<.6?'hs':'college');
export const serviceYears=p=>Math.max(0,p.age-FIN.entryAge[entryOf(p)]-(p.age>=FIN.militaryAge?FIN.militaryYears:0));
/** 이번 시즌이 끝난 뒤 FA가 되면 year. 자격 시즌 수를 이미 넘긴 선수는 4시즌 재자격 주기로 본다. */
export function estimateFaYear(p,year){
  const left=FIN.faSeasons[entryOf(p)]-(serviceYears(p)+1);
  if(left>=0)return year+left;
  const over=-left%FIN.refaSeasons;
  return year+(over?FIN.refaSeasons-over:0);
}
export const fairSalary=(p,value=ovrValue(p))=>Math.max(FIN.minSalary,Math.round(value*FIN.marketUnit*serviceFactor(serviceYears(p))/100)*100);

/** 계약 필드가 없는 선수에게 첫 계약을 붙인다. 실제 조사값 → 원문 faYear → 추정 순. 외국인 계약은 league-fill 이 만든다. */
export function assignContract(p,year){
  if(p.foreign||p.contract)return p;
  const real=SALARY_2026[p.id];
  p.entry=entryOf(p);
  p.faYear=p.faYear??real?.faYear??estimateFaYear(p,year);
  const [lo,hi]=FIN.generatedSalary;
  const salary=real?.salary??(p.generated?lo+Math.round(hash(`${p.id}:pay`)*(hi-lo)/100)*100:fairSalary(p));
  p.contract={salary,years:real?.years??1,kind:real?.kind??'reserve'};
  return p;
}

export const domesticPayroll=players=>players.reduce((s,p)=>s+(p.foreign?0:p.contract?.salary??0),0);
export const foreignPayroll=players=>players.reduce((s,p)=>s+(p.foreign?p.contract?.salary??0:0),0);
export const createFinance=()=>({cap:FIN.cap,teams:Object.fromEntries(teams.map((_,i)=>[i,{support:FIN.support[i],income:FIN.firstYearIncome}]))});

export function teamFinance(state,i){
  const players=teamPlayers(state,i),f=state.finance.teams[i],dom=domesticPayroll(players),fx=foreignPayroll(players),budget=f.support+f.income+(f.extra??0);
  return {cap:state.finance.cap,capUsed:dom,capRoom:state.finance.cap-dom,budget,budgetUsed:dom+fx,budgetRoom:budget-dom-fx,count:players.length};
}
/** 계약을 맺으면 캡·예산을 넘는지. replacing은 이 계약으로 사라지는 기존 연봉(재계약 등). */
export function canAfford(state,i,{salary,foreign=false,replacing=0}){
  const t=teamFinance(state,i),extra=salary-replacing;
  if(!foreign&&extra>t.capRoom)return {ok:false,reason:`캡 초과 ${money(extra-t.capRoom)}`};
  if(extra>t.budgetRoom)return {ok:false,reason:`예산 초과 ${money(extra-t.budgetRoom)}`};
  return {ok:true,reason:''};
}
export const rankIncome=rank=>FIN.rankTop-(rank-1)*FIN.rankStep;
/** order: 최종 순위 순서의 팀 번호 배열. 다음 시즌 예산의 순위 수입을 정한다. */
export function settleIncome(state,order){order.forEach((team,k)=>{state.finance.teams[team].income=rankIncome(k+1);});}
