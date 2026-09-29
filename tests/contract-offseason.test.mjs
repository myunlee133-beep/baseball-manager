import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {ensureSeason,hooks,closeSeason,ageLeague,prepareNextSeason} from '../game/league-season.js';
import {STEPS,beginOffseason,nextStep,rosterProblems} from '../game/contract/offseason.js';

const ended=()=>{const s=ensureSeason(initialState());s.season.phase='ended';return s;};

test('시즌 마감은 성적만 보관하고 나이는 그대로',()=>{
  const s=ended(),p=s.players[0],age=p.age;
  p.stats.batting={pa:4,h:1};
  closeSeason(s);
  assert.deepEqual(p.history[2026].batting,{pa:4,h:1});
  assert.deepEqual(p.stats,{batting:{},pitching:{}});
  assert.equal(p.age,age);
  assert.equal(s.season.year,2026);
});

test('노화는 나이 +1, 체력 100, offseasonTick 한 번',()=>{
  const s=ended(),p=s.league[3][0],age=p.age,orig=hooks.offseasonTick;let calls=0;
  p.energy=40;
  hooks.offseasonTick=()=>{calls++;};
  try{ageLeague(s);}finally{hooks.offseasonTick=orig;}
  assert.equal(p.age,age+1);
  assert.equal(p.energy,100);
  assert.equal(calls,1);
});

test('새 시즌 준비는 다음 연도 개막 전으로',()=>{
  const s=ended();
  prepareNextSeason(s);
  assert.equal(s.season.year,2027);
  assert.equal(s.season.phase,'preseason');
});

test('시즌이 끝나지 않았으면 오프시즌을 시작할 수 없다',()=>{
  const s=ensureSeason(initialState());
  assert.equal(beginOffseason(s),false);
  assert.equal(s.offseason,null);
});

test('①~⑥ 진행: 수입 정산, 노화는 ②→③에서 한 번, 끝나면 다음 시즌 개막 전',()=>{
  const s=ended(),p=s.players[0],age=p.age,orig=hooks.offseasonTick;let calls=0;
  hooks.offseasonTick=()=>{calls++;};
  try{
    assert.equal(beginOffseason(s),true);
    assert.equal(beginOffseason(s),false);
    assert.equal(s.offseason.step,'close');
    assert.equal(s.finance.teams[s.offseason.finalOrder[0]].income,200000);
    assert.equal(s.finance.teams[s.offseason.finalOrder[9]].income,20000);
    const seen=[s.offseason.step];
    while(s.offseason&&s.offseason.step!=='roster'){assert.equal(nextStep(s),true);seen.push(s.offseason.step);if(s.offseason.step==='salary')assert.equal(p.age,age+1);}
    assert.deepEqual(seen,STEPS);
    assert.equal(calls,1);
    assert.equal(nextStep(s),true);
    assert.equal(s.offseason,null);
    assert.equal(s.season.year,2027);
    assert.equal(s.season.phase,'preseason');
    assert.equal(p.age,age+1);
  }finally{hooks.offseasonTick=orig;}
});

test('55명을 넘는 구단이 있으면 새 시즌으로 넘어가지 않는다',()=>{
  const s=ended();
  beginOffseason(s);
  while(s.offseason.step!=='roster')nextStep(s);
  s.league[3].push({...structuredClone(s.league[3].at(-1)),id:'3-extra'});
  assert.deepEqual(rosterProblems(s).over,[{team:3,count:56}]);
  assert.equal(nextStep(s),false);
  assert.equal(s.offseason.step,'roster');
  assert.equal(s.season.year,2026);
});

test('내 팀 편성 경고: 빈 수비 위치, 선발 5명 미만',()=>{
  const s=ended();
  s.field.C=null;s.rotation=s.rotation.slice(0,3);
  assert.deepEqual(rosterProblems(s).warnings,['비어 있는 수비 위치: C','선발 로테이션 3명']);
});
