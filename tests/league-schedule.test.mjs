// tests/league-schedule.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSchedule,openingDay,addDays,weekday} from '../game/league-schedule.js';

test('날짜 유틸',()=>{
  assert.equal(addDays('2026-03-28',4),'2026-04-01');
  assert.equal(addDays('2026-04-01',-1),'2026-03-31');
  assert.equal(weekday('2026-03-28'),6);
  assert.equal(openingDay(2026),'2026-03-28');
  assert.equal(openingDay(2027),'2027-03-27');
});

test('2026 일정: 720경기, 팀당 144경기, 상대별 16경기(홈 8)',()=>{
  const s=buildSchedule(2026);
  assert.equal(s.length,720);
  assert.equal(new Set(s.map(g=>g.id)).size,720);
  for(let t=0;t<10;t++){
    assert.equal(s.filter(g=>g.home===t||g.away===t).length,144,`팀 ${t}`);
    for(let o=0;o<10;o++)if(o!==t){
      assert.equal(s.filter(g=>g.home===t&&g.away===o).length,8,`${t} 홈 vs ${o}`);
    }
  }
});

test('하루 5경기, 모든 팀 하루 1경기, 월요일·올스타 휴식',()=>{
  const s=buildSchedule(2026),dates=[...new Set(s.map(g=>g.date))];
  assert.equal(dates[0],'2026-03-28');
  assert.equal(dates.at(-1),'2026-09-16');
  assert.equal(dates.length,144);
  for(const d of dates){
    const day=s.filter(g=>g.date===d);
    assert.equal(day.length,5,d);
    assert.equal(new Set(day.flatMap(g=>[g.home,g.away])).size,10,d);
    assert.notEqual(weekday(d),1,`${d} 월요일`);
  }
  for(const d of ['2026-07-09','2026-07-10','2026-07-11','2026-07-12'])assert.ok(!dates.includes(d),d);
  assert.deepEqual(s.map(g=>g.date),[...s.map(g=>g.date)].sort());
});

test('같은 연도는 같은 일정, 다른 연도는 다른 대진',()=>{
  assert.deepEqual(buildSchedule(2026),buildSchedule(2026));
  const a=buildSchedule(2026).slice(0,5).map(g=>[g.home,g.away]),b=buildSchedule(2027).slice(0,5).map(g=>[g.home,g.away]);
  assert.notDeepEqual(a,b);
  assert.equal(buildSchedule(2027)[0].date,'2027-03-27');
});
