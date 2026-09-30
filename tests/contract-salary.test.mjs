import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason} from '../game/league-season.js';
import {SALARY,leaguePerf,playerValue,demandSalary,cutFloor,acceptChance,negotiable,offerSalary,acceptAllDemands,settleSalaries} from '../game/contract/salary.js';
import {ovrValue,FIN,domesticPayroll} from '../game/contract/finance.js';

const off=()=>{const s=ensureSeason(initialState());s.offseason={step:'salary',year:2026,finalOrder:teams.map((_,i)=>i),log:[],freeAgents:[],retired:[],salary:{}};return s;};
const noPerf={bat:{mean:.7,sd:.1},pit:{mean:4,sd:1}};

test('가치: 기록이 없으면 OVR 가치, 기록이 많으면 성적 쪽으로',()=>{
  const p={id:'a',age:28,ovr:60,pitcher:false,history:{}};
  assert.equal(playerValue(p,2026,noPerf),ovrValue(p));
  const hot={...p,history:{2026:{batting:{pa:600,ab:500,h:175,doubles:35,hr:30,bb:80,so:80},pitching:{}}}};
  assert.ok(playerValue(hot,2026,noPerf)>ovrValue(p));
  const cold={...p,history:{2026:{batting:{pa:600,ab:560,h:110,so:150,bb:30},pitching:{}}}};
  assert.ok(playerValue(cold,2026,noPerf)<ovrValue(p));
});

test('리그 성적 기준: 기준 타석·이닝 이상만, 표준편차 0 방지',()=>{
  const s=off(),perf=leaguePerf(s,2026);
  assert.ok(perf.bat.sd>0&&perf.pit.sd>0);
});

test('요구액: 인상은 60%, 삭감은 50% 반영, 삭감 상한, 100만 원 단위, 최저 3,000만',()=>{
  const p={id:'a',age:30,entry:'hs',ovr:60,pitcher:false,history:{},contract:{salary:20000,years:1,kind:'reserve'}};
  assert.equal(demandSalary(p,2026,noPerf),62000);
  const q={...p,ovr:45,contract:{salary:50000,years:1,kind:'reserve'}};
  assert.equal(demandSalary(q,2026,noPerf),30000);
  assert.equal(cutFloor(50000),30000);
  assert.equal(cutFloor(8000),5600);
  const r={...p,ovr:40,contract:{salary:3000,years:1,kind:'reserve'}};
  assert.equal(demandSalary(r,2026,noPerf),FIN.minSalary);
});

test('수락 확률 표',()=>{
  assert.equal(acceptChance(1),1);
  assert.equal(acceptChance(.96),.85);
  assert.equal(acceptChance(.90),.60);
  assert.equal(acceptChance(.87),.35);
  assert.equal(acceptChance(.80),.15);
  assert.equal(acceptChance(.79),0);
});

test('협상 대상: 국내·계약 마지막 해·FA 아님',()=>{
  assert.equal(negotiable({contract:{years:1},faYear:2028},2026),true);
  assert.equal(negotiable({contract:{years:2},faYear:2028},2026),false);
  assert.equal(negotiable({contract:{years:1},faYear:2026},2026),false);
  assert.equal(negotiable({foreign:true,contract:{years:1}},2026),false);
});

test('제시: 요구액 이상이면 수락, 선수당 한 번, 단계·하한 검사',()=>{
  const s=off(),p=s.players.find(x=>negotiable(x,2026)),perf=leaguePerf(s,2026),demand=demandSalary(p,2026,perf);
  s.offseason.step='fa';
  assert.equal(offerSalary(s,p.id,demand).ok,false);
  s.offseason.step='salary';
  assert.match(offerSalary(s,p.id,cutFloor(p.contract.salary)-100).reason,/삭감 한도/);
  const r=offerSalary(s,p.id,demand);
  assert.deepEqual([r.ok,r.result,r.salary],[true,'accepted',demand]);
  assert.equal(offerSalary(s,p.id,demand).ok,false);
});

test('낮은 제시: 판정은 재현 가능, 거절이면 연봉조정으로 구단안 또는 선수안',()=>{
  const a=off(),b=off();
  const ids=a.players.filter(x=>negotiable(x,2026)&&x.contract.salary>=6000).slice(0,8).map(x=>x.id);
  const perf=leaguePerf(a,2026);
  const results=ids.map(id=>{const p=a.players.find(x=>x.id===id),d=demandSalary(p,2026,perf),o=Math.max(cutFloor(p.contract.salary),Math.round(d*.86/100)*100);const r=offerSalary(a,id,o);offerSalary(b,id,o);return [r.result,r.salary,d,o];});
  assert.deepEqual(ids.map(id=>a.offseason.salary[id]),ids.map(id=>b.offseason.salary[id]));
  for(const [res,sal,d,o] of results){
    if(res==='accepted'||res==='club')assert.equal(sal,o);
    else assert.equal(sal,d);
  }
});

test('전원 수용과 확정: 대상은 요구액 보류 1년, 다년은 1년 줄고, FA 자격자는 재계약·재자격 +4, 외국인 그대로',()=>{
  const s=off();
  const multi=s.players.find(p=>p.contract?.years>1),fa=s.players.find(p=>!p.foreign&&p.faYear===2026&&p.contract.years===1),foreign=s.players.find(p=>p.foreign);
  const multiYears=multi?.years??multi?.contract.years,foreignC=structuredClone(foreign.contract);
  const n=acceptAllDemands(s);
  assert.ok(n>0);
  assert.ok(Object.values(s.offseason.salary).every(r=>r.result==='demand'));
  settleSalaries(s);
  for(const p of s.players.filter(p=>s.offseason.salary[p.id]))assert.deepEqual(p.contract,{salary:s.offseason.salary[p.id].salary,years:1,kind:'reserve'});
  if(multi)assert.equal(multi.contract.years,multiYears-1);
  if(fa){assert.equal(fa.faYear,2030);assert.equal(fa.contract.years,1);}
  assert.deepEqual(foreign.contract,foreignC);
});

test('AI는 전원 요구액 수용, 캡을 넘으면 OVR 낮은 국내 선수부터 시장으로',()=>{
  const s=off();
  s.finance.cap=domesticPayroll(s.league[3])-1;
  settleSalaries(s);
  assert.ok(domesticPayroll(s.league[3])<=s.finance.cap);
  assert.ok(s.offseason.freeAgents.some(p=>p.fromTeam===3));
});

test('선수안(요구액)이 캡을 넘기면 제시 불가, 기록 없음',()=>{
  const s=off(),perf=leaguePerf(s,2026);
  const p=s.players.find(x=>{if(!negotiable(x,2026))return false;const d=demandSalary(x,2026,perf);return d>cutFloor(x.contract.salary)+300&&d>x.contract.salary;});
  const d=demandSalary(p,2026,perf),offer=Math.max(cutFloor(p.contract.salary),d-300);
  s.finance.cap=domesticPayroll(s.players)-p.contract.salary+offer+100;
  const r=offerSalary(s,p.id,offer);
  assert.equal(r.ok,false);
  assert.match(r.reason,/선수안/);
  assert.equal(s.offseason.salary[p.id],undefined);
});

test('제시액이 숫자가 아니면 거부',()=>{
  const s=off(),p=s.players.find(x=>negotiable(x,2026));
  const r=offerSalary(s,p.id,NaN);
  assert.deepEqual([r.ok,r.reason],[false,'제시액을 숫자로 입력해 주세요.']);
});
