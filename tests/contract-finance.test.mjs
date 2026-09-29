import test from 'node:test';
import assert from 'node:assert/strict';
import {FIN,money,ovrValue,serviceFactor,serviceYears,estimateFaYear,fairSalary,assignContract,domesticPayroll,foreignPayroll,createFinance,teamFinance,canAfford,rankIncome,settleIncome} from '../game/contract/finance.js';

test('금액 표기(만 원 단위)',()=>{
  assert.equal(money(3000),'3,000만');
  assert.equal(money(12000),'1.2억');
  assert.equal(money(1400000),'140억');
});

test('가치와 연차 계수',()=>{
  assert.equal(ovrValue({ovr:45}),0);
  assert.equal(ovrValue({ovr:40}),0);
  assert.equal(ovrValue({ovr:60}),3);
  assert.equal(serviceFactor(1),.2);
  assert.equal(serviceFactor(3),.2);
  assert.equal(serviceFactor(4),.4);
  assert.equal(serviceFactor(6),.4);
  assert.equal(serviceFactor(7),.6);
});

test('연차는 입단 나이와 27세 이상 군 복무 2년으로 추정한다',()=>{
  assert.equal(serviceYears({id:'a',age:25,entry:'hs'}),6);
  assert.equal(serviceYears({id:'a',age:30,entry:'college'}),5);
  assert.equal(serviceYears({id:'a',age:18,entry:'hs'}),0);
});

test('FA 연도 추정: 남은 시즌만큼 뒤, 이미 지났으면 4시즌 주기',()=>{
  assert.equal(estimateFaYear({id:'a',age:25,entry:'hs'},2026),2027);
  assert.equal(estimateFaYear({id:'a',age:19,entry:'hs'},2026),2033);
  assert.equal(estimateFaYear({id:'a',age:30,entry:'college'},2026),2027);
  assert.equal(estimateFaYear({id:'a',age:33,entry:'hs'},2026),2029);
});

test('적정 연봉 = 가치 × 5억 × 연차 계수, 최저 3,000만',()=>{
  assert.equal(fairSalary({id:'a',age:25,entry:'hs',ovr:60}),60000);
  assert.equal(fairSalary({id:'a',age:20,entry:'hs',ovr:40}),FIN.minSalary);
});

test('첫 계약: 조사 데이터가 없으면 보류 1년 적정 연봉, 원문 faYear는 유지, 외국인은 건드리지 않음',()=>{
  const p=assignContract({id:'zz-1',age:25,entry:'hs',ovr:60,faYear:2028},2026);
  assert.deepEqual(p.contract,{salary:60000,years:1,kind:'reserve'});
  assert.equal(p.faYear,2028);
  const g=assignContract({id:'zz-2',age:21,ovr:35,generated:true},2026);
  assert.ok(g.contract.salary>=3000&&g.contract.salary<=4000);
  assert.ok(['hs','college'].includes(g.entry));
  const f={id:'zz-3',foreign:true,faYear:null,contract:{salary:182000,years:1,kind:'foreign',usd:130}};
  assert.deepEqual(assignContract(structuredClone(f),2026),f);
});

test('첫 계약: 조사 데이터가 있으면 그 값(faYear null이면 추정)',()=>{
  const y=assignContract({id:'8-13',name:'양의지',age:39,ovr:66,faYear:2026},2026);
  assert.deepEqual(y.contract,{salary:420000,years:1,kind:'fa'});
  const a=assignContract({id:'0-20',name:'안현민',age:23,ovr:73,faYear:null},2026);
  assert.equal(a.contract.salary,18000);
  assert.ok(Number.isInteger(a.faYear)&&a.faYear>=2026);
});

const fake=()=>({players:[{contract:{salary:1390000}},{foreign:true,contract:{salary:200000}}],league:{},finance:createFinance()});

test('캡은 국내 선수만, 예산은 외국인 포함',()=>{
  const s=fake();
  assert.equal(domesticPayroll(s.players),1390000);
  assert.equal(foreignPayroll(s.players),200000);
  const t=teamFinance(s,0);
  assert.equal(t.cap,1400000);
  assert.equal(t.capRoom,10000);
  assert.equal(t.budget,FIN.support[0]+FIN.firstYearIncome);
  assert.equal(t.budgetRoom,t.budget-1590000);
  assert.equal(t.count,2);
});

test('하드캡·예산을 넘는 계약은 불가, 사유를 돌려준다',()=>{
  const s=fake();
  assert.deepEqual(canAfford(s,0,{salary:20000}),{ok:false,reason:'캡 초과 1억'});
  assert.deepEqual(canAfford(s,0,{salary:20000,replacing:15000}),{ok:true,reason:''});
  assert.deepEqual(canAfford(s,0,{salary:5000}),{ok:true,reason:''});
  s.finance.teams[0].income=0;s.finance.teams[0].support=1600000;
  assert.deepEqual(canAfford(s,0,{salary:20000,foreign:true}),{ok:false,reason:'예산 초과 1억'});
});

test('순위 수입: 1위 20억부터 2억씩, 정산은 순위 순 팀 번호로',()=>{
  assert.equal(rankIncome(1),200000);
  assert.equal(rankIncome(10),20000);
  const s={finance:createFinance()};
  settleIncome(s,[3,0,1,2,4,5,6,7,8,9]);
  assert.equal(s.finance.teams[3].income,200000);
  assert.equal(s.finance.teams[0].income,180000);
  assert.equal(s.finance.teams[9].income,20000);
});
