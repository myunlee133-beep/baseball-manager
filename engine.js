// 타석 해결 엔진. OOTP 구조를 따름: 능력치 → 기대율 → 오즈비 결합 → 순차 판정.
// 능력치는 1~100, 50이 리그 평균. 표시용 스케일(ovr/pot)과는 별개 축이다.

// ── 튜닝 노브 ────────────────────────────────────────────────
// LEAGUE: 리그 환경. 이 값을 바꾸면 같은 능력치라도 성적이 달라진다(투고타저/타고투저).
export const LEAGUE={k:.200,bb:.085,hr:.028,babip:.300,gb:.44,xbhGap:.30,triple:.06,err:.015};
// SPREAD: 능력치 1단계가 로그오즈를 얼마나 흔드는가. 클수록 선수 간 격차가 커진다.
// BABIP이 작은 건 의도적이다 — 실제 야구에서 타구 결과는 능력으로 잘 안 갈린다.
export const SPREAD={k:.90,bb:.75,hr:1.10,babip:.35};
// CFG: OOTP config/engine.cfg 와 같은 역할. 계산 결과에 곱하는 배율, 100 = 100%.
export const CFG={GROUNDBALL_FLYBALL:100,DEFENSE_INFLUENCE:100,FIELDING_ERROR:100,DOUBLE_PLAY:100,TAGUP_THIRD:100,HOMERUN:100,STRIKEOUT:100,WALK:100};
const pct=k=>CFG[k]/100;

// ── 1층: 능력치 ↔ 기대율 변환 ─────────────────────────────────
const odds=r=>r/(1-r), unodds=o=>o/(1+o);
const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
// 능력치 50 → 리그 평균. 로그오즈 공간에서 선형으로 움직인다.
export const rateFor=(rating,league,spread)=>unodds(odds(league)*Math.exp(spread*(clamp(rating,1,99)-50)/50));
// 위 식의 역함수. 기존 시드 성적에서 능력치를 역산할 때 쓴다.
export const ratingFor=(rate,league,spread)=>clamp(Math.round(50+50*Math.log(odds(clamp(rate,.001,.999))/odds(league))/spread),1,99);

// ── 2층: 오즈비 결합 (Bill James log5 / Tango odds ratio) ─────
// 타자율·투수율·리그평균을 합쳐 이 매치업의 기대율을 낸다.
export const matchup=(b,p,l)=>{const or=odds(b)*odds(p)/odds(l);return unodds(or);};

// ── 기준 환경 ────────────────────────────────────────────────
// POOL: 능력치를 역산할 때 쓰는 "이 선수단의 평균". LEAGUE와 분리하는 게 핵심이다.
// 둘을 같은 값으로 쓰면, 선수단 평균이 LEAGUE에서 벗어날 때 타자·투수 편차가
// 오즈비에서 곱으로 증폭되어 K%·BB%가 폭주한다.
// POOL: 능력치 역산의 기준점. 타자용·투수용을 반드시 분리해야 한다.
// 내부 정합적인 리그라면 타자 집계 K%와 투수 집계 K%가 같지만, 날조된 시드
// 데이터는 그렇지 않다. 하나로 뭉치면 양쪽 능력치가 동시에 한쪽으로 쏠리고
// 오즈비가 그 편차를 곱으로 증폭시킨다.
export let POOL={bat:{...LEAGUE},pit:{...LEAGUE}};
export function calibrate(players){
  const B=players.filter(p=>!p.pitcher),P=players.filter(p=>p.pitcher);
  const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  const pa=sum(B,p=>p.pa)||1,bbip=sum(B,p=>Math.max(1,p.ab-p.k-p.hr))||1;
  const bf=sum(P,p=>p.outs+p.ha+p.bb)||1,pbip=sum(P,p=>Math.max(1,p.outs-p.k+p.ha-p.hr))||1;
  POOL={
    bat:{...LEAGUE,k:sum(B,p=>p.k)/pa,bb:sum(B,p=>p.bb)/pa,hr:sum(B,p=>p.hr)/pa,
         babip:sum(B,p=>Math.max(0,p.h-p.hr))/bbip,
         xbhGap:sum(B,p=>p.doubles+p.triples*2)/Math.max(1,sum(B,p=>Math.max(0,p.h-p.hr)))},
    pit:{...LEAGUE,k:sum(P,p=>p.k)/bf,bb:sum(P,p=>p.bb)/bf,hr:sum(P,p=>p.hr)/bf,
         babip:sum(P,p=>Math.max(0,p.ha-p.hr))/pbip}};
  players.forEach(p=>{delete p.rt;});
  return POOL;
}

// ── 능력치 역산 ──────────────────────────────────────────────
// 기록실에 이미 노출된 성적과 어긋나지 않도록, 성적에서 능력치를 뽑는다.
export function deriveRatings(p){
  if(p.rt)return p.rt;
  if(!p.pitcher){
    const pa=p.pa||1,bip=Math.max(1,p.ab-p.k-p.hr),hits=Math.max(0,p.h-p.hr);
    p.rt={
      avoidK:100-ratingFor(p.k/pa,POOL.bat.k,SPREAD.k),        // 높을수록 삼진이 적다 → 반전
      eye:ratingFor(p.bb/pa,POOL.bat.bb,SPREAD.bb),
      power:ratingFor(p.hr/pa,POOL.bat.hr,SPREAD.hr),
      contact:ratingFor(hits/bip,POOL.bat.babip,SPREAD.babip),
      gap:clamp(Math.round(50+((p.doubles+p.triples*2)/Math.max(1,hits)-POOL.bat.xbhGap)*160),1,99)};
  }else{
    const bf=Math.max(1,p.outs+p.ha+p.bb),bip=Math.max(1,p.outs-p.k+p.ha-p.hr);
    p.rt={
      stuff:ratingFor(p.k/bf,POOL.pit.k,SPREAD.k),
      control:100-ratingFor(p.bb/bf,POOL.pit.bb,SPREAD.bb),    // 높을수록 볼넷이 적다 → 반전
      movement:100-ratingFor(p.hr/bf,POOL.pit.hr,SPREAD.hr),   // 높을수록 피홈런이 적다 → 반전
      bip:100-ratingFor(Math.max(0,p.ha-p.hr)/bip,POOL.pit.babip,SPREAD.babip), // 높을수록 인플레이를 아웃으로
      gbPct:clamp(30+(p.id.charCodeAt(p.id.length-1)*7)%45,1,99),
      stamina:p.pos==='SP'?clamp(55+p.ovr%40,25,99):clamp(15+p.ovr%25,1,54)};
  }
  // 수비. 시드 데이터에 수비 지표가 없어 ovr에서 파생한다.
  // ponytail: ovr 파생 수비, 실제 수비 지표가 생기면 그걸로 교체
  p.rt.range=clamp(Math.round(p.ovr*.9+(p.pos==='C'||p.pos==='1B'?-8:p.pos==='SS'||p.pos==='CF'?8:0)),1,99);
  p.rt.err=clamp(p.ovr,1,99);
  return p.rt;
}

// ── 3층: 타석 해결 ───────────────────────────────────────────
// 순차 깔때기. K/BB/HR을 타석당 확률로 뽑아 다항 추출하고, 남으면 인플레이로 내린다.
export function paOdds(batter,pitcher,defense=50){
  const b=deriveRatings(batter),p=deriveRatings(pitcher);
  const k =matchup(rateFor(100-b.avoidK,LEAGUE.k,SPREAD.k), rateFor(p.stuff,LEAGUE.k,SPREAD.k), LEAGUE.k)*pct('STRIKEOUT');
  const bb=matchup(rateFor(b.eye,LEAGUE.bb,SPREAD.bb), rateFor(100-p.control,LEAGUE.bb,SPREAD.bb), LEAGUE.bb)*pct('WALK');
  const hr=matchup(rateFor(b.power,LEAGUE.hr,SPREAD.hr), rateFor(100-p.movement,LEAGUE.hr,SPREAD.hr), LEAGUE.hr)*pct('HOMERUN');
  // 수비는 인플레이 단계에서만 개입한다 (매뉴얼: Range가 안타/아웃을 가른다).
  const defShift=(defense-50)/50*.035*pct('DEFENSE_INFLUENCE');
  const babip=clamp(matchup(rateFor(b.contact,LEAGUE.babip,SPREAD.babip), rateFor(100-p.bip,LEAGUE.babip,SPREAD.babip), LEAGUE.babip)-defShift,.15,.50);
  const total=k+bb+hr;
  return total>=.92?{k:k*.92/total,bb:bb*.92/total,hr:hr*.92/total,babip}:{k,bb,hr,babip};
}

export function resolvePA(batter,pitcher,defense,rng){
  const o=paOdds(batter,pitcher,defense),b=deriveRatings(batter),p=deriveRatings(pitcher);
  let r=rng();
  if((r-=o.k)<0)return 'K';
  if((r-=o.bb)<0)return 'BB';
  if((r-=o.hr)<0)return 'HR';
  if(rng()>=o.babip){                                        // 인플레이 아웃
    // 수비 능력이 높을수록 실책이 준다. defense 50 → 1배, 99 → 0.5배, 1 → 1.5배.
    if(rng()<LEAGUE.err*pct('FIELDING_ERROR')*(1-(defense-50)/100))return 'E';
    const gb=clamp(LEAGUE.gb+(p.gbPct-50)/50*.22,.1,.85)*pct('GROUNDBALL_FLYBALL');
    return rng()<gb?'GB':'FB';
  }
  const xbh=clamp((b.gap-50)/160+LEAGUE.xbhGap,.05,.65);     // 안타 중 장타 비율
  if(rng()>=xbh)return '1B';
  return rng()<LEAGUE.triple*(1+(b.gap-50)/50)?'3B':'2B';
}

// ── 4층: 경기 진행 ───────────────────────────────────────────
// 시드 고정 RNG. 같은 시드 + 같은 라인업 = 같은 경기. 리플레이와 테스트에 필요하다.
export function rngFrom(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

const line=()=>({pa:0,ab:0,h:0,hr:0,doubles:0,triples:0,bb:0,k:0,rbi:0,r:0,pi:0});
const pline=()=>({outs:0,ha:0,hr:0,bb:0,k:0,r:0,er:0,bf:0,np:0,st:0});

// ponytail: 주자 진루는 고정 확률 모델. 주력(speed) 능력치가 생기면 여기에 물린다.
function advance(bases,ev,rng,bat,box){
  let runs=0;const score=id=>{runs++;if(id)box[id].r++;};
  if(ev==='HR'){[...bases].forEach(id=>id&&score(id));score(bat);return{bases:[null,null,null],runs};}
  if(ev==='BB'||ev==='E'){                                   // 밀어내기만 진루
    if(bases[0]&&bases[1]&&bases[2])score(bases[2]);
    return{bases:bases[0]?(bases[1]?[bat,bases[0],bases[1]]:[bat,bases[0],bases[2]]):[bat,bases[1],bases[2]],runs};
  }
  if(ev==='1B'){if(bases[2])score(bases[2]);let third=null;
    if(bases[1]){if(rng()<.55)score(bases[1]);else third=bases[1];}
    return{bases:[bat,bases[0],third],runs};}
  if(ev==='2B'){[bases[1],bases[2]].forEach(id=>id&&score(id));let third=null;
    if(bases[0]){if(rng()<.45)score(bases[0]);else third=bases[0];}
    return{bases:[null,bat,third],runs};}
  if(ev==='3B'){bases.forEach(id=>id&&score(id));return{bases:[null,null,bat],runs};}
  return{bases,runs};
}

export function simGame(home,away,seed=1){
  const rng=rngFrom(seed);
  const side=t=>({lineup:t.lineup,pitchers:t.pitchers,def:t.lineup.reduce((s,p)=>s+deriveRatings(p).range,0)/t.lineup.length,
    idx:0,pi:0,runs:0,byInning:[],jitter:0});
  const H=side(home),A=side(away);
  H.jitter=Math.round((rng()-.5)*22);A.jitter=Math.round((rng()-.5)*22);
  const box={},pbox={};
  [...home.lineup,...away.lineup].forEach(p=>box[p.id]=line());
  [...home.pitchers,...away.pitchers].forEach(p=>pbox[p.id]=pline());

  const half=(off,def)=>{
    let outs=0,bases=[null,null,null],runs=0;
    while(outs<3){
      let pit=def.pitchers[def.pi];
      // 투수 교체: 투구수가 스태미나에서 나온 한계를 넘으면 다음 투수로.
      // 선발은 Stamina 99 → 약 105구, 50 → 약 78구. 불펜은 그 절반 이하.
      const lim=p=>{const st=deriveRatings(p).stamina;return(p.pos==='SP'?50+st*.55:12+st*.45)+def.jitter;};
      const pb0=pbox[pit.id];
      // 한계 투구수를 넘었거나, 두들겨 맞고 있으면 내린다. 후자가 투구수 분산을 만든다.
      const done=pb0.np>=lim(pit)||(pb0.r>=4&&pb0.np>=lim(pit)*.5)||pb0.r>=7;
      if(done&&def.pi<def.pitchers.length-1){def.pi++;pit=def.pitchers[def.pi];}
      const bat=off.lineup[off.idx%off.lineup.length];off.idx++;
      const ev=resolvePA(bat,pit,def.def,rng);
      const b=box[bat.id],pb=pbox[pit.id];
      const np=pitchesFor(ev,bat,pit,rng);
      b.pa++;pb.bf++;b.pi+=np;pb.np+=np;pb.st+=strikesFor(ev,np,rng);
      if(ev!=='BB')b.ab++;
      if(ev==='K'){b.k++;pb.k++;outs++;pb.outs++;}
      else if(ev==='BB'){b.bb++;pb.bb++;}
      else if(ev==='E'){/* 출루하되 타수는 기록, 자책점 아님 */}
      else if(ev==='GB'||ev==='FB'){
        outs++;pb.outs++;
        // 병살: 땅볼 + 1루 주자 + 2아웃 전
        if(ev==='GB'&&bases[0]&&outs<3&&rng()<.13*pct('DOUBLE_PLAY')){outs++;pb.outs++;bases[0]=null;}
        // 희생플라이: 뜬공 + 3루 주자 + 2아웃 전
        else if(ev==='FB'&&bases[2]&&outs<3&&rng()<.45*pct('TAGUP_THIRD')){box[bases[2]].r++;b.rbi++;runs++;bases[2]=null;}
      }
      else{b.h++;pb.ha++;if(ev==='HR'){b.hr++;pb.hr++;}if(ev==='2B')b.doubles++;if(ev==='3B')b.triples++;}
      if(outs<3||ev==='HR'||['1B','2B','3B','BB','E'].includes(ev)){
        const res=advance(bases,ev,rng,bat.id,box);
        if(['1B','2B','3B','HR','BB','E'].includes(ev)){bases=res.bases;b.rbi+=res.runs;runs+=res.runs;pb.r+=res.runs;if(ev!=='E')pb.er+=res.runs;}
      }
    }
    off.runs+=runs;off.byInning.push(runs);
  };

  for(let inn=1;inn<=9;inn++){
    half(A,H);
    if(inn===9&&H.runs>A.runs){H.byInning.push('X');break;}   // 끝내기 전 홈 9회말 생략
    half(H,A);
  }
  let inn=9;
  while(H.runs===A.runs&&inn<15){inn++;half(A,H);half(H,A);}  // ponytail: 15회 무승부 처리
  return {home:{runs:H.runs,byInning:H.byInning,hits:home.lineup.reduce((s,p)=>s+box[p.id].h,0)},
          away:{runs:A.runs,byInning:A.byInning,hits:away.lineup.reduce((s,p)=>s+box[p.id].h,0)},
          box,pbox,innings:inn};
}

// ── 5층: 투구수 ──────────────────────────────────────────────
// OOTP는 투구 단위로 시뮬레이션해 투구수가 부산물로 떨어진다. 여기서는 타석 결과를
// 먼저 정하고 투구수를 역산한다 — 집계는 같고, 이미 검증한 PA 확률이 안 깨진다.
// ponytail: 볼카운트 자체는 없다. 3-0 대기·0-2 유인구 같은 카운트 전술이
//           필요해지면 그때 투구 단위 시뮬레이션으로 올라가야 한다.

// 결과별 평균 투구수. 삼진·볼넷이 길고 초구 인플레이가 짧다.
const PITCHES={K:4.95,BB:5.75,HR:3.8,'1B':3.5,'2B':3.6,'3B':3.6,GB:3.2,FB:3.4,E:3.3};
const MIN={K:3,BB:4};
// 스트라이크 비율 노브. 실측으로 맞춘 값이다 (목표 63~65%).
export const STRIKE={k:.50,ip:.50};                                        // 규칙상 하한
export function pitchesFor(outcome,batter,pitcher,rng){
  const b=deriveRatings(batter),p=deriveRatings(pitcher);
  // 선구안 좋은 타자는 공을 많이 보고, 제구 좋은 투수는 빨리 끝낸다.
  const adj=1+(b.eye-50)/50*.12-(p.control-50)/50*.08;
  const mean=PITCHES[outcome]*adj;
  // 평균 주변 분산. 두 번 굴려 더해 종 모양에 가깝게 만든다.
  const n=Math.round(mean+(rng()+rng()-1)*1.8);
  return Math.max(MIN[outcome]||1,n);
}
// 스트라이크 수. K는 최소 3개, BB는 볼 4개를 뺀 나머지, 인플레이는 마지막 1구가 스트라이크.
// 확률적 반올림. 일반 반올림을 쓰면 4구 승부가 1.5를 넘는 순간 집단 전체가
// 한꺼번에 점프해 계수에 절벽이 생긴다 (.48→58.6%, .50→67.7%, 사이값 없음).
const sround=(x,rng)=>Math.floor(x)+(rng()<x%1?1:0);
export function strikesFor(outcome,pitches,rng){
  if(outcome==='K')return Math.min(pitches,3+sround((pitches-3)*STRIKE.k,rng));
  if(outcome==='BB')return Math.max(0,pitches-4);
  return Math.min(pitches,1+sround((pitches-1)*STRIKE.ip,rng));
}
// Pitcher Abuse Points (Baseball Prospectus). 100구를 넘는 순간부터 세제곱으로 벌점.
export const pap=pitches=>pitches>100?Math.pow(pitches-100,3):0;
