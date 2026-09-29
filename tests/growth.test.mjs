// tests/growth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {ovr,weightedRating,OVR_BASE,OVR_SPREAD} from '../game/player-ratings.js';
import {curve,rand,normal,between,traits,bloomFactor,judgeFit,playedEnough,ops,era,topPerformers,applyDelta,grow,ensureDev} from '../game/growth.js';

const hitter=(id,age,r=50,pos='2B')=>{const p={id,name:id,team:'KT 위즈',pitcher:false,pos,age,group:'first',ratings:{contact:r,eye:r,power:r,speed:r,defense:r},stats:{batting:{},pitching:{}},history:{}};p.ovr=ovr(p);p.pot=80;ensureDev(p);return p;};
const pitcher=(id,age,r=50,stamina=55)=>{const p={id,name:id,team:'KT 위즈',pitcher:true,pos:'SP',age,group:'first',ratings:{velocity:r,stuff:r,control:r,stamina},stats:{batting:{},pitching:{}},history:{}};p.ovr=ovr(p);p.pot=80;ensureDev(p);return p;};
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
// OVR의 연속값(반올림 전). 정수 OVR 차이는 시작값의 반올림 오차(최대 ±0.5)가 평균에 그대로 남아 평균 비교에 쓰지 않는다.
const score=p=>weightedRating(p)*OVR_SPREAD/OVR_BASE.sd;

test('곡선: 설계 표 값',()=>{
  const want={19:4.5,21:4.5,22:3.5,23:3.5,24:2.5,25:2.5,26:1.5,27:0,31:0,32:-1,33:-1,34:-2,35:-2,36:-3,37:-3,38:-4.5,43:-4.5};
  for(const [age,v] of Object.entries(want))assert.equal(curve(Number(age)),v,`${age}세`);
});

test('해시 난수: 재현되고, 균등·정규 분포 모양',()=>{
  assert.equal(rand('a:1'),rand('a:1'));
  const u=Array.from({length:20000},(_,i)=>rand(`u:${i}`));
  assert.ok(Math.abs(avg(u)-.5)<.01);
  assert.ok(u.every(x=>x>=0&&x<1));
  const z=Array.from({length:20000},(_,i)=>normal(`z:${i}`));
  const m=avg(z),sd=Math.sqrt(avg(z.map(x=>(x-m)**2)));
  assert.ok(Math.abs(m)<.03,`평균 ${m}`);assert.ok(Math.abs(sd-1)<.03,`표준편차 ${sd}`);
  const b=Array.from({length:5000},(_,i)=>between(`b:${i}`,8,15));
  assert.equal(Math.min(...b),8);assert.equal(Math.max(...b),15);
});

test('숨은 특성: id마다 고정, 범위와 비율',()=>{
  assert.deepEqual(traits('0-1'),traits('0-1'));
  const t=Array.from({length:4000},(_,i)=>traits(`t-${i}`));
  assert.ok(t.every(x=>x.effort>=.85&&x.effort<=1.15&&x.adapt>=0&&x.adapt<=1&&x.aging>=.6&&x.aging<=1.4));
  const share=k=>t.filter(x=>x.bloom===k).length/t.length;
  assert.ok(Math.abs(share('early')-.25)<.03&&Math.abs(share('late')-.25)<.03);
  assert.equal(bloomFactor('normal',20),1);
  assert.equal(bloomFactor('early',23),1.5);assert.equal(bloomFactor('early',24),.5);
  assert.equal(bloomFactor('late',23),.5);assert.equal(bloomFactor('late',28),1.5);
});

test('적정 리그 판정: 다섯 경우 + AI + 부상',()=>{
  const p=hitter('f1',21);
  p.ratings={contact:60,eye:60,power:60,speed:60,defense:60};p.ovr=ovr(p);
  assert.deepEqual(judgeFit(p,{mine:true,played:true}),{tag:'firstOk',grow:1.2,burst:2});
  assert.deepEqual(judgeFit(p,{mine:true,played:false}),{tag:'bench',grow:.7,burst:.5});
  p.group='second';
  assert.deepEqual(judgeFit(p,{mine:true,played:false}),{tag:'under',grow:.7,burst:.5});
  const low=hitter('f2',21,35);
  assert.ok(low.ovr<42);
  const over=judgeFit(low,{mine:true,played:true});
  assert.equal(over.tag,'over');assert.equal(over.burst,1);
  assert.ok(Math.abs(over.grow-(.8+.2*traits('f2').adapt))<1e-9);
  low.group='second';
  assert.deepEqual(judgeFit(low,{mine:true,played:false}),{tag:'secondOk',grow:1.2,burst:2});
  assert.deepEqual(judgeFit(low,{mine:false}),{tag:'ai',grow:1.2,burst:2});
  low.group='injured';
  assert.equal(judgeFit(low,{mine:true,played:true}),null);
});

test('그달 출전 충분 기준: 타자 50타석, 선발 39아웃, 불펜 21아웃',()=>{
  const h=hitter('p1',22),sp=pitcher('p2',22,50,55),rp=pitcher('p3',22,50,30);
  assert.equal(playedEnough(h,{pa:50,outs:0}),true);assert.equal(playedEnough(h,{pa:49,outs:0}),false);
  assert.equal(playedEnough(sp,{pa:0,outs:39}),true);assert.equal(playedEnough(sp,{pa:0,outs:38}),false);
  assert.equal(playedEnough(rp,{pa:0,outs:21}),true);assert.equal(playedEnough(rp,{pa:0,outs:20}),false);
});

test('성적 상위 25%: 출전 기준을 채운 선수 중 OPS·평균자책',()=>{
  const bats=Array.from({length:8},(_,i)=>({...hitter(`b${i}`,25),line:{batting:{pa:200,ab:180,h:40+i*5,bb:20}}}));
  const arms=Array.from({length:4},(_,i)=>({...pitcher(`a${i}`,25),line:{pitching:{outs:150,earnedRuns:10+i*5}}}));
  const short={...hitter('short',25),line:{batting:{pa:199,ab:100,h:90}}};
  const top=topPerformers([...bats,...arms,short],1,p=>p.line);
  assert.deepEqual([...top].sort(),['a0','b6','b7']);
  assert.ok(Math.abs(ops({ab:4,h:2,bb:1,doubles:1})-(3/5+3/4))<1e-9);
  assert.equal(era({outs:27,earnedRuns:3}),3);
  assert.ok(topPerformers([short],.5,p=>p.line).has('short'));
});

test('분배: OVR 변화량을 지키고, 베테랑은 스피드·구속이 선구안·제구보다 많이 떨어진다',()=>{
  const drops=[];
  for(let i=0;i<300;i++){
    const h=hitter(`v${i}`,38),before={...h.ratings},o=score(h);
    const c=applyDelta(h,-4.5,`k${i}`);
    drops.push(score(h)-o);
    assert.ok((c.speed??0)<(c.eye??0),`${i}: 스피드 ${c.speed} 선구안 ${c.eye}`);
    assert.ok(Object.values(h.ratings).every(v=>Number.isInteger(v)&&v>=20&&v<=80));
    assert.equal(h.ovr,ovr(h));
    for(const k of Object.keys(before))assert.equal(h.ratings[k]-before[k],c[k]??0);
  }
  assert.ok(Math.abs(avg(drops)+4.5)<.2,`평균 ${avg(drops)}`);
  for(let i=0;i<100;i++){const p=pitcher(`w${i}`,38);const c=applyDelta(p,-4.5,`k${i}`);assert.ok((c.velocity??0)<(c.control??0));}
  const young=[];
  for(let i=0;i<300;i++){const h=hitter(`y${i}`,21,40),o=score(h);applyDelta(h,3,`g${i}`);young.push(score(h)-o);}
  assert.ok(Math.abs(avg(young)-3)<.2,`평균 ${avg(young)}`);
  const edge=hitter('edge',40,79);applyDelta(edge,10,'e');assert.ok(Object.values(edge.ratings).every(v=>v<=80));
});

test('grow: 성장기(capped)는 POT를 넘지 않는다, 하락은 제한 없음',()=>{
  for(let i=0;i<200;i++){
    const h=hitter(`c${i}`,21,45);h.pot=h.ovr+1;
    grow(h,5,`c${i}`,true);
    assert.ok(h.ovr<=h.pot,`${i}: ${h.ovr} > ${h.pot}`);
  }
  const old=hitter('old',30,50);old.pot=old.ovr;
  grow(old,3,'old',false);assert.ok(old.ovr>old.pot);
});
