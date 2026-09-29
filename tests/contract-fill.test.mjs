import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYERS} from '../game/kbo-2026.js';
import {teams,teamSetup} from '../model.js';
import {fillTeam,prepareRoster,upgradeToV4,FILL} from '../game/contract/league-fill.js';

const rosterOf=i=>structuredClone(PLAYERS.filter(p=>p.teamIndex===i));
const filled=teams.map((_,i)=>prepareRoster(rosterOf(i),i));
const all=filled.flat();

test('모든 구단 55명 = 국내 52 + 외국인 3(투수 2·타자 1), 실제 410명 유지, id 중복 없음',()=>{
  for(const r of filled){
    assert.equal(r.length,55);
    const f=r.filter(p=>p.foreign);
    assert.equal(f.length,3);
    assert.equal(f.filter(p=>p.pitcher).length,2);
  }
  const ids=new Set(all.map(p=>p.id));
  assert.equal(ids.size,550);
  for(const p of PLAYERS)assert.ok(ids.has(p.id),p.id);
  assert.equal(all.filter(p=>p.generated).length,110);
});

test('가상 선수는 2군 뎁스: OVR 30~42, 19~27세, POT ≥ OVR, 계약 3,000만~4,000만',()=>{
  for(const p of all.filter(p=>p.generated)){
    assert.equal(p.group,'second');
    assert.ok(p.ovr>=FILL.depthOvr[0]&&p.ovr<=FILL.depthOvr[1],`${p.id} ${p.ovr}`);
    assert.ok(p.age>=19&&p.age<=27);
    assert.ok(p.pot>=p.ovr&&p.pot<=80);
    assert.ok(p.contract.salary>=3000&&p.contract.salary<=4000);
    assert.ok(p.name.length>=2);
  }
});

test('가상 선수는 부족한 쪽부터: 투수·야수 모두 26명 또는 원래 인원을 넘겨 채우지 않는다',()=>{
  filled.forEach((r,i)=>{
    const orig=PLAYERS.filter(p=>p.teamIndex===i),dom=r.filter(p=>!p.foreign);
    const n=(a,pitcher)=>a.filter(p=>p.pitcher===pitcher).length;
    assert.ok(n(dom,true)<=Math.max(26,n(orig,true)),`${teams[i]} 투수`);
    assert.ok(n(dom,false)<=Math.max(26,n(orig,false)),`${teams[i]} 야수`);
  });
});

test('외국인: 능력치 범위 준수(제구는 구속 보정으로 범위 아래로 내려갈 수 있음), 등급 1선발 74~78·2선발 68~73·타자 62~68',()=>{
  const within=(p,shape)=>Object.entries(shape).every(([k,[lo,hi]])=>k==='control'?p.ratings[k]<=hi:p.ratings[k]>=lo&&p.ratings[k]<=hi);
  for(const r of filled){
    const [ace,sp2]=r.filter(p=>p.foreign&&p.pitcher).sort((a,b)=>b.ovr-a.ovr),bat=r.find(p=>p.foreign&&!p.pitcher);
    assert.ok(ace.ovr>=74&&ace.ovr<=78,`ace ${ace.ovr}`);
    assert.ok(sp2.ovr>=68&&sp2.ovr<=73,`sp2 ${sp2.ovr}`);
    assert.ok(bat.ovr>=62&&bat.ovr<=68,`bat ${bat.ovr}`);
    assert.ok(within(ace,FILL.foreignShape.pitcher)&&within(sp2,FILL.foreignShape.pitcher),'투수 범위');
    assert.ok(within(bat,FILL.foreignShape.hitter),'타자 범위');
    for(const p of [ace,sp2,bat]){
      assert.equal(p.pot,p.ovr);
      assert.ok(p.age>=26&&p.age<=33);
      assert.equal(p.contract.kind,'foreign');
      assert.equal(p.contract.salary,p.contract.usd*1400); // 만 달러 × 1,400원 → 만 원
      assert.equal(p.faYear,null);
    }
  }
});

test('새 게임 편성: 외국인이 1군 로테이션·라인업에 들고 1군 인원과 로테이션 5명은 그대로',()=>{
  for(const [i,r] of filled.entries()){
    assert.equal(r.filter(p=>p.group==='first').length,PLAYERS.filter(p=>p.teamIndex===i&&p.group==='first').length);
    const s=teamSetup(r);
    assert.equal(s.rotation.length,5);
    for(const p of r.filter(p=>p.foreign&&p.pitcher))assert.ok(s.rotation.includes(p.id),`${teams[i]} ${p.id}`);
    assert.ok(Object.values(s.field).includes(r.find(p=>p.foreign&&!p.pitcher).id),teams[i]);
  }
});

test('같은 시드면 같은 결과',()=>{
  const again=prepareRoster(rosterOf(4),4);
  assert.deepEqual(again,filled[4]);
});

test('v3 이관: 내 팀 외국인은 2군(편성 유지), AI 외국인은 1군, 재정·오프시즌 필드 추가',()=>{
  const v3={players:rosterOf(0),league:Object.fromEntries(teams.map((_,i)=>[i,rosterOf(i)]).filter(([i])=>i>0)),order:['0-13'],season:{year:2026}};
  const s=upgradeToV4(v3);
  assert.equal(s.version,4);
  assert.deepEqual(s.order,['0-13']);
  assert.equal(s.offseason,null);
  assert.equal(s.finance.cap,1400000);
  assert.equal(s.players.length,55);
  for(const p of s.players.filter(p=>p.foreign))assert.equal(p.group,'second');
  for(const i of [1,9]){
    assert.equal(s.league[i].length,55);
    for(const p of s.league[i].filter(p=>p.foreign))assert.equal(p.group,'first');
  }
  assert.ok(s.players.every(p=>p.contract));
});

test('fillTeam은 이미 채워진 팀을 다시 늘리지 않는다',()=>{
  const r=structuredClone(filled[2]);
  fillTeam(r,2);
  assert.equal(r.length,55);
});
