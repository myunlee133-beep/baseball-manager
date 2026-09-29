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
