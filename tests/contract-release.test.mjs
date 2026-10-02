import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason} from '../game/league-season.js';
import {RETIRE,retireChance,runRetirements,releasePlayer,askingSalary,signFreeAgent,aiReleaseOverflow,retireUnsigned,ageFreeAgents} from '../game/contract/release.js';
import {fairSalary,domesticPayroll} from '../game/contract/finance.js';

const off=(step='retire')=>{const s=ensureSeason(initialState());s.offseason={step,year:2026,finalOrder:teams.map((_,i)=>i),log:[],freeAgents:[],retired:[]};return s;};
const all=s=>teams.flatMap((_,i)=>teamPlayers(s,i));

test('은퇴 확률: 나이표 × 능력 보정, 외국인 0, 상한 1',()=>{
  assert.equal(retireChance({age:32,ovr:50}),0);
  assert.equal(retireChance({age:35,ovr:50}),.10);
  assert.equal(retireChance({age:35,ovr:62}),.05);
  assert.equal(retireChance({age:35,ovr:38}),.15000000000000002);
  assert.equal(retireChance({age:43,ovr:30}),1);
  assert.equal(retireChance({age:40,ovr:50,foreign:true}),0);
  assert.equal(RETIRE.byAge.at(-1)[0],Infinity);
});

test('자동 은퇴: 리그에서 빠지고 기록되며 같은 해면 결과가 같다, 규모는 연 10~45명',()=>{
  const a=off(),b=off(),before=all(a).length;
  const out=runRetirements(a);
  assert.deepEqual(runRetirements(b).map(r=>r.id),out.map(r=>r.id));
  assert.ok(out.length>=10&&out.length<=45,`${out.length}명`);
  assert.equal(all(a).length,before-out.length);
  assert.deepEqual(a.offseason.retired,out);
  for(const r of out)assert.ok(!all(a).some(p=>p.id===r.id));
  assert.ok(out.every(r=>r.age>=33));
  assert.match(a.offseason.log.at(-1),/은퇴/);
});

test('내 팀 선수가 은퇴하면 라인업·로테이션에서도 빠진다',()=>{
  const s=off(),sp=s.rotation[0],p=s.players.find(x=>x.id===sp);
  p.age=45;p.ovr=30;p.foreign=false;
  runRetirements(s);
  assert.ok(!s.players.some(x=>x.id===sp));
  assert.ok(!s.rotation.includes(sp));
});

test('방출: ②·③·⑥에서만, 내 팀에서 빠져 시장으로(원소속·계약 없음), 캡 사용액 감소',()=>{
  const s=off('fa'),id=s.order.find(x=>!s.players.find(p=>p.id===x).foreign); // 외국인은 캡에 안 잡히므로 국내 주전
  assert.equal(releasePlayer(s,id),false);
  s.offseason.step='retire';
  const before=domesticPayroll(s.players);
  assert.equal(releasePlayer(s,id),true);
  assert.ok(!s.players.some(p=>p.id===id));
  assert.ok(!s.order.includes(id)&&!Object.values(s.field).includes(id));
  const fa=s.offseason.freeAgents.find(p=>p.id===id);
  assert.equal(fa.fromTeam,0);
  assert.equal(fa.contract,null);
  assert.ok(domesticPayroll(s.players)<before);
  assert.equal(releasePlayer(s,'nope'),false);
});

test('시장 영입: ⑥에서만, 요구 연봉 = 적정 연봉, 내 팀 2군·보류 1년, 55명·캡 검사',()=>{
  const s=off('retire'),id=s.players.find(p=>!p.foreign&&p.group==='second').id;
  releasePlayer(s,id);
  assert.equal(signFreeAgent(s,id).ok,false);
  s.offseason.step='roster';
  const fa=s.offseason.freeAgents[0];
  assert.equal(askingSalary(fa),fairSalary(fa));
  assert.deepEqual(signFreeAgent(s,id),{ok:true,reason:''});
  const p=s.players.find(x=>x.id===id);
  assert.equal(p.group,'second');
  assert.equal(p.teamIndex,0);
  assert.deepEqual(p.contract,{salary:askingSalary(p),years:1,kind:'reserve'});
  assert.equal(s.offseason.freeAgents.length,0);
  // 55명이면 영입 불가
  const other=s.league[5].pop();
  s.offseason.freeAgents.push({...other,fromTeam:5,contract:null});
  assert.equal(s.players.length,55);
  assert.deepEqual(signFreeAgent(s,other.id),{ok:false,reason:'로스터 55명이 찼습니다.'});
  // 캡 초과면 불가
  s.players.pop();
  s.finance.cap=domesticPayroll(s.players);
  assert.match(signFreeAgent(s,other.id).reason,/캡 초과/);
});

test('AI 55명 초과분은 OVR 낮은 국내 선수부터 방출, 내 팀은 건드리지 않음',()=>{
  const s=off();
  const extra=structuredClone(s.league[2].slice(-3)).map((p,k)=>({...p,id:`2-x${k}`,ovr:99}));
  s.league[2].push(...extra);
  s.players.push({...structuredClone(s.players.at(-1)),id:'0-x'});
  const lowest=[...s.league[2]].filter(p=>!p.foreign).sort((a,b)=>a.ovr-b.ovr).slice(0,3).map(p=>p.id);
  assert.equal(aiReleaseOverflow(s),3);
  assert.equal(s.league[2].length,55);
  assert.deepEqual(s.offseason.freeAgents.map(p=>p.id).sort(),lowest.sort());
  assert.equal(s.players.length,56);
});

test('미계약자 은퇴와 시장 선수 노화',()=>{
  const s=off();
  releasePlayer(s,s.order[0]);releasePlayer(s,s.order[0]);
  const age=s.offseason.freeAgents[0].age;
  ageFreeAgents(s);
  assert.equal(s.offseason.freeAgents[0].age,age+1);
  assert.equal(retireUnsigned(s),2);
  assert.deepEqual(s.offseason.freeAgents,[]);
  assert.match(s.offseason.log.at(-1),/2명/);
});

test('외국인 방출 선수는 자유계약 시장에서 영입할 수 없다',()=>{
  const s=off('retire'),f=s.players.find(p=>p.foreign);
  assert.ok(f);
  assert.equal(releasePlayer(s,f.id),true);
  s.offseason.step='roster';
  const r=signFreeAgent(s,f.id);
  assert.deepEqual(r,{ok:false,reason:'외국인 선수는 자유계약 시장에서 영입할 수 없습니다.'});
  assert.ok(s.offseason.freeAgents.some(p=>p.id===f.id));
  assert.ok(!s.players.some(p=>p.id===f.id));
});
