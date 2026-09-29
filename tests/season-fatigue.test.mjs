// tests/season-fatigue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {FATIGUE,spendEnergy,recoverDay,energyPenalty,restPlan} from '../game/season-fatigue.js';
import {initialState,teamSetup} from '../model.js';

const hitter=(o={})=>({id:'h',pitcher:false,pos:'CF',age:28,energy:100,group:'first',ratings:{contact:50,eye:50,power:50,speed:50,defense:50},...o});
const arm=(o={})=>({id:'p',pitcher:true,pos:'RP',age:28,energy:100,group:'first',ratings:{velocity:50,stuff:50,control:50,stamina:40},...o});

test('야수 소모: 선발 −10, 포수 −15, 지명 −5, 연장 이닝당 −1, 교체 −4',()=>{
  const cases=[['CF',9,90],['C',9,85],['DH',9,95],['CF',11,88]];
  for(const [pos,innings,want] of cases){const p=hitter();spendEnergy(p,{bat:{pa:4},startPos:pos,innings,date:'2026-04-01'});assert.equal(p.energy,want,pos+innings);}
  const sub=hitter();spendEnergy(sub,{bat:{pa:1},innings:9,date:'2026-04-01'});assert.equal(sub.energy,96);
  assert.equal(sub.lastPlayed,'2026-04-01');
});

test('투수 소모: 선발 100구 −60, 불펜 투구 수 + 연투 가산',()=>{
  const sp=arm({pos:'SP'});spendEnergy(sp,{pit:{starts:1,pitches:100},date:'2026-04-01'});assert.equal(sp.energy,40);
  const rp=arm();
  spendEnergy(rp,{pit:{pitches:15},date:'2026-04-01'});assert.equal(rp.energy,85);
  spendEnergy(rp,{pit:{pitches:15},date:'2026-04-02'});assert.equal(rp.energy,60); // 15 + 연투 10
  spendEnergy(rp,{pit:{pitches:15},date:'2026-04-03'});assert.equal(rp.energy,25); // 15 + 3연투 20
  assert.equal(rp.streak,3);
  spendEnergy(rp,{pit:{pitches:10},date:'2026-04-05'});assert.equal(rp.energy,15);assert.equal(rp.streak,1);
});

test('회복: 야수 +6(쉬면 +9), 투수 +10, 나이 보정, 상한 100',()=>{
  const played=hitter({energy:50,lastPlayed:'2026-04-01'}),rested=hitter({energy:50,lastPlayed:'2026-03-31'});
  const old=hitter({energy:50,age:35,lastPlayed:'2026-04-01'}),young=arm({energy:50,age:23,lastPlayed:'2026-03-30'});
  const full=hitter({energy:98});
  recoverDay([played,rested,old,young,full],'2026-04-01');
  assert.deepEqual([played.energy,rested.energy,old.energy,young.energy,full.energy],[56,59,55,61,100]);
});

test('체력 70 미만부터 (70 − 체력) × 0.3 만큼 능력치 감소, 선구·체력은 그대로',()=>{
  assert.deepEqual(energyPenalty({contact:50,eye:50,power:50,speed:50,defense:50},80),{contact:50,eye:50,power:50,speed:50,defense:50});
  assert.deepEqual(energyPenalty({contact:50,eye:50,power:50,speed:50,defense:50},30),{contact:38,eye:50,power:38,speed:38,defense:38});
  assert.deepEqual(energyPenalty({velocity:60,stuff:60,control:60,stamina:60},50),{velocity:54,stuff:54,control:54,stamina:60});
});

test('자동 휴식: 지친 주전을 자격 있는 벤치 선수로, 포수는 55 기준',()=>{
  const s=initialState(),players=structuredClone(s.players),base=teamSetup(players);
  const byId=new Map(players.map(p=>[p.id,p]));
  const cf=base.field.CF,c=base.field.C;
  byId.get(cf).energy=44;byId.get(c).energy=54;
  const plan=restPlan(base,players,{auto:true,turn:0});
  assert.ok(!plan.order.includes(cf),'지친 중견수 휴식');
  assert.equal(plan.order.length,9);
  if(players.some(p=>!p.pitcher&&p.group==='first'&&p.pos==='C'&&p.id!==c))assert.ok(!plan.order.includes(c),'포수 휴식');
  assert.equal(new Set(Object.values(plan.field)).size,9);
  const off=restPlan(base,players,{auto:false,turn:0});
  assert.deepEqual(off.order,base.order);
});

test('선발: 체력 70 미만이면 다음 선발, 모두 지치면 불펜 데이, 지친 불펜 제외',()=>{
  const s=initialState(),players=structuredClone(s.players),base=teamSetup(players),byId=new Map(players.map(p=>[p.id,p]));
  byId.get(base.rotation[0]).energy=60;
  let plan=restPlan(base,players,{auto:true,turn:0});
  assert.equal(plan.starterId,base.rotation[1]);
  assert.equal(plan.nextTurn,2%base.rotation.length);
  for(const id of base.rotation)byId.get(id).energy=50;
  byId.get(base.bullpen[0]).energy=20;
  plan=restPlan(base,players,{auto:true,turn:0});
  assert.ok(base.bullpen.includes(plan.starterId),'불펜 데이');
  assert.ok(plan.unavailable.has(base.bullpen[0]));
  for(const id of base.bullpen)byId.get(id).energy=10;
  plan=restPlan(base,players,{auto:true,turn:0});
  assert.equal(plan.unavailable.size,0,'전원 지치면 제한 해제');
});
