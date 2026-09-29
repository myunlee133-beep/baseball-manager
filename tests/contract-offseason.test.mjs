import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {ensureSeason,hooks,closeSeason,ageLeague,prepareNextSeason} from '../game/league-season.js';

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
