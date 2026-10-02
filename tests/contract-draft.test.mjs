import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason,finishDay} from '../game/league-season.js';
import {DRAFT,draftDate,buildDraftPool,draftStrength,maybeOpenDraft,draftPending,onClock,pickProspect,autoPick,joinDraftees} from '../game/contract/draft.js';
import {advance} from '../game/season-runner.js';
import {beginOffseason,nextStep} from '../game/contract/offseason.js';
import {runFaRound} from '../game/contract/fa.js';
import {closeForeign} from '../game/contract/foreign.js';
import {releasePlayer} from '../game/contract/release.js';

const fresh=()=>ensureSeason(initialState());

test('드래프트 날: 9월 둘째 주 월요일',()=>{
  assert.equal(draftDate(2026),'2026-09-14');
  assert.equal(draftDate(2027),'2027-09-13');
  assert.equal(new Date(draftDate(2028)+'T00:00:00Z').getUTCDay(),1);
});

test('풀: 약 100명, 같은 해면 같은 풀, 잠재력 범위 안에 실제 잠재력, 현재 OVR ≤ 잠재력, 고졸 18·대졸 22',()=>{
  for(const year of [2026,2027,2028]){
    const pool=buildDraftPool(year);
    assert.ok(pool.length>=95&&pool.length<=105,`${pool.length}`);
    assert.deepEqual(buildDraftPool(year).map(e=>[e.id,e.player.pot]),pool.map(e=>[e.id,e.player.pot]));
    for(const e of pool){
      const [lo,hi]=e.potRange,p=e.player;
      assert.ok(lo<=p.pot&&p.pot<=hi,`${e.id} ${lo}~${hi} ${p.pot}`);
      assert.ok(p.ovr<=p.pot);
      assert.equal(p.age,DRAFT.age[e.entry]);
      assert.ok(['floor','balance','ceiling'].includes(e.type));
    }
    const hs=pool.filter(e=>e.entry==='hs').length/pool.length;
    assert.ok(hs>.45&&hs<.75);
    const wide=t=>pool.filter(e=>e.type===t).map(e=>e.potRange[1]-e.potRange[0]);
    const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
    assert.ok(avg(wide('ceiling'))>avg(wide('floor')),'실링픽이 플로어픽보다 범위가 넓다');
  }
  assert.ok(new Set([2026,2027,2028,2029,2030,2031,2032,2033].map(draftStrength)).size>=2);
});

test('드래프트 날이 지나면 열리고, 열린 동안은 날짜 진행이 멈춘다',async()=>{
  const s=fresh();
  s.season.date='2026-09-13';
  assert.equal(maybeOpenDraft(s),false);
  s.season.date='2026-09-14';
  assert.equal(maybeOpenDraft(s),true);
  assert.equal(maybeOpenDraft(s),false);
  assert.ok(draftPending(s));
  assert.deepEqual(s.draft.order,[...s.draft.order].sort((a,b)=>s.draft.order.indexOf(a)-s.draft.order.indexOf(b)));
  assert.equal(s.draft.order.length,10);
  const r=await advance(s,'2026-09-20',{pause:async()=>{}});
  assert.equal(r.stopped,'draft');
  assert.equal(s.season.date,'2026-09-14');
});

test('finishDay가 드래프트 날에 드래프트를 연다',()=>{
  const s=fresh();
  s.season.date='2026-09-13';
  finishDay(s);
  assert.ok(draftPending(s));
});

test('지명: 내 차례에서 멈추고, 내 지명은 내 차례에만, 7라운드 70명이면 끝',()=>{
  const s=fresh();s.season.date='2026-09-14';maybeOpenDraft(s);
  const d=s.draft;
  autoPick(s);
  assert.equal(onClock(d),0);
  const mineAt=d.picks.length;
  assert.equal(mineAt,d.order.indexOf(0));
  const best=d.pool.filter(e=>e.pickedBy===undefined)[0];
  assert.deepEqual(pickProspect(s,best.id),{ok:true,reason:''});
  assert.equal(pickProspect(s,best.id).ok,false);
  assert.equal(pickProspect(s,d.pool.find(e=>e.pickedBy===undefined).id).ok,false,'내 차례가 아님');
  autoPick(s,{untilMine:false});
  assert.equal(d.picks.length,DRAFT.rounds*10);
  assert.equal(d.done,true);
  assert.equal(d.picks.filter(p=>p.team===0).length,DRAFT.rounds);
  assert.ok(!draftPending(s));
  for(const t of teams.keys())assert.equal(d.picks.filter(p=>p.team===t).length,7);
});

test('⑥ 진입 시 지명자가 각 팀 2군으로 합류(신인 계약), 내 팀 55명 초과면 방출 전까지 진행 불가',()=>{
  const s=fresh();s.season.date='2026-09-14';maybeOpenDraft(s);autoPick(s,{untilMine:false});
  s.season.phase='ended';
  beginOffseason(s);
  while(s.offseason.step!=='roster'){if(s.offseason.step==='fa')for(let i=0;i<3;i++)runFaRound(s);if(s.offseason.step==='foreign')closeForeign(s);nextStep(s);}
  const mine=s.players.filter(p=>p.id.startsWith('d2026-'));
  assert.equal(mine.length,7);
  for(const p of mine){
    assert.equal(p.group,'second');
    assert.deepEqual(p.contract,{salary:3000,years:1,kind:'rookie'});
    assert.ok(p.faYear===2034||p.faYear===2033);
    assert.ok(p.stats&&p.history);
  }
  assert.equal(joinDraftees(s),0,'두 번 합류하지 않는다');
  while(s.players.length>55)releasePlayer(s,s.players.find(p=>!p.foreign).id);
  assert.equal(nextStep(s),true);
  assert.equal(s.season.year,2027);
  for(const t of teams.keys())assert.ok(teamPlayers(s,t).length<=55);
});

test('드래프트 전에 시즌이 끝나도 오프시즌 시작에서 드래프트를 AI 규칙으로 마무리하고, 다음 해 순서는 직전 순위 역순',()=>{
  const s=fresh();s.season.phase='ended';
  beginOffseason(s);
  assert.equal(s.draft.done,true);
  assert.equal(s.draft.picks.length,70);
  assert.deepEqual(s.prevFinalOrder,s.offseason.finalOrder);
});
