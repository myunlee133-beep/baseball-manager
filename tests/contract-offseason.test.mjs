import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {ensureSeason,hooks,closeSeason,ageLeague,prepareNextSeason} from '../game/league-season.js';
import {STEPS,beginOffseason,nextStep,rosterProblems} from '../game/contract/offseason.js';
import {offseasonMarkup} from '../offseason-ui.js';
import {releasePlayer} from '../game/contract/release.js';
import {runFaRound} from '../game/contract/fa.js';
import {closeForeign} from '../game/contract/foreign.js';
import {negotiable,projectedPayroll} from '../game/contract/salary.js';
import {stepBlock} from '../game/contract/offseason.js';

// ④ FA는 3라운드, ⑤ 외국인은 시장 마감을 해야 넘어갈 수 있다
const advance=(s,stop)=>{while(s.offseason&&s.offseason.step!==stop){if(s.offseason.step==='fa')for(let i=0;i<3;i++)runFaRound(s);if(s.offseason.step==='foreign')closeForeign(s);if(!nextStep(s))break;}};
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
    while(s.offseason&&s.offseason.step!=='roster'){if(s.offseason.step==='fa')for(let i=0;i<3;i++)runFaRound(s);if(s.offseason.step==='foreign')closeForeign(s);assert.equal(nextStep(s),true);seen.push(s.offseason.step);if(s.offseason.step==='salary')assert.equal(p.age,age+1);}
    assert.deepEqual(seen,STEPS);
    assert.equal(calls,1);
    assert.equal(nextStep(s),true);
    assert.equal(s.offseason,null);
    assert.equal(s.season.year,2027);
    assert.equal(s.season.phase,'preseason');
    assert.equal(p.age,age+1);
  }finally{hooks.offseasonTick=orig;}
});

test('내 팀이 55명을 넘으면 새 시즌으로 넘어가지 않는다',()=>{
  const s=ended();
  beginOffseason(s);
  advance(s,'roster');
  for(let i=0;s.players.length<=55;i++)s.players.push({...structuredClone(s.players.at(-1)),id:`0-extra-${i}`}); // FA로 빠진 인원이 많아 55명을 넘도록 채운다
  const n=s.players.length;
  assert.deepEqual(rosterProblems(s).over,[{team:0,count:n}]);
  assert.equal(nextStep(s),false);
  assert.equal(s.offseason.step,'roster');
  assert.equal(s.season.year,2026);
});

test('AI 구단이 55명을 넘으면 ⑥을 떠날 때 자동 방출되고, 시장에 남은 선수는 은퇴한다',()=>{
  const s=ended();
  beginOffseason(s);
  advance(s,'roster');
  for(let i=0;i<6;i++)s.league[3].push({...structuredClone(s.league[3].at(-1)),id:`3-extra-${i}`,ovr:99});
  const log=s.offseason.log;
  assert.equal(nextStep(s),true);
  assert.ok(log.some(l=>/미계약 자유계약 선수 \d+명 은퇴/.test(l)));
  assert.equal(s.league[3].length,55);
  assert.equal(s.offseason,null);
  assert.equal(s.season.year,2027);
});

test('②에 들어올 때 은퇴가 판정되고, 떠날 때 시장 선수도 나이를 먹는다',()=>{
  const s=ended();
  beginOffseason(s);
  assert.deepEqual(s.offseason.freeAgents,[]);
  nextStep(s);
  assert.equal(s.offseason.step,'retire');
  assert.ok(s.offseason.retired.length>0);
  s.offseason.freeAgents.push({...structuredClone(s.players.at(-1)),id:'fa-1',fromTeam:0,contract:null});
  const age=s.offseason.freeAgents[0].age;
  nextStep(s);
  assert.equal(s.offseason.freeAgents[0].age,age+1);
});

test('내 팀 편성 경고: 빈 수비 위치, 선발 5명 미만',()=>{
  const s=ended();
  s.field.C=null;s.rotation=s.rotation.slice(0,3);
  assert.deepEqual(rosterProblems(s).warnings,['비어 있는 수비 위치: C','선발 로테이션 3명']);
});

test('오프시즌 화면: 현재 단계 CTA, 앞 단계 잠금, 끝난 단계 ✓, 재정 요약',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);
  const panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`;
  const html=offseasonMarkup(s,{tab:null,panel,standingsTable:()=>'<table></table>'});
  assert.match(html,/data-action="nextstep"/);
  assert.match(html,/다음 단계/);
  assert.match(html,/1\. 시즌 마감 ✓/);
  assert.match(html,/data-offtab="fa"[^>]*disabled/);
  assert.match(html,/2026 오프시즌 · 2\. 은퇴·방출/);
  assert.match(html,/샐러리캡/);
  assert.doesNotMatch(html,/generated/);
  advance(s,'roster');
  assert.match(offseasonMarkup(s,{tab:null,panel,standingsTable:()=>''}),/새 시즌 시작/);
});

test('② 화면: 은퇴 목록과 내 팀 방출 버튼, ⑥ 화면: 자유계약 시장 영입 버튼',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);
  const panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`,opts={tab:null,panel,standingsTable:()=>''};
  const two=offseasonMarkup(s,opts);
  assert.match(two,/은퇴 선수/);
  assert.match(two,new RegExp(s.offseason.retired[0].name));
  assert.match(two,new RegExp(`data-release="${s.players.at(-1).id}"`));
  const id=s.players.at(-1).id;
  releasePlayer(s,id);
  advance(s,'roster');
  const six=offseasonMarkup(s,opts);
  assert.match(six,/자유계약 시장/);
  assert.match(six,new RegExp(`data-sign="${id}"`));
  assert.match(six,/data-release=/);
});

test('② 탭을 지난 단계에서 다시 열면 방출 버튼이 없다',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);nextStep(s);nextStep(s);
  assert.equal(s.offseason.step,'fa');
  const panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`;
  assert.doesNotMatch(offseasonMarkup(s,{tab:'retire',panel,standingsTable:()=>''}),/data-release=/);
});

test('새 시즌 뉴스에 오프시즌 은퇴 한 줄이 남는다',()=>{
  const s=ended();
  beginOffseason(s);
  advance(s,null);
  assert.ok(s.season.news.some(l=>/오프시즌 은퇴/.test(l)));
});

test('③: 노화 전 OVR 기록, 떠날 때 연봉 확정(대상은 보류 1년)',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);nextStep(s);
  assert.equal(s.offseason.step,'salary');
  const mine=s.players.filter(p=>!p.foreign);
  assert.ok(mine.every(p=>typeof s.offseason.ovrBefore[p.id]==='number'));
  const target=mine.find(p=>negotiable(p,2026));
  nextStep(s);
  assert.equal(s.offseason.step,'fa');
  assert.equal(target.contract.years,1);
  assert.equal(target.contract.kind,'reserve');
  assert.equal(s.offseason.salary[target.id].result,'demand');
});

test('③ 화면: 요구액 표, 제시 입력·버튼, 전원 수용 버튼, 끝난 선수는 결과 표시',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);nextStep(s);
  const panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`,opts={tab:null,panel,standingsTable:()=>''};
  const id=s.players.find(p=>negotiable(p,2026)).id;
  const html=offseasonMarkup(s,opts);
  assert.match(html,/요구액/);
  assert.match(html,new RegExp(`data-offer-input="${id}"`));
  assert.match(html,new RegExp(`data-offer="${id}"`));
  assert.match(html,/data-action="acceptall"/);
  s.offseason.salary={[id]:{demand:5000,result:'accepted',offer:5000,salary:5000}};
  assert.doesNotMatch(offseasonMarkup(s,opts),new RegExp(`data-offer="${id}"`));
});

test('③ 캡: 캡 초과면 다음 단계 불가, 방출하면 통과',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);nextStep(s);
  const pay=projectedPayroll(s),cap=s.finance.cap;
  s.finance.cap=pay-1;
  assert.equal(nextStep(s),false);
  assert.match(stepBlock(s),/캡 초과/);
  assert.equal(s.offseason.step,'salary');
  const p=s.players.filter(x=>!x.foreign).sort((a,b)=>b.contract.salary-a.contract.salary)[0];
  assert.equal(releasePlayer(s,p.id),true);
  assert.equal(stepBlock(s),null);
  assert.equal(nextStep(s),true);
  s.finance.cap=cap;
});
