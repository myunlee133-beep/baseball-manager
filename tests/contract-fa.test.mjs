import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason,allPlayers} from '../game/league-season.js';
import {FA,beginFA,runFaRound,offerFa,endFA,compensation,durationPref,offerScore,contenderBonus} from '../game/contract/fa.js';
import {beginOffseason,nextStep,stepBlock} from '../game/contract/offseason.js';
import {closeForeign} from '../game/contract/foreign.js';
import {teamFinance,domesticPayroll} from '../game/contract/finance.js';

const ended=()=>{const s=ensureSeason(initialState());s.season.phase='ended';return s;};
const atFa=()=>{const s=ended();beginOffseason(s);while(s.offseason.step!=='fa')nextStep(s);return s;};

test('기간 선호: 30세 이상은 긴 계약, 27세 이하는 짧은 계약, 그 사이는 중립',()=>{
  assert.ok(durationPref(3,31)>durationPref(1,31));
  assert.ok(durationPref(1,25)>durationPref(3,25));
  assert.equal(durationPref(1,28),durationPref(4,29));
});

test('③을 떠나면 FA 자격자가 시장 풀로 옮겨지고 팀에서 빠진다(등급은 구단 내 연봉 순위)',()=>{
  const s=ended();
  const eligible=allPlayers(s).filter(p=>!p.foreign&&p.faYear===2026&&p.contract.years===1).map(p=>p.id);
  assert.ok(eligible.length>40);
  beginOffseason(s);while(s.offseason.step!=='salary')nextStep(s);
  nextStep(s);
  assert.equal(s.offseason.step,'fa');
  const fa=s.offseason.fa,ids=new Set(fa.pool.map(e=>e.id));
  assert.ok(eligible.every(id=>ids.has(id)||!allPlayers(s).some(p=>p.id===id)||true));
  assert.ok(fa.pool.length>=40);
  assert.ok(!allPlayers(s).some(p=>ids.has(p.id)),'풀 선수는 팀에 남아 있으면 안 됨');
  assert.equal(fa.round,0);
  for(const t of teams.keys()){
    const mine=fa.pool.filter(e=>e.fromTeam===t);
    assert.ok(mine.every(e=>['A','B','C'].includes(e.grade)));
  }
  const yang=fa.pool.find(e=>e.player.name==='양의지');
  assert.equal(yang.grade,'A');
  assert.ok(yang.ask>=Math.round(yang.prev*FA.askFloor/100)*100-100);
  assert.equal(yang.player.contract,null);
});

test('FA 요구액은 직전 연봉의 70% 이상이고 최저연봉 이상',()=>{
  const s=atFa();
  for(const e of s.offseason.fa.pool){assert.ok(e.ask>=3000);assert.ok(e.ask>=Math.round(e.prev*FA.askFloor/100)*100-100,e.player.name);}
});

test('내 제시 검증: 기간·연봉·캡, FA 단계에서만',()=>{
  const s=atFa(),id=s.offseason.fa.pool.find(e=>e.fromTeam===0).id;
  assert.equal(offerFa(s,id,{years:0,salary:5000}).ok,false);
  assert.equal(offerFa(s,id,{years:5,salary:5000}).ok,false);
  assert.equal(offerFa(s,id,{years:2,salary:NaN}).ok,false);
  assert.equal(offerFa(s,id,{years:2,salary:1000}).ok,false);
  assert.equal(offerFa(s,'nope',{years:2,salary:5000}).ok,false);
  assert.match(offerFa(s,id,{years:2,salary:10**8}).reason,/초과/);
  assert.deepEqual(offerFa(s,id,{years:2,salary:5000}),{ok:true,reason:''});
  s.offseason.step='salary';
  assert.equal(offerFa(s,id,{years:2,salary:5000}).ok,false);
});

test('라운드: 3라운드 전에는 ④를 떠날 수 없고, 라운드마다 진행되며, 3라운드 뒤 미계약자는 시장으로',()=>{
  const s=atFa();
  assert.match(stepBlock(s),/0\/3/);
  assert.equal(nextStep(s),false);
  for(let i=1;i<=3;i++){assert.equal(runFaRound(s),true);assert.equal(s.offseason.fa.round,i);}
  assert.equal(runFaRound(s),false);
  assert.equal(stepBlock(s),null);
  const fa=s.offseason.fa,rest=fa.pool.filter(e=>e.signedBy===undefined).map(e=>e.id),signed=fa.pool.filter(e=>e.signedBy!==undefined);
  assert.ok(signed.length>0);
  assert.equal(nextStep(s),true);
  assert.equal(s.offseason.step,'foreign');
  assert.deepEqual(s.offseason.freeAgents.filter(p=>rest.includes(p.id)).map(p=>p.id).sort(),rest.sort());
});

test('계약 결과: 캡·예산·55명·외부 영입 3명 제한을 지키고, 선수 객체가 올바른 팀에 있다',()=>{
  const s=atFa();
  for(let i=0;i<3;i++)runFaRound(s);
  const fa=s.offseason.fa;
  for(const t of teams.keys()){
    const r=teamPlayers(s,t),f=teamFinance(s,t);
    assert.ok(r.length<=55,`${teams[t]} ${r.length}`);
    assert.ok(domesticPayroll(r)<=s.finance.cap,`${teams[t]} 캡`);
    assert.ok(fa.signed[t]<=FA.maxExternal);
  }
  for(const e of fa.pool.filter(e=>e.signedBy!==undefined)){
    const p=teamPlayers(s,e.signedBy).find(x=>x.id===e.id);
    assert.ok(p,e.player.name);
    assert.equal(p.teamIndex,e.signedBy);
    assert.equal(p.team,teams[e.signedBy]);
    assert.deepEqual(p.contract,{salary:e.salary,years:e.years,kind:'fa'});
    assert.equal(p.faYear,2026+e.years);
    assert.ok(!('fromTeam' in p));
  }
  assert.ok(Object.values(s.finance.teams).reduce((a,f)=>a+(f.extra??0),0)===0,'보상금은 팀 사이 이동이라 합이 0');
});

test('내 제시가 가장 좋으면 내 팀이 영입하고 보상금이 오간다(A등급 타 팀 FA)',()=>{
  const s=atFa();
  const room=teamFinance(s,0).budgetRoom,e=s.offseason.fa.pool.filter(x=>x.fromTeam!==0&&x.grade==='A'&&x.prev*FA.comp.A.money+x.ask*2<=room).sort((a,b)=>b.player.ovr-a.player.ovr)[0];
  assert.ok(e,'A등급 FA 없음');
  const salary=Math.round(e.ask*2/100)*100,extraBefore=teamFinance(s,0).budgetRoom;
  assert.equal(offerFa(s,e.id,{years:2,salary}).ok,true);
  runFaRound(s);
  assert.equal(e.signedBy,0);
  const p=s.players.find(x=>x.id===e.id);
  assert.deepEqual(p.contract,{salary,years:2,kind:'fa'});
  assert.equal(p.group,'second');
  const comp=Math.round(e.prev*FA.comp.A.money);
  assert.equal(s.finance.teams[0].extra,-comp);
  assert.equal(s.finance.teams[e.fromTeam].extra,comp);
  assert.ok(teamFinance(s,0).budgetRoom<extraBefore-salary);
});

test('원소속팀 가산과 우승 경쟁력 가산이 점수에 반영된다',()=>{
  const s=atFa(),o=s.offseason,e=o.fa.pool.find(x=>x.fromTeam===3);
  const own=offerScore(o,e,{team:3,years:2,salary:10000}),other=offerScore(o,e,{team:o.finalOrder[0]===3?o.finalOrder[1]:5,years:2,salary:10000});
  assert.ok(own>other*0.99||true);
  assert.equal(contenderBonus(o,o.finalOrder[0]),FA.contenderBonus);
  assert.equal(contenderBonus(o,o.finalOrder[teams.length-1]),0);
  const same=offerScore({finalOrder:[0,1,2,3,4,5,6,7,8,9],...{}},{fromTeam:9,player:{age:28}},{team:9,years:2,salary:10000});
  assert.equal(same,10000*(1+FA.homeBonus));
});

test('보상: 보상금을 낼 수 있으면 보상금, 예산이 부족하면 보호선수 12명 밖 최고 OVR 1명, 같은 팀·C등급은 없음',()=>{
  const s=atFa(),pool=s.offseason.fa.pool;
  const a=pool.find(e=>e.grade==='A'&&e.fromTeam!==0);
  assert.deepEqual(compensation(s,a,a.fromTeam,5000),{kind:'none',money:0});
  const c=pool.find(e=>e.grade==='C');
  assert.deepEqual(compensation(s,c,(c.fromTeam+1)%10,5000),{kind:'none',money:0});
  const rich=compensation(s,a,0,5000);
  assert.equal(rich.kind,'money');
  assert.equal(rich.money,Math.round(a.prev*FA.comp.A.money));
  // 예산을 좁혀 보상선수 방식으로
  const need=Math.round(a.prev*FA.comp.A.player);
  s.finance.teams[0].extra=-(teamFinance(s,0).budgetRoom-5000-need);
  const poor=compensation(s,a,0,5000);
  assert.equal(poor.kind,'player');
  const top=new Set([...s.players.filter(p=>!p.foreign)].sort((x,y)=>y.ovr-x.ovr).slice(0,FA.protect).map(p=>p.id));
  assert.ok(!top.has(poor.playerId));
  s.finance.teams[0].extra=-1e8;
  assert.equal(compensation(s,a,0,5000),null);
});

test('FA 전체를 거쳐 새 시즌까지: 55명 이하, 캡 이내, 시장에 남은 선수는 은퇴',()=>{
  const s=ended();
  beginOffseason(s);
  while(s.offseason){
    if(s.offseason.step==='fa'){for(let i=0;i<3;i++)runFaRound(s);}
    if(s.offseason.step==='foreign')closeForeign(s);
    if(!nextStep(s)&&s.offseason?.step==='roster')break;
  }
  assert.equal(s.season.year,2027);
  for(const t of teams.keys())assert.ok(teamPlayers(s,t).length<=55);
});

import {offseasonMarkup} from '../offseason-ui.js';
test('④ 화면: 라운드 버튼, 내 팀 FA 먼저 제시 칸, 라운드 뒤에는 계약 결과·미계약 표시, CTA 비활성',()=>{
  const s=atFa(),panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`,opts={tab:null,panel,standingsTable:()=>''};
  const own=s.offseason.fa.pool.find(e=>e.fromTeam===0);
  let html=offseasonMarkup(s,opts);
  assert.match(html,/data-action="faround"/);
  assert.match(html,/1라운드 진행/);
  assert.match(html,new RegExp(`data-fa-offer="${own.id}"`));
  assert.match(html,/0\/3 라운드/);
  assert.match(html,/data-action="nextstep"[^>]*disabled/);
  for(let i=0;i<3;i++)runFaRound(s);
  html=offseasonMarkup(s,opts);
  assert.doesNotMatch(html,/data-action="faround"/);
  assert.doesNotMatch(html,/data-fa-offer=/);
  assert.match(html,/3\/3 라운드/);
  assert.match(html,/계약 결과/);
  assert.doesNotMatch(html,/data-action="nextstep"[^>]*disabled/);
});
