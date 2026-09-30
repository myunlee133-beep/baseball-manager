// tests/growth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {ovr,weightedRating,OVR_BASE,OVR_SPREAD} from '../game/player-ratings.js';
import {curve,rand,normal,between,traits,bloomFactor,judgeFit,playedEnough,ops,era,topPerformers,applyDelta,grow,ensureDev,rollMonth,rollOffseason,monthlyGrowth,offseasonGrowth,SCOUT} from '../game/growth.js';
import {initialState} from '../model.js';
import {ensureSeason,allPlayers} from '../game/league-season.js';

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

const none=new Set(),flat={grow:1,burst:0};

test('오프시즌 평균 변화 = 곡선 × 70% (+ 34세 이상 급락 기대값)',()=>{
  for(const age of [21,23,25,26,30,33,35,37,39]){
    const d=[];
    for(let i=0;i<1000;i++){const h=hitter(`o${age}-${i}`,age),o=score(h);rollOffseason(h,{year:2026,mine:false,top:none,fit:flat});d.push(score(h)-o);}
    const want=curve(age)*.7+(age>=34?.05*.6*-5:0);
    assert.ok(Math.abs(avg(d)-want)<.3,`${age}세: 평균 ${avg(d).toFixed(2)} 기대 ${want}`);
  }
});

test('월간: 곡선 × 5% × 계수, 적정 리그 누적과 출전량 기준점',()=>{
  const d=[];
  for(let i=0;i<1000;i++){const h=hitter(`m${i}`,21),o=score(h);rollMonth(h,{year:2026,month:5,mine:false,top:none,fit:flat});d.push(score(h)-o);}
  assert.ok(Math.abs(avg(d)-4.5*.05)<.1,`평균 ${avg(d)}`);
  const p=hitter('acc',20,35);p.group='second';p.stats.batting.pa=12;
  rollMonth(p,{year:2026,month:5,mine:true,top:none});
  assert.deepEqual(p.dev.fit,{sum:1.2,n:1,bsum:2});
  assert.deepEqual(p.dev.mark,{pa:12,outs:0});
  const vet=hitter('vet',30);vet.stats.batting.pa=80;
  rollMonth(vet,{year:2026,month:5,mine:true,top:none});
  assert.equal(vet.dev.fit.n,0);
});

test('1군 적정 + 성적 상위면 각성 배율 3',()=>{
  const p=hitter('star',22,60);p.stats.batting.pa=60;
  rollMonth(p,{year:2026,month:5,mine:true,top:new Set(['star'])});
  assert.equal(p.dev.fit.bsum,3);
});

test('범위: 성장기 POT 상한, 능력치 정수 20–80, 27세 이상 POT = OVR, pot ≥ ovr',()=>{
  for(let i=0;i<300;i++){
    const y=hitter(`r${i}`,22,45);y.pot=y.ovr+1;const cap=y.pot;
    rollOffseason(y,{year:2026,mine:false,top:none,fit:{grow:1.2,burst:0}});
    assert.ok(y.ovr<=cap);assert.ok(y.pot>=y.ovr);
    assert.ok(Object.values(y.ratings).every(v=>Number.isInteger(v)&&v>=20&&v<=80));
    const v=hitter(`s${i}`,28+(i%12),55);v.pot=70;
    rollOffseason(v,{year:2026,mine:false,top:none});
    assert.equal(v.pot,v.ovr);
  }
});

test('POT: 23세 이하는 각성 없이 그대로, 24–26세는 예상 도달치로 25% 이동',()=>{
  const y=hitter('p22',22,45);y.pot=70;
  rollOffseason(y,{year:2026,mine:false,top:none,fit:flat});
  assert.equal(y.pot,70);
  const m=hitter('p25',25,45);m.pot=75;
  rollOffseason(m,{year:2026,mine:false,top:none,fit:flat});
  const want=Math.max(m.ovr,Math.round(75+(m.ovr+curve(26)-75)*.25));
  assert.equal(m.pot,want);
});

test('각성·급락 확률(오프시즌 60%)과 한 해 한 번',()=>{
  let b=0,c=0;
  for(let i=0;i<10000;i++){
    const y=hitter(`e${i}`,22,40);if(rollOffseason(y,{year:2026,mine:false,top:none}).event?.type==='breakout')b++;
    const o=hitter(`f${i}`,36,55);if(rollOffseason(o,{year:2026,mine:false,top:none}).event?.type==='collapse')c++;
  }
  assert.ok(Math.abs(b/10000-.05*2*.6)<.012,`각성 ${b}`);
  assert.ok(Math.abs(c/10000-.05*.6)<.008,`급락 ${c}`);
  let blocked=0;
  for(let i=0;i<2000;i++){const y=hitter(`g${i}`,22,40);y.dev.eventYear=2026;if(rollOffseason(y,{year:2026,mine:false,top:none}).event)blocked++;}
  assert.equal(blocked,0);
});

test('시즌 중 각성: POT 즉시 상승, 추가 성장 절반은 pending, 오프시즌에 정산',()=>{
  let p,r;
  for(let i=0;!r?.event;i++){p=hitter(`sb${i}`,22,40);p.pot=60;r=rollMonth(p,{year:2026,month:6,mine:false,top:none});}
  assert.equal(r.event.type,'breakout');
  assert.ok(p.pot-60>=8&&p.pot-60<=15,`POT +${p.pot-60}`);
  assert.ok(p.dev.pending>0);
  assert.equal(p.dev.eventYear,2026);
  p.age++;
  const off=rollOffseason(p,{year:2026,mine:false,top:none});
  assert.equal(off.event,null);
  assert.equal(p.dev.pending,0);
  assert.deepEqual(p.dev.fit,{sum:0,n:0,bsum:0});
});

test('시즌 중 급락: 즉시 약 −3, pending −2',()=>{
  let p,r,o;
  for(let i=0;!r?.event;i++){p=hitter(`sc${i}`,36,55);o=score(p);r=rollMonth(p,{year:2026,month:6,mine:false,top:none});}
  assert.equal(r.event.type,'collapse');
  assert.ok(o-score(p)>=2&&o-score(p)<=4.5,`즉시 ${score(p)-o}`);
  assert.equal(p.dev.pending,-2);
});

test('외국인: 성장·각성 없음, POT = OVR, 하락은 국내와 같다',()=>{
  for(let i=0;i<300;i++){
    const f=hitter(`fx${i}`,24,50);f.foreign=true;f.pot=f.ovr;const o=f.ovr;
    for(let m=4;m<=9;m++)rollMonth(f,{year:2026,month:m,mine:false,top:none});
    const r=rollOffseason(f,{year:2026,mine:false,top:none});
    assert.equal(r.event,null);assert.ok(f.ovr<=o,`${o} → ${f.ovr}`);assert.equal(f.pot,f.ovr);
  }
  const d=[];
  for(let i=0;i<1000;i++){const f=hitter(`fo${i}`,36,55);f.foreign=true;const o=score(f);rollOffseason(f,{year:2026,mine:false,top:none,fit:flat});d.push(score(f)-o);}
  assert.ok(Math.abs(avg(d)-(-3*.7-.05*.6*5))<.3,`평균 ${avg(d)}`);
});

test('27–29세 각성: 오프시즌 뒤 POT가 OVR을 따라간다, 평균 +4 가산',()=>{
  const gain=[];
  for(let i=0;gain.length<40;i++){const p=hitter(`pr${i}`,28,50);p.pot=p.ovr;const o=score(p),r=rollOffseason(p,{year:2026,mine:false,top:none});if(r.event){assert.equal(r.event.type,'breakout');assert.equal(p.pot,p.ovr);gain.push(score(p)-o);}}
  assert.ok(Math.abs(avg(gain)-4)<1,`평균 ${avg(gain)}`); // +3~5 균등(평균 4) + 개인차(평균 0)
});

const league=()=>{const s=ensureSeason(initialState());s.season.date='2026-04-01';return s;};

test('월간 리포트: 내 팀 변화가 없으면 보내지 않는다',()=>{
  const s=league();
  for(const p of s.players)p.age=30; // 곡선 0, 각성(≤29)·급락(≥34) 대상 아님
  monthlyGrowth(s);
  assert.equal(s.inbox.filter(m=>m.from===SCOUT).length,0);
});

test('월간 리포트: 변화가 있으면 일반 메시지 한 통, 표에 바뀐 선수',()=>{
  const s=league();
  for(const p of s.players)p.age=20;
  const {events}=monthlyGrowth(s);
  const report=s.inbox.find(m=>m.subject==='3월 스카우트 리포트');
  assert.ok(report);assert.equal(report.importance,'normal');
  const rows=report.body.find(b=>b.table).table.rows;
  assert.ok(rows.length>0);
  assert.ok(rows.every(r=>s.players.some(p=>p.name===r[0])));
  const mineEvents=events.filter(e=>e.mine).length;
  assert.equal(s.inbox.filter(m=>m.importance==='high').length,mineEvents);
  const others=events.filter(e=>!e.mine).length;
  assert.equal(s.season.news.filter(l=>l.includes('기량 급')).length,Math.min(others,20));
});

test('오프시즌: history 에 변화 전 OVR·POT, 리포트는 중요 메시지, 재현성',()=>{
  const a=league(),b=league();
  const before=new Map(allPlayers(a).map(p=>[p.id,{ovr:p.ovr,pot:p.pot}]));
  for(const s of [a,b])for(const p of allPlayers(s))p.age++;
  const {events}=offseasonGrowth(a);offseasonGrowth(b);
  assert.deepEqual(a.players,b.players);assert.deepEqual(a.league,b.league);
  for(const p of allPlayers(a))assert.deepEqual({ovr:p.history[2026].ovr,pot:p.history[2026].pot},before.get(p.id));
  const report=a.inbox.find(m=>m.subject==='2026 오프시즌 스카우트 리포트');
  assert.ok(report);assert.equal(report.importance,'high');
  assert.equal(report.body.find(b=>b.table).table.rows.length,a.players.length);
  assert.equal(a.inbox.filter(m=>m.importance==='high').length,1+events.filter(e=>e.mine).length);
  assert.ok(allPlayers(a).every(p=>p.pot>=p.ovr&&(p.age<27||p.pot===p.ovr)));
});
