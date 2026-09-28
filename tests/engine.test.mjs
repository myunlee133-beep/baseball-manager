import test from 'node:test';
import assert from 'node:assert/strict';
import {LEAGUE,SPREAD,rateFor,ratingFor,matchup,deriveRatings,paOdds,resolvePA,rngFrom,simGame,calibrate,pitchesFor,strikesFor,pap} from '../engine.js';
import {seedPlayers} from '../model.js';

// 능력치를 직접 지정한 선수. 엔진 검증에는 이쪽이 기준이 된다.
const bat=(id,rt)=>({id,pitcher:false,pos:'DH',rt:{avoidK:50,eye:50,power:50,contact:50,gap:50,range:50,err:50,...rt}});
const pit=(id,rt)=>({id,pitcher:true,pos:'SP',rt:{stuff:50,control:50,movement:50,bip:50,gbPct:50,stamina:70,range:50,err:50,...rt}});
const team=(n,brt={},prt={})=>({lineup:Array.from({length:9},(_,i)=>bat(`${n}b${i}`,brt)),
                                pitchers:Array.from({length:6},(_,i)=>pit(`${n}p${i}`,prt))});

test('rateFor/ratingFor 는 서로의 역함수이고 50이 리그 평균이다',()=>{
  assert.equal(rateFor(50,LEAGUE.k,SPREAD.k).toFixed(6),LEAGUE.k.toFixed(6));
  for(const r of [10,25,50,75,90])assert.equal(ratingFor(rateFor(r,LEAGUE.k,SPREAD.k),LEAGUE.k,SPREAD.k),r);
  assert.ok(rateFor(80,LEAGUE.k,SPREAD.k)>rateFor(50,LEAGUE.k,SPREAD.k));
});

test('오즈비는 평균끼리 붙으면 리그 평균을 그대로 돌려준다',()=>{
  assert.equal(matchup(LEAGUE.k,LEAGUE.k,LEAGUE.k).toFixed(6),LEAGUE.k.toFixed(6));
  assert.ok(matchup(.30,.20,.20)>.20);   // 삼진 많은 타자
  assert.ok(matchup(.20,.10,.20)<.20);   // 삼진 못 잡는 투수
});

test('평균 대 평균 타석은 리그 설정값을 재현한다',()=>{
  const o=paOdds(bat('b'),pit('p'),50);
  assert.equal(o.k.toFixed(4),LEAGUE.k.toFixed(4));
  assert.equal(o.bb.toFixed(4),LEAGUE.bb.toFixed(4));
  assert.equal(o.hr.toFixed(4),LEAGUE.hr.toFixed(4));
  assert.equal(o.babip.toFixed(4),LEAGUE.babip.toFixed(4));
});

test('능력치는 담당 결과만 움직이고 나머지는 건드리지 않는다',()=>{
  const base=paOdds(bat('b'),pit('p'),50);
  const eye=paOdds(bat('b',{eye:90}),pit('p'),50);
  assert.ok(eye.bb>base.bb);
  assert.equal(eye.k.toFixed(6),base.k.toFixed(6));      // Eye 는 삼진에 영향 없음
  assert.equal(eye.hr.toFixed(6),base.hr.toFixed(6));
  const pow=paOdds(bat('b',{power:90}),pit('p'),50);
  assert.ok(pow.hr>base.hr);
  assert.equal(pow.k.toFixed(6),base.k.toFixed(6));      // HR Power 는 컨택에 영향 없음
  const mv=paOdds(bat('b'),pit('p',{movement:90}),50);
  assert.ok(mv.hr<base.hr);
  assert.equal(mv.bb.toFixed(6),base.bb.toFixed(6));
});

test('수비는 인플레이 타구에만 개입한다',()=>{
  const lo=paOdds(bat('b'),pit('p'),20),hi=paOdds(bat('b'),pit('p'),80);
  assert.ok(hi.babip<lo.babip);
  assert.equal(hi.k.toFixed(6),lo.k.toFixed(6));
  assert.equal(hi.bb.toFixed(6),lo.bb.toFixed(6));
});

test('같은 시드와 같은 라인업이면 경기가 완전히 재현된다',()=>{
  const a=simGame(team('H'),team('A'),42),b=simGame(team('H'),team('A'),42);
  assert.deepEqual(a.home,b.home);assert.deepEqual(a.away,b.away);assert.deepEqual(a.box,b.box);
  assert.notDeepEqual(simGame(team('H'),team('A'),43).home,a.home);
});

test('박스스코어 합계가 서로 맞는다',()=>{
  for(let s=1;s<=40;s++){
    const g=simGame(team('H'),team('A'),s);
    const inn=g.home.byInning.filter(v=>v!=='X').reduce((x,y)=>x+y,0);
    assert.equal(inn,g.home.runs);
    assert.equal(g.away.byInning.reduce((x,y)=>x+y,0),g.away.runs);
    const hits=Object.values(g.box).reduce((x,b)=>x+b.h,0);
    assert.equal(hits,g.home.hits+g.away.hits);
    for(const b of Object.values(g.box)){assert.ok(b.ab<=b.pa);assert.ok(b.h>=b.hr+b.doubles+b.triples);}
    for(const p of Object.values(g.pbox))assert.ok(p.er<=p.r);
  }
});

test('능력치가 성적을 지배한다 — 강타선이 약타선보다 많이 친다',()=>{
  const strong=team('S',{contact:80,power:80,eye:75,avoidK:80}),weak=team('W',{contact:20,power:20,eye:25,avoidK:20});
  let sr=0,wr=0;
  for(let s=1;s<=60;s++){sr+=simGame(strong,weak,s).away.runs===undefined?0:0;
    const g=simGame({...strong,pitchers:team('N').pitchers},{...weak,pitchers:team('N').pitchers},s);
    sr+=g.home.runs;wr+=g.away.runs;}
  assert.ok(sr>wr*1.5,`강타선 ${sr} vs 약타선 ${wr}`);
});

test('평균 선수로만 채운 리그는 설정한 리그 환경을 재현한다',()=>{
  let k=0,bb=0,hr=0,h=0,ab=0,pa=0,r=0,n=0;
  for(let s=1;s<=300;s++){const g=simGame(team('H'),team('A'),s);n++;r+=g.home.runs+g.away.runs;
    for(const b of Object.values(g.box)){k+=b.k;bb+=b.bb;hr+=b.hr;h+=b.h;ab+=b.ab;pa+=b.pa;}}
  const near=(got,want,tol,label)=>assert.ok(Math.abs(got-want)<tol,`${label}: ${got.toFixed(3)} vs ${want} (허용 ±${tol})`);
  near(k/pa,LEAGUE.k,.02,'K%');
  near(bb/pa,LEAGUE.bb,.015,'BB%');
  near(hr/pa,LEAGUE.hr,.01,'HR/PA');
  near(h/ab,.265,.035,'타율');
  near(r/n,9,3,'경기당 득점');
});

test('기존 시드 선수도 능력치 역산을 거쳐 경기를 치를 수 있다',()=>{
  const pool=[];for(let t=0;t<10;t++)pool.push(...seedPlayers(t));
  calibrate(pool);
  const rt=deriveRatings(pool[0]);
  for(const key of ['avoidK','eye','power','contact','gap','range'])assert.ok(rt[key]>=1&&rt[key]<=99,`${key}=${rt[key]}`);
  const mk=t=>{const ps=seedPlayers(t);return{lineup:ps.filter(p=>!p.pitcher).slice(0,9),pitchers:ps.filter(p=>p.pitcher).slice(0,6)};};
  const g=simGame(mk(0),mk(1),7);
  assert.ok(g.home.runs>=0&&g.away.runs>=0);
  assert.ok(g.innings>=9);
});

test('투구수는 규칙상 하한을 지키고 선구안·제구에 반응한다',()=>{
  const rng=rngFrom(5);
  for(let i=0;i<300;i++){
    assert.ok(pitchesFor('K',bat('b'),pit('p'),rng)>=3);    // 삼진은 최소 3구
    assert.ok(pitchesFor('BB',bat('b'),pit('p'),rng)>=4);   // 볼넷은 최소 4구
    assert.ok(pitchesFor('GB',bat('b'),pit('p'),rng)>=1);
  }
  const avg=(b,p)=>{const r=rngFrom(9);let s=0;for(let i=0;i<4000;i++)s+=pitchesFor('1B',b,p,r);return s/4000;};
  assert.ok(avg(bat('b',{eye:90}),pit('p'))>avg(bat('b',{eye:10}),pit('p')));       // 선구안 좋으면 많이 본다
  assert.ok(avg(bat('b'),pit('p',{control:90}))<avg(bat('b'),pit('p',{control:10})));// 제구 좋으면 빨리 끝낸다
});

test('스트라이크 수는 투구수를 넘지 않고 결과와 모순되지 않는다',()=>{
  const rng=rngFrom(3);
  for(const ev of ['K','BB','1B','GB','FB','HR']){
    for(let n=1;n<=12;n++){
      const st=strikesFor(ev,Math.max(ev==='K'?3:ev==='BB'?4:1,n),rng);
      assert.ok(st>=0&&st<=Math.max(ev==='K'?3:ev==='BB'?4:1,n),`${ev} ${n}구 → ${st}스트라이크`);
      if(ev==='K')assert.ok(st>=3);                          // 삼진이면 스트라이크 3개 이상
      if(ev==='BB')assert.ok(Math.max(4,n)-st===4);          // 볼넷이면 볼이 정확히 4개
    }
  }
});

test('PAP 는 100구까지 0이고 넘으면 세제곱으로 는다',()=>{
  assert.equal(pap(80),0);assert.equal(pap(100),0);
  assert.equal(pap(110),1000);assert.equal(pap(120),8000);
  assert.ok(pap(120)>pap(110)*7);                            // 벌점이 급격히 커진다
});

test('경기 박스스코어의 투구수가 서로 맞는다',()=>{
  for(let s=1;s<=30;s++){
    const g=simGame(team('H'),team('A'),s);
    const np=Object.values(g.pbox).reduce((a,p)=>a+p.np,0);
    const pi=Object.values(g.box).reduce((a,b)=>a+b.pi,0);
    assert.equal(np,pi);                                     // 던진 투구수 = 본 투구수
    for(const p of Object.values(g.pbox)){
      assert.ok(p.st<=p.np,'스트라이크가 투구수를 넘었다');
      if(p.bf>0)assert.ok(p.np>=p.bf,'타석당 최소 1구');
    }
  }
});
