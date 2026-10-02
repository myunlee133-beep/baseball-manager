// tests/league-season.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {hooks,ensureSeason,todayGames,myGame,playLeagueGame,finishDay,standings,seasonLine,allPlayers,loadBox,flushBoxes,startNextSeason,lineupProblem} from '../game/league-season.js';
import {beginOffseason,nextStep} from '../game/contract/offseason.js';

const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const fresh=()=>ensureSeason(initialState());
const playDay=s=>{for(const g of todayGames(s))if(g.status==='scheduled')playLeagueGame(s,g);finishDay(s);};

test('새 시즌: 개막 전, 전원 체력 100과 빈 성적',()=>{
  const s=fresh();
  assert.equal(s.season.phase,'preseason');
  assert.equal(s.season.date,'2026-03-28');
  assert.equal(s.season.schedule.length,720);
  assert.ok(allPlayers(s).every(p=>p.energy===100&&p.stats&&p.history&&p.lastPlayed===null));
  assert.ok(allPlayers(s).every(p=>p.dev&&p.dev.mark.pa===0));
  assert.deepEqual(s.inbox,[]);
  assert.equal(allPlayers(s).length,550);
  assert.equal(lineupProblem(s),null);
});

test('하루 진행: 5경기 final, 순위·성적·박스스코어가 서로 맞는다',()=>{
  const s=fresh();
  playDay(s);
  const day=s.season.schedule.filter(g=>g.date==='2026-03-28');
  assert.ok(day.every(g=>g.status==='final'&&g.score&&g.innings>=9));
  assert.equal(s.season.phase,'regular');
  assert.equal(s.season.date,'2026-03-29');
  const table=standings(s),w=table.reduce((a,r)=>a+r.w,0),l=table.reduce((a,r)=>a+r.l,0),t=table.reduce((a,r)=>a+r.t,0);
  assert.equal(w,l);assert.equal(t%2,0);assert.equal(w+t/2,5);
  const hits=allPlayers(s).reduce((a,p)=>a+(p.stats.batting.h||0),0);
  const boxHits=day.reduce((a,g)=>{const b=loadBox(2026,g.id);return a+b.hits.home+b.hits.away;},0);
  assert.equal(hits,boxHits);
  assert.ok(allPlayers(s).some(p=>p.energy<100),'체력 소모');
  assert.ok(s.season.news.length===5);
});

test('로테이션: 내 팀 다음 선발이 전진하고 AI 팀 순번이 바뀐다',()=>{
  const s=fresh(),before=s.strategy.next;
  playDay(s);
  if(myGame({...s,season:{...s.season,date:'2026-03-28'}}))assert.notEqual(s.strategy.next,before);
  assert.ok(Object.values(s.season.rotationTurn).some(v=>v>0));
});

test('틱: 3/31→4/1 에 monthlyTick 1회',()=>{
  const s=fresh();let n=0;const orig=hooks.monthlyTick;hooks.monthlyTick=()=>n++;
  try{
    s.season.date='2026-03-31';
    finishDay(s);
    assert.equal(s.season.date,'2026-04-01');assert.equal(n,1);
    finishDay(s);assert.equal(n,1);
  }finally{hooks.monthlyTick=orig;}
});

test('시즌 종료 → 다음 시즌: 기록 보관, 나이 +1, offseasonTick, 새 일정, 박스스코어 삭제',()=>{
  const s=fresh();playDay(s);flushBoxes(2026);
  const p=s.players.find(x=>x.stats.batting.pa),age=p.age,pa=p.stats.batting.pa;
  let n=0;const orig=hooks.offseasonTick;hooks.offseasonTick=()=>n++;
  try{startNextSeason(s);}finally{hooks.offseasonTick=orig;}
  assert.equal(n,1);
  assert.equal(p.history[2026].batting.pa,pa);
  assert.equal(p.age,age+1);
  assert.deepEqual(p.stats,{batting:{},pitching:{}});
  assert.equal(p.energy,100);
  assert.equal(s.season.year,2027);
  assert.equal(s.season.date,'2027-03-27');
  assert.equal(store.has('dugout-boxes-2026'),false);
});

test('다음 시즌으로: 실제 성장 훅이 돌아 history 에 OVR·POT, 오프시즌 리포트',()=>{
  const s=fresh();
  const before=new Map(allPlayers(s).map(p=>[p.id,{ovr:p.ovr,pot:p.pot}]));
  startNextSeason(s);
  for(const p of allPlayers(s))assert.deepEqual({ovr:p.history[2026].ovr,pot:p.history[2026].pot},before.get(p.id));
  assert.ok(s.inbox.some(m=>m.subject==='2026 오프시즌 스카우트 리포트'));
});

test('오프시즌 단계: ② 은퇴·방출을 떠날 때(노화) 성장이 돌고 리포트가 온다',()=>{
  const s=fresh();s.season.phase='ended';
  assert.ok(beginOffseason(s));
  assert.equal(s.inbox.length,0);
  nextStep(s); // ① → ②
  assert.equal(s.inbox.length,0);
  nextStep(s); // ② → ③: ageLeague → offseasonTick
  assert.equal(s.offseason.step,'salary');
  assert.ok(s.inbox.some(m=>m.subject==='2026 오프시즌 스카우트 리포트'&&m.importance==='high'));
  assert.ok(allPlayers(s).every(p=>p.history[2026].ovr!=null));
});

test('seasonLine: 엔진 기록 줄을 기록실 필드로 바꾼다',()=>{
  const b=seasonLine({batting:{pa:10,ab:8,h:3,doubles:1,hr:1,bb:2,so:2,rbi:3,games:2}},false);
  assert.equal(b.avg,3/8);assert.equal(b.slg,(3+1+3)/8);assert.equal(b.k,2);assert.equal(b.g,2);assert.equal(b.war,null);
  const p=seasonLine({pitching:{outs:27,earnedRuns:3,strikeouts:9,walks:3,hitsAllowed:6,starts:1,games:1,wins:1}},true);
  assert.equal(p.era,3);assert.equal(p.ip,9);assert.equal(p.k,9);assert.equal(p.bb,3);assert.equal(p.whip,1);assert.equal(p.w,1);
});

test('라인업이 9명이 아니면 문제를 알려준다',()=>{
  const s=fresh();s.order=s.order.slice(0,8);
  assert.match(lineupProblem(s),/타자/);
});

import {loadState,STATE_KEY,PREV_KEYS} from '../model.js';

test('v2·v3·v4 저장은 편성 그대로 v5로 옮기고 성장 기본값을 채운 뒤 이전 키를 지운다',()=>{
  assert.equal(STATE_KEY,'dugout-prototype-v5');
  assert.deepEqual(PREV_KEYS,['dugout-prototype-v4','dugout-prototype-v3','dugout-prototype-v2']);
  for(const key of PREV_KEYS){
    const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
    const old=initialState();
    if(key==='dugout-prototype-v4')old.version=4; // v4: 계약 필드는 있고 dev·inbox 가 없다(initialState 에는 원래 없음)
    else{
      for(const i of Object.keys(old.league))old.league[i]=old.league[i].filter(p=>!p.generated&&!p.foreign);
      old.players=old.players.filter(p=>!p.generated&&!p.foreign);
      for(const p of [...old.players,...Object.values(old.league).flat()])delete p.contract;
      delete old.finance;delete old.offseason;delete old.version;
    }
    old.order=[...old.order].reverse();
    mem.set(key,JSON.stringify(old));
    const {state}=loadState(storage);
    ensureSeason(state);
    assert.equal(state.version,5,key);
    assert.deepEqual(state.order,old.order,key);
    assert.equal(state.players.length,55,key);
    assert.ok(Object.values(state.league).every(t=>t.length===55),key);
    assert.ok(state.finance,key);
    assert.equal(state.season.date,'2026-03-28',key);
    assert.ok(state.players.every(p=>p.energy===100&&p.stats),key);
    assert.deepEqual(state.inbox,[],key);
    assert.ok(allPlayers(state).every(p=>p.dev&&p.dev.fit.n===0&&p.dev.pending===0&&p.dev.eventYear===null),key);
    assert.equal(mem.has(key),false,key);
  }
});
