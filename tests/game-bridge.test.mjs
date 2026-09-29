import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams} from '../model.js';
import {createDugoutGame,advanceDugoutGame,toEngineHitter,toEnginePitcher} from '../game-bridge.js';

test('DUGOUT 화면 선수와 라인업을 그대로 경기엔진 팀으로 변환한다',()=>{
 const state=initialState(),game=createDugoutGame(state,5,77);
 assert.deepEqual(game.teams.home.lineup.map(e=>e.player.id),state.order);
 assert.equal(game.teams.home.currentPitcherId,state.strategy.next);
 assert.equal(game.teams.home.name,'KT 위즈');
 assert.equal(game.teams.away.name,teams[5]);
});

test('저장된 20–80 능력치를 그대로 엔진 입력으로 넘긴다',()=>{
 const state=initialState(),hitter=state.players.find(p=>!p.pitcher),pitcher=state.players.find(p=>p.pitcher);
 const h=toEngineHitter(hitter),p=toEnginePitcher(pitcher);
 for(const k of ['contact','eye','power','speed','defense'])assert.equal(h[k],hitter.ratings[k]);
 for(const k of ['velocity','stuff','control','stamina'])assert.equal(p[k],pitcher.ratings[k]);
 assert.equal(h.hidden,undefined); // 히든 스탯은 엔진이 만든다
 assert.equal(toEngineHitter({...hitter,bats:'L'}).bats,'좌');
 assert.equal(toEngineHitter({...hitter,bats:'S'}).bats,'좌');
 assert.equal(toEnginePitcher({...pitcher,throws:'R'}).throws,'우');
 assert.ok(['좌','우'].includes(toEngineHitter({...hitter,bats:null}).bats));
});

test('9개 상대 구단 모두와 경기를 끝까지 치른다',()=>{
 const state=initialState();
 for(let o=1;o<10;o++){
  const game=advanceDugoutGame(createDugoutGame(state,o,o),'game');
  assert.equal(game.status,'final',teams[o]);
  assert.equal(game.teams.away.name,teams[o]);
 }
});

test('투구 단위 엔진으로 DUGOUT 경기를 끝까지 완주한다',()=>{
 let game=createDugoutGame(initialState(),5,1234);
 game=advanceDugoutGame(game,'pitch');
 assert.equal(game.pitchNumber,1);
 game=advanceDugoutGame(game,'game');
 assert.equal(game.status,'final');
 assert.ok(game.pitchNumber>100);
 assert.equal(game.score.home,game.lineScore.home.reduce((a,b)=>a+(Number(b)||0),0));
});

import {createLeagueGame} from '../game-bridge.js';

const withSeason=s=>({...s,season:{rotationTurn:{1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0},autoRestMine:true}});

test('시즌 경기: 내 팀이 원정이어도 편성·선발이 들어가고 경기가 끝난다',()=>{
  const state=withSeason(initialState());
  const {plans,engine}=createLeagueGame(state,{id:'2026-001',home:3,away:0});
  assert.equal(engine.teams.away.name,'KT 위즈');
  assert.equal(plans.away.team,0);
  assert.equal(plans.away.starterId,state.strategy.next);
  assert.deepEqual(Object.keys(plans.away.starters).sort(),[...state.order].sort());
  assert.equal(advanceDugoutGame(engine,'game').status,'final');
});

test('시즌 경기: 체력이 낮으면 엔진 능력치가 깎이고, 같은 경기 id 는 같은 결과',()=>{
  const state=withSeason(initialState()),id=state.order[0];
  state.players.find(p=>p.id===id).energy=30;
  const {engine}=createLeagueGame(state,{id:'2026-002',home:0,away:4});
  const p=state.players.find(x=>x.id===id),e=engine.teams.home.lineup.find(x=>x.player.id===id).player;
  assert.equal(e.contact,Math.max(5,Math.round(p.ratings.contact-12)));
  const a=advanceDugoutGame(createLeagueGame(state,{id:'2026-009',home:1,away:2}).engine,'game');
  const b=advanceDugoutGame(createLeagueGame(state,{id:'2026-009',home:1,away:2}).engine,'game');
  assert.deepEqual(a.score,b.score);
});
