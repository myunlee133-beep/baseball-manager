import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason} from '../game/league-season.js';
import {beginOffseason,nextStep,stepBlock} from '../game/contract/offseason.js';
import {runFaRound} from '../game/contract/fa.js';
import {FOREIGN,buildPool,poolStrength,scoutOvrRange,adaptation,decideForeign,offerForeign,cancelForeignOffer,closeForeign} from '../game/contract/foreign.js';
import {teamFinance} from '../game/contract/finance.js';

const ended=()=>{const s=ensureSeason(initialState());s.season.phase='ended';return s;};
const atForeign=()=>{const s=ended();beginOffseason(s);while(s.offseason.step!=='foreign'){if(s.offseason.step==='fa')for(let i=0;i<3;i++)runFaRound(s);nextStep(s);}return s;};

test('시장 풀: 해마다 18명 안팎, 투수가 2/3 안팎, 등급별 OVR 범위, 신규 요구액 100만 달러 이하, 같은 해면 같은 풀',()=>{
  for(const year of [2026,2027,2028,2029]){
    const pool=buildPool(year);
    assert.ok(pool.length>=16&&pool.length<=20,`${year} ${pool.length}`);
    const p=pool.filter(c=>c.player.pitcher).length;
    assert.ok(p>=pool.length*.5&&p<=pool.length*.85,`${year} 투수 ${p}`);
    for(const c of pool){
      const t=FOREIGN.tiers.find(t=>t.name===c.tier);
      assert.ok(c.player.ovr>=t.band[0]&&c.player.ovr<=t.band[1],`${c.tier} ${c.player.ovr}`);
      assert.ok(c.ask<=FOREIGN.newCapUsd&&c.ask>=1);
      assert.equal(c.player.foreign,true);
      assert.equal(c.player.pot,c.player.ovr);
    }
    assert.deepEqual(buildPool(year).map(c=>c.id),pool.map(c=>c.id));
  }
  assert.ok(new Set([2026,2027,2028,2029,2030,2031,2032,2033].map(poolStrength)).size>=2,'풀 강도가 해마다 달라야 함');
});

test('스카우팅: 표시 값은 실제와 최대 ±5, OVR 범위는 실제 OVR을 대체로 포함',()=>{
  const pool=buildPool(2026);
  for(const c of pool)for(const [k,v] of Object.entries(c.player.ratings))assert.ok(Math.abs(c.scout[k]-v)<=FOREIGN.scout,`${k}`);
  const inside=pool.filter(c=>{const [lo,hi]=scoutOvrRange(c);return lo<=c.player.ovr&&c.player.ovr<=hi;}).length;
  assert.ok(inside>=pool.length*.8);
});

test('적응 보정: −8~+4, 음수 쪽으로 치우침, 같은 해·선수면 같은 값',()=>{
  const xs=Array.from({length:400},(_,i)=>adaptation(2026,`fx-${i}`));
  assert.ok(xs.every(x=>x>=-8&&x<=4));
  assert.ok(xs.reduce((a,b)=>a+b,0)/xs.length<-1);
  assert.equal(adaptation(2026,'fx-1'),adaptation(2026,'fx-1'));
});

test('⑤ 진입: 내 외국인은 재계약 대기, AI는 OVR 62 미만이면 재계약 포기, 시장 마감 전에는 못 넘어감',()=>{
  const s=atForeign(),f=s.offseason.foreign;
  assert.equal(Object.keys(f.resign).length,s.players.filter(p=>p.foreign).length);
  for(let t=1;t<teams.length;t++)assert.ok(teamPlayers(s,t).filter(p=>p.foreign).every(p=>p.ovr>=FOREIGN.keepOvr));
  assert.equal(stepBlock(s),'외국인 시장을 마감해 주세요.');
  assert.equal(nextStep(s),false);
});

test('재계약: 요구 달러로 계약(예산 차감), 방출하면 팀에서 빠짐',()=>{
  const s=atForeign(),[a,b]=s.players.filter(p=>p.foreign),f=s.offseason.foreign;
  assert.equal(decideForeign(s,a.id,'keep').ok,true);
  assert.equal(a.contract.usd,f.resign[a.id].ask);
  assert.equal(a.contract.salary,a.contract.usd*1400);
  assert.equal(decideForeign(s,b.id,'release').ok,true);
  assert.ok(!s.players.some(p=>p.id===b.id));
  assert.equal(decideForeign(s,'nope','keep').ok,false);
});

test('내 제시: 100만 달러 상한, 팀당 3명·같은 유형 2명, 덮어쓰기·취소',()=>{
  const s=atForeign(),f=s.offseason.foreign,pitchers=f.pool.filter(c=>c.player.pitcher);
  assert.match(offerForeign(s,pitchers[0].id,120).reason,/100만 달러/);
  assert.match(offerForeign(s,pitchers[0].id,50).reason,/3명|2명/); // 아직 외국인 3명 그대로
  for(const p of s.players.filter(p=>p.foreign&&p.pitcher))decideForeign(s,p.id,'release');
  assert.deepEqual(offerForeign(s,pitchers[0].id,80),{ok:true,reason:''});
  assert.deepEqual(offerForeign(s,pitchers[0].id,90),{ok:true,reason:''});
  assert.equal(f.mine[pitchers[0].id],90);
  assert.deepEqual(offerForeign(s,pitchers[1].id,70),{ok:true,reason:''});
  assert.match(offerForeign(s,pitchers[2].id,70).reason,/3명|투수는 2명/);
  assert.equal(cancelForeignOffer(s,pitchers[1].id),true);
  assert.deepEqual(offerForeign(s,pitchers[2].id,70),{ok:true,reason:''});
});

test('마감: 내 최고 제시면 내 팀 2군에 합류(적응 보정 반영), AI 빈 자리 채움, 규정 준수, 미처리 내 외국인은 재계약',()=>{
  const s=atForeign(),f=s.offseason.foreign;
  const keep=s.players.find(p=>p.foreign&&!p.pitcher);
  for(const p of s.players.filter(p=>p.foreign&&p.pitcher))decideForeign(s,p.id,'release');
  const c=[...f.pool].filter(c=>c.player.pitcher).sort((a,b)=>b.player.ovr-a.player.ovr)[0],before=structuredClone(c.player.ratings);
  assert.equal(offerForeign(s,c.id,100).ok,true);
  assert.equal(closeForeign(s),true);
  assert.equal(closeForeign(s),false);
  assert.equal(c.signedBy,0);
  const p=s.players.find(x=>x.id===c.id);
  assert.equal(p.group,'second');
  assert.equal(p.teamIndex,0);
  assert.deepEqual(p.contract,{salary:140000,years:1,kind:'foreign',usd:100});
  const a=adaptation(s.offseason.year,c.id);
  assert.equal(p.adapt,a);
  for(const [k,v] of Object.entries(before))assert.equal(p.ratings[k],Math.max(20,Math.min(80,v+a)));
  assert.equal(f.resign[keep.id].decision,'keep');
  for(const t of teams.keys()){
    const fx=teamPlayers(s,t).filter(p=>p.foreign);
    assert.ok(fx.length<=3,`${teams[t]} ${fx.length}`);
    assert.ok(fx.filter(p=>p.pitcher).length<=2&&fx.filter(p=>!p.pitcher).length<=2,teams[t]);
    assert.ok(teamPlayers(s,t).length<=55);
    assert.ok(teamFinance(s,t).budgetRoom>=0||t===0,`${teams[t]} 예산`);
  }
  assert.equal(stepBlock(s),null);
  assert.equal(nextStep(s),true);
  assert.equal(s.offseason.step,'roster');
});

test('오프시즌 전체를 몇 해 돌려도 팀마다 외국인 3명 이하, 대부분 팀은 3명을 유지',()=>{
  const s=ended();
  for(let y=0;y<3;y++){
    beginOffseason(s);
    while(s.offseason){
      if(s.offseason.step==='fa')for(let i=0;i<3;i++)runFaRound(s);
      if(s.offseason.step==='foreign')closeForeign(s);
      if(!nextStep(s))break;
    }
    s.season.phase='ended';
  }
  const counts=teams.map((_,t)=>teamPlayers(s,t).filter(p=>p.foreign).length);
  assert.ok(counts.every(n=>n<=3));
  assert.ok(counts.slice(1).filter(n=>n===3).length>=6,counts.join(','));
});

import {offseasonMarkup} from '../offseason-ui.js';
test('⑤ 화면: 재계약 버튼, 스카우팅 범위, 제시 칸, 마감 버튼; 마감 뒤에는 결과와 실제 OVR', ()=>{
  const s=atForeign(),panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`,opts={tab:null,panel,standingsTable:()=>''};
  const mine=s.players.find(p=>p.foreign),c=s.offseason.foreign.pool[0];
  let html=offseasonMarkup(s,opts);
  assert.match(html,new RegExp(`data-fx-keep="${mine.id}"`));
  assert.match(html,new RegExp(`data-fx-offer="${c.id}"`));
  assert.match(html,/data-action="fxclose"/);
  const [lo,hi]=scoutOvrRange(c);
  assert.match(html,new RegExp(`${lo}~${hi}`));
  assert.match(html,/data-action="nextstep"[^>]*disabled/);
  closeForeign(s);
  html=offseasonMarkup(s,opts);
  assert.doesNotMatch(html,/data-action="fxclose"|data-fx-offer=|data-fx-keep=/);
  assert.match(html,/계약 결과/);
  assert.match(html,/적응 [+-]?\d/);
});

test('시장 풀은 여러 해 생성해도 실패하지 않는다(최상위 등급 중견수 등)',()=>{
  for(let year=2026;year<2060;year++)assert.ok(buildPool(year).length>=16,String(year));
});
