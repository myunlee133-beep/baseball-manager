// game/contract/league-fill.js
/** 로스터 채우기: 국내 가상 선수(2군 뎁스)와 외국인 3명을 만든다. 팀·연도 시드로 결과가 고정된다. 상태는 제자리 변경한다. */
import {ovr,potCap} from '../player-ratings.js';
import {rngFrom} from '../../engine.js';
import {FIN,assignContract,createFinance} from './finance.js';
import {teams} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다

export const FILL={
  domestic:52,max:55,
  depthOvr:[30,42],depthAge:[19,27],
  depthShape:{
    hitter:{contact:[25,45],eye:[25,45],power:[25,45],speed:[30,55],defense:[30,55]},
    pitcher:{velocity:[35,55],stuff:[30,50],control:[30,50],stamina:[30,60]},
  },
  // 외국인: 인터뷰에서 정한 능력치 범위 그대로. 이 범위의 OVR 분포(투수 평균 약 73, 타자 약 63)에 맞춰 등급을 둔다
  foreignShape:{
    pitcher:{velocity:[60,75],stuff:[55,70],control:[40,62],stamina:[55,70]},
    hitter:{contact:[45,62],eye:[40,60],power:[60,75],speed:[30,50],defense:[35,50]},
  },
  foreignSlots:[{slot:'ace',pitcher:true,ovr:[74,78],usd:130},{slot:'sp2',pitcher:true,ovr:[68,73],usd:100},{slot:'bat',pitcher:false,ovr:[62,68],usd:110}],
  foreignAge:[26,33],usdSpread:.15,
  foreignPos:['1B','LF','RF','DH','1B','LF','RF','DH','3B','CF'], // 1B/LF/RF/DH 80%
};
const HIT_POS=['C','1B','2B','3B','SS','LF','CF','RF'];
const RECORD_KEYS=['pa','ab','h','hr','bb','k','doubles','triples','sb','attempts','rbi','avg','obp','slg','ops','babip','iso','bbRate','kRate','g','gs','w','l','sv','hld','outs','ip','ha','r','er','hp','era','whip','k9','bb9','war'];
const SURNAME='김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나'.split('');
const GIVEN='민준서지현우도윤태영성호재진수빈건하은승찬시훈동규원석형탁범'.split('');
const F_FIRST=['제이크','라이언','마이클','케빈','타일러','브랜든','카를로스','호세','루이스','다니엘','저스틴','애런'];
const F_LAST=['밀러','존슨','로페즈','가르시아','윌슨','마르티네스','스미스','테일러','브라운','에르난데스','클라크','라미레스'];

const between=(rng,[lo,hi])=>lo+Math.floor(rng()*(hi-lo+1));
const pick=(rng,a)=>a[Math.floor(rng()*a.length)];
// 1단계 초기 POT 공식의 성장 여지(scripts/kbo-2026/roster.mjs)와 같은 값
const growth=age=>age<=20?25:age===21?22:age===22?18:age===23?14:age===24?11:age===25?7:age===26?4:0;

/** 모양 범위에서 능력치를 뽑아 OVR이 목표 범위에 들 때까지 다시 뽑는다. */
function sampleRatings(rng,pitcher,pos,shape,[lo,hi],tweak=r=>r){
  for(let n=0;n<500;n++){
    const ratings=tweak(Object.fromEntries(Object.entries(shape).map(([k,r])=>[k,between(rng,r)])));
    const o=ovr({pitcher,pos,ratings});
    if(o>=lo&&o<=hi)return ratings;
  }
  throw new Error(`능력치 생성 실패: ${pos} OVR ${lo}~${hi}`);
}
function makePlayer(rng,base){
  const p={name:'',group:'second',role:null,faYear:null,lastSeason:null,energy:100,no:'',injury:'',days:0,...Object.fromEntries(RECORD_KEYS.map(k=>[k,0])),...base,[base.pitcher?'throws':'bats']:rng()<.3?'L':'R'};
  p.ovr=ovr(p);
  return p;
}
function makeDepth(rng,roster,teamIndex,n){
  const dom=roster.filter(p=>!p.foreign),pitcher=dom.filter(p=>p.pitcher).length<FILL.domestic/2;
  const count=pos=>dom.filter(p=>!p.pitcher&&p.pos===pos).length;
  const pos=pitcher?'RP':HIT_POS.reduce((a,b)=>count(b)<count(a)?b:a);
  const age=between(rng,FILL.depthAge);
  const ratings=sampleRatings(rng,pitcher,pos,FILL.depthShape[pitcher?'pitcher':'hitter'],FILL.depthOvr);
  const p=makePlayer(rng,{id:`${teamIndex}-g${n}`,name:pick(rng,SURNAME)+pick(rng,GIVEN)+pick(rng,GIVEN),team:teams[teamIndex],teamIndex,pitcher,pos,age,ratings,generated:true});
  p.pot=potCap(p.ovr+growth(age)+between(rng,[-7,7]),p.ovr);
  return p;
}
function makeForeign(rng,teamIndex,{slot,pitcher,ovr:band,usd},n){
  const pos=pitcher?'SP':pick(rng,FILL.foreignPos);
  // 구속이 빠를수록 제구가 약간 낮다
  const tweak=r=>pitcher?{...r,control:Math.max(20,r.control-Math.round((r.velocity-60)*.3))}:r;
  const ratings=sampleRatings(rng,pitcher,pos,FILL.foreignShape[pitcher?'pitcher':'hitter'],band,tweak);
  const dollars=Math.round(usd*(1+(rng()*2-1)*FILL.usdSpread));
  const p=makePlayer(rng,{id:`${teamIndex}-f${n}`,name:`${pick(rng,F_FIRST)} ${pick(rng,F_LAST)}`,team:teams[teamIndex],teamIndex,pitcher,pos,role:pitcher?'SP':'주전',age:between(rng,FILL.foreignAge),ratings,foreign:true,
    contract:{salary:Math.round(dollars*10000*FIN.krwPerUsd),years:1,kind:'foreign',usd:dollars},slot}); // FIN은 순환 import라 모듈 최상위가 아닌 여기서 읽는다
  p.pot=p.ovr;
  return p;
}
/** 1군에 외국인을 넣은 만큼 같은 유형 최저 OVR 국내 선수를 2군으로 내리고, 외국인 선발 수만큼 원래 SP 보직을 RP로 바꿔 로테이션 5명을 유지한다. */
function makeRoom(roster,foreigners){
  for(const f of foreigners){
    if(f.pitcher){
      const sp=roster.filter(p=>!p.foreign&&p.group==='first'&&p.role==='SP').sort((a,b)=>a.ovr-b.ovr)[0];
      if(sp)sp.role='RP';
    }
    const out=roster.filter(p=>!p.foreign&&p.group==='first'&&p.pitcher===f.pitcher).sort((a,b)=>a.ovr-b.ovr)[0];
    if(out){out.group='second';if(out.role==='주전')out.role='벤치';}
  }
}

export function fillTeam(roster,teamIndex,{year=2026,foreignGroup='first'}={}){
  const rng=rngFrom(year*100+teamIndex+1);
  let n=0;
  while(roster.filter(p=>!p.foreign).length<FILL.domestic)roster.push(makeDepth(rng,roster,teamIndex,n++));
  if(!roster.some(p=>p.foreign)){
    const foreigners=FILL.foreignSlots.map((s,k)=>makeForeign(rng,teamIndex,s,k));
    for(const f of foreigners)f.group=foreignGroup;
    if(foreignGroup==='first')makeRoom(roster,foreigners);
    roster.unshift(...foreigners); // teamSetup은 배열 앞의 주전을 먼저 수비 위치에 넣는다
  }
  return roster;
}
export function prepareRoster(roster,teamIndex,opts={}){
  fillTeam(roster,teamIndex,opts);
  for(const p of roster)assignContract(p,opts.year??2026);
  return roster;
}
/** v3·v2 저장을 v4로. AI 편성은 경기마다 다시 계산되므로 외국인을 바로 1군에, 내 팀은 편성을 지키려고 2군에 둔다. */
export function upgradeToV4(state){
  const year=state.season?.year??2026;
  teams.forEach((_,i)=>prepareRoster(i?state.league[i]:state.players,i,{year,foreignGroup:i?'first':'second'}));
  state.finance??=createFinance();
  state.offseason??=null;
  state.version=4;
  return state;
}
