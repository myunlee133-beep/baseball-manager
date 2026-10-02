// game/contract/foreign.js
/** 외국인 계약(오프시즌 ⑤): 재계약 결정, 매년 18명 시장 풀(스카우팅 ±5), 한 번의 봉인 입찰, 계약 순간 적응 보정. 기록은 state.offseason.foreign. */
import {teams,teamPlayers} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {FIN,canAfford,hash01,money} from './finance.js';
import {FILL,foreignCandidate,makeRoom,rngFrom} from './league-fill.js';
import {removeFromTeam} from './release.js';
import {ovr} from '../player-ratings.js';
import {contenderBonus} from './fa.js';

export const FOREIGN={
  slots:3,maxSame:2,newCapUsd:100,              // 팀당 3명, 같은 유형(투수/타자) 최대 2명, 신규 첫해 100만 달러 상한
  tiers:[{name:'에이스급',band:[74,80],n:2,usd:[90,100]},{name:'1선발·중심타자급',band:[68,74],n:5,usd:[70,95]},{name:'평균',band:[62,68],n:7,usd:[50,75]},{name:'위험',band:[55,62],n:4,usd:[35,55]}],
  pitcherShare:12/18,                           // 풀 18명 중 투수 12명
  strength:{good:{shift:1,label:'풍년'},normal:{shift:0,label:'보통'},thin:{shift:-1,label:'흉년'}}, // 에이스·1선발급 인원 가감
  scout:5,adapt:[-8,4],                        // 표시 ±5, 적응 보정 −8~+4(두 번 뽑아 작은 값이라 음수 쪽으로 치우침)
  reSignRaise:.10,keepOvr:62,                   // 재계약 요구 = 직전 달러 × 1.1, AI는 OVR 62 미만이면 교체
  aiPremium:[1,1.15],
};
const usdToKrw=usd=>Math.round(usd*10000*FIN.krwPerUsd); // 만 달러 → 만 원
const range=(rng,[lo,hi])=>lo+Math.floor(rng()*(hi-lo+1));
const slotProblem=(players,pitcher)=>{
  const f=players.filter(p=>p.foreign);
  if(f.length>=FOREIGN.slots)return `외국인은 팀당 ${FOREIGN.slots}명까지입니다.`;
  if(f.filter(p=>p.pitcher===pitcher).length>=FOREIGN.maxSame)return `외국인 ${pitcher?'투수':'타자'}는 ${FOREIGN.maxSame}명까지입니다.`;
  if(players.length>=FILL.max)return `로스터 ${FILL.max}명이 찼습니다.`;
  return null;
};
/** 스카우팅 값: 실제 능력치에서 선수별로 고정된 ±5 오차. 화면에는 이 값 ±5 범위를 보여 준다. */
const scoutRatings=(p,year)=>Object.fromEntries(Object.entries(p.ratings).map(([k,v])=>[k,Math.max(20,Math.min(80,v+Math.round((hash01(`${year}:${p.id}:${k}:scout`)*2-1)*FOREIGN.scout)))]));
export function scoutOvrRange(c){
  const shift=d=>ovr({...c.player,ratings:Object.fromEntries(Object.entries(c.scout).map(([k,v])=>[k,Math.max(20,Math.min(80,v+d))]))});
  return [shift(-FOREIGN.scout),shift(FOREIGN.scout)];
}
/** 해마다 풀 강도: 풍년(+1)·보통·흉년(−1). */
export const poolStrength=year=>{const h=hash01(`${year}:foreign:strength`);return h<.25?'thin':h>.75?'good':'normal';};
export function buildPool(year){
  const rng=rngFrom(year*7919+17),st=FOREIGN.strength[poolStrength(year)],pool=[];
  const counts=FOREIGN.tiers.map((t,k)=>k<2?Math.max(1,t.n+st.shift):k===2?t.n-2*st.shift:t.n);
  const total=counts.reduce((a,b)=>a+b,0),pitchers=Math.round(total*FOREIGN.pitcherShare);
  let n=0;
  FOREIGN.tiers.forEach((t,k)=>{for(let i=0;i<counts[k];i++){
    const pitcher=hash01(`${year}:fx${n}:p`)<pitchers/total;
    const p=foreignCandidate(rng,{pitcher,band:t.band,id:`fx${year}-${n}`});
    pool.push({id:p.id,tier:t.name,ask:Math.min(FOREIGN.newCapUsd,range(rng,t.usd)),player:p});n++;
  }});
  for(const c of pool)c.scout=scoutRatings(c.player,year);
  return pool;
}
/** ④→⑤: 기존 외국인 재계약 대상 정리, 시장 풀 생성, AI 재계약 결정. */
export function beginForeign(state){
  const o=state.offseason,year=o.year;
  const resign={};
  for(const p of state.players.filter(p=>p.foreign))resign[p.id]={ask:Math.round((p.contract?.usd??100)*(1+FOREIGN.reSignRaise)),decision:null};
  for(let team=1;team<teams.length;team++)for(const p of teamPlayers(state,team).filter(p=>p.foreign)){
    const usd=Math.round((p.contract?.usd??100)*(1+FOREIGN.reSignRaise));
    if(p.ovr>=FOREIGN.keepOvr&&canAfford(state,team,{salary:usdToKrw(usd),foreign:true,replacing:p.contract?.salary??0}).ok){p.contract={salary:usdToKrw(usd),years:1,kind:'foreign',usd};continue;}
    removeFromTeam(state,team,p.id);o.log.push(`${teams[team]} 외국인 ${p.name} 재계약 포기(${p.ovr<FOREIGN.keepOvr?`OVR ${p.ovr}`:'예산 부족'})`);
  }
  const pool=buildPool(year);
  o.foreign={resign,pool,mine:{},closed:false,log:[]};
  o.log.push(`외국인 시장 개장 · ${pool.length}명 (${FOREIGN.strength[poolStrength(year)].label})`);
}
/** 내 외국인 재계약(요구 달러) 또는 방출. */
export function decideForeign(state,id,decision){
  const o=state.offseason,f=o?.foreign,r=f?.resign[id],p=state.players.find(x=>x.id===id);
  if(!o||o.step!=='foreign'||!r||!p)return {ok:false,reason:'재계약 대상이 아닙니다.'};
  if(decision==='keep'){
    const check=canAfford(state,0,{salary:usdToKrw(r.ask),foreign:true,replacing:p.contract?.salary??0});
    if(!check.ok)return check;
    p.contract={salary:usdToKrw(r.ask),years:1,kind:'foreign',usd:r.ask};r.decision='keep';
    o.log.push(`외국인 ${p.name} 재계약 ${r.ask}만 달러`);
  }else if(decision==='release'){
    removeFromTeam(state,0,id);r.decision='release';
    o.log.push(`외국인 ${p.name} 재계약 포기`);
  }else return {ok:false,reason:'알 수 없는 결정입니다.'};
  return {ok:true,reason:''};
}
/** 시장 후보에게 내 제시(만 달러, 신규 100만 달러 이하). 마감 전까지 덮어쓸 수 있다. */
export function offerForeign(state,id,usd){
  const o=state.offseason,f=o?.foreign;
  if(!o||o.step!=='foreign'||!f||f.closed)return {ok:false,reason:'외국인 시장이 열려 있지 않습니다.'};
  const c=f.pool.find(x=>x.id===id&&x.signedBy===undefined);
  if(!c)return {ok:false,reason:'계약 가능한 후보가 아닙니다.'};
  if(!Number.isFinite(usd)||usd<1)return {ok:false,reason:'금액(만 달러)을 입력해 주세요.'};
  usd=Math.round(usd);
  if(usd>FOREIGN.newCapUsd)return {ok:false,reason:`신규 외국인 첫해 상한은 ${FOREIGN.newCapUsd}만 달러입니다.`};
  const pending=state.players.filter(p=>p.foreign&&f.resign[p.id]?.decision!=='release');
  const offers=Object.keys(f.mine).filter(k=>k!==id).map(k=>f.pool.find(x=>x.id===k)?.player).filter(Boolean);
  const slot=slotProblem([...state.players.filter(p=>!p.foreign),...pending,...offers],c.player.pitcher);
  if(slot)return {ok:false,reason:slot};
  const check=canAfford(state,0,{salary:usdToKrw(usd)+offers.reduce((a,p)=>a+usdToKrw(f.mine[p.id]),0),foreign:true});
  if(!check.ok)return check;
  f.mine[id]=usd;
  return {ok:true,reason:''};
}
export function cancelForeignOffer(state,id){const f=state.offseason?.foreign;if(!f||f.closed||!(id in f.mine))return false;delete f.mine[id];return true;}
/** 실제 능력치 확정: 선수 공통 적응 보정(−8~+4, 음수 쪽으로 치우침). */
export function adaptation(year,id){
  const [lo,hi]=FOREIGN.adapt,draw=k=>lo+Math.floor(hash01(`${year}:${id}:adapt${k}`)*(hi-lo+1));
  return Math.min(draw(0),draw(1)); // 두 번 뽑아 작은 값: 적응 실패가 성공보다 흔하다
}
function sign(state,team,c,usd){
  const o=state.offseason,p=c.player,a=adaptation(o.year,c.id);
  p.ratings=Object.fromEntries(Object.entries(p.ratings).map(([k,v])=>[k,Math.max(20,Math.min(80,v+a))]));
  p.ovr=ovr(p);p.pot=p.ovr;
  Object.assign(p,{team:teams[team],teamIndex:team,contract:{salary:usdToKrw(usd),years:1,kind:'foreign',usd},adapt:a});
  Object.assign(p,{stats:{batting:{},pitching:{}},history:{},energy:100,lastPlayed:null,streak:0}); // 시즌 진행이 기대하는 필드
  if(team===0)p.group='second';
  else{p.group='first';makeRoom(state.league[team],[p]);}
  (team?state.league[team]:state.players).push(p);
  c.signedBy=team;c.usd=usd;
  const line=`${p.name}(${c.tier}) → ${teams[team]} ${usd}만 달러 · 적응 ${a>0?'+':''}${a} · OVR ${p.ovr}`;
  o.log.push(`외국인 계약 ${line}`);o.foreign.log.push(line);
}
/** 시장 마감: AI 빈 자리마다 입찰, 후보는 가장 높은 달러(동률은 지난 시즌 순위)를 받는다. */
export function closeForeign(state){
  const o=state.offseason,f=o?.foreign;
  if(!o||o.step!=='foreign'||!f||f.closed)return false;
  for(const p of state.players.filter(p=>p.foreign&&!f.resign[p.id]?.decision))decideForeign(state,p.id,'keep').ok||decideForeign(state,p.id,'release');
  // 여러 번 돈다: 매 회차 AI는 빈 자리마다 남은 후보 중 최고 OVR에 입찰하고, 진 팀은 다음 회차에 다음 후보를 노린다. 내 제시는 첫 회차에만.
  const open=()=>f.pool.filter(c=>c.signedBy===undefined);
  for(let pass=0;pass<8;pass++){
    const bids=new Map(open().map(c=>[c.id,[]]));
    if(pass===0)for(const [id,usd] of Object.entries(f.mine))bids.get(id)?.push({team:0,usd});
    for(let team=1;team<teams.length;team++){
      const fx=teamPlayers(state,team).filter(p=>p.foreign),taken=[];
      for(let k=fx.length;k<FOREIGN.slots;k++){
        const pitchers=fx.filter(p=>p.pitcher).length+taken.filter(c=>c.player.pitcher).length,hitters=fx.length+taken.length-pitchers;
        const ok=c=>!taken.includes(c)&&(c.player.pitcher?pitchers<FOREIGN.maxSame:hitters<FOREIGN.maxSame)&&(c.player.pitcher||pitchers>=FOREIGN.maxSame||hitters<1);
        const c=open().filter(ok).sort((a,b)=>b.player.ovr-a.player.ovr)[0];
        if(!c)break;
        taken.push(c);
        bids.get(c.id).push({team,usd:Math.min(FOREIGN.newCapUsd,Math.round(c.ask*(FOREIGN.aiPremium[0]+(FOREIGN.aiPremium[1]-FOREIGN.aiPremium[0])*hash01(`${o.year}:${team}:${c.id}:fx`))))});
      }
    }
    let signed=0;
    for(const c of [...open()].sort((a,b)=>b.player.ovr-a.player.ovr)){
      const valid=(bids.get(c.id)??[]).filter(b=>b.usd>=c.ask*.9&&!slotProblem(teamPlayers(state,b.team),c.player.pitcher)&&canAfford(state,b.team,{salary:usdToKrw(b.usd),foreign:true}).ok)
        .sort((x,y)=>y.usd-x.usd||contenderBonus(o,y.team)-contenderBonus(o,x.team)||x.team-y.team);
      if(valid[0]){sign(state,valid[0].team,c,valid[0].usd);signed++;}
    }
    if(!signed&&pass>0)break;
  }
  f.closed=true;
  const n=f.pool.filter(c=>c.signedBy!==undefined).length;
  o.log.push(`외국인 시장 마감 · 계약 ${n}명`);
  return true;
}
