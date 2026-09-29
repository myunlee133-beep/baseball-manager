import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {createDugoutGame,advanceDugoutGame,toEngineHitter,toEnginePitcher} from '../game-bridge.js';

test('DUGOUT 화면 선수와 라인업을 그대로 경기엔진 팀으로 변환한다',()=>{
 const state=initialState(),game=createDugoutGame(state,5,77);
 assert.deepEqual(game.teams.home.lineup.map(e=>e.player.id),state.order);
 assert.equal(game.teams.home.currentPitcherId,state.strategy.next);
 assert.equal(game.teams.home.name,'서울 나이츠');
});

test('화면 성적이 해당 인게임 능력치에 반영된다',()=>{
 const state=initialState(),hitter=state.players.find(p=>!p.pitcher),pitcher=state.players.find(p=>p.pitcher);
 const morePower=toEngineHitter({...hitter,hr:hitter.hr+20});
 const moreEye=toEngineHitter({...hitter,bb:hitter.bb+20});
 assert.ok(morePower.power>toEngineHitter(hitter).power);
 assert.ok(moreEye.eye>toEngineHitter(hitter).eye);
 assert.ok(toEnginePitcher({...pitcher,k9:pitcher.k9+3}).stuff>toEnginePitcher(pitcher).stuff);
 assert.ok(toEnginePitcher({...pitcher,bb9:Math.max(0,pitcher.bb9-2)}).control>toEnginePitcher(pitcher).control);
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
