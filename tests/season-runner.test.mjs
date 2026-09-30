// tests/season-runner.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {ensureSeason,standings} from '../game/league-season.js';
import {advance,targetDate} from '../game/season-runner.js';
import {hooks} from '../game/league-season.js';
import {pushMessage,pendingPopup} from '../game/inbox.js';

const fast={pause:()=>Promise.resolve()};

test('진행 목표일',()=>{
  const s=ensureSeason(initialState());
  assert.equal(targetDate(s,'day'),'2026-03-28');
  assert.equal(targetDate(s,'week'),'2026-04-03');
  assert.equal(targetDate(s,'month'),'2026-03-31');
  assert.equal(targetDate(s,'season'),'2026-09-16');
});

test('1주 진행: 하루마다 저장, 진행률 보고, 3/31→4/1 월 경계 통과',async()=>{
  const s=ensureSeason(initialState());let saves=0,last;
  const r=await advance(s,targetDate(s,'week'),{...fast,save:st=>{saves++;for(const m of pendingPopup(st))m.shown=true;},onProgress:p=>last=p});
  assert.equal(s.season.date,'2026-04-04');
  assert.equal(saves,7);
  assert.equal(r.done,r.total);
  assert.equal(last.done,r.done);
  assert.equal(standings(s).reduce((a,x)=>a+x.g,0),r.done*2);
});

test('중단은 그날을 마친 뒤 멈춘다',async()=>{
  const s=ensureSeason(initialState());
  const r=await advance(s,targetDate(s,'season'),{...fast,shouldStop:()=>true});
  assert.equal(r.stopped,true);
  assert.equal(s.season.date,'2026-03-29');
  assert.ok(s.season.schedule.filter(g=>g.date==='2026-03-28').every(g=>g.status==='final'));
});

test('내 라인업이 무효면 그날 시작 전에 멈춘다',async()=>{
  const s=ensureSeason(initialState());s.order=[];
  const r=await advance(s,targetDate(s,'week'),fast);
  assert.ok(r.blocked);
  assert.equal(r.done,0);
});

test('중요 메시지가 오면 그날을 마치고 멈춘다',async()=>{
  const s=ensureSeason(initialState());s.season.date='2026-03-31';
  const orig=hooks.monthlyTick;hooks.monthlyTick=st=>pushMessage(st,{from:'테스트',subject:'중요',importance:'high'});
  try{
    const r=await advance(s,targetDate(s,'week'),fast);
    assert.equal(r.stopped,'message');
    assert.equal(s.season.date,'2026-04-01');
    assert.ok(s.season.schedule.filter(g=>g.date==='2026-03-31').every(g=>g.status==='final'));
  }finally{hooks.monthlyTick=orig;}
});
