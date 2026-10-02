// game/contract/draft.js
/** 신인 드래프트(9월 둘째 주 월요일). 약 100명 풀, 7라운드, 잠재력은 저점~고점 범위로만 보인다. 지명자는 오프시즌 ⑥에서 합류한다.
 *  기록은 state.draft = {year, order, pool, picks, done}. 상태는 제자리 변경한다. */
import {teams} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {hooks,standings} from '../league-season.js';
import {FIN,hash01} from './finance.js';
import {rngFrom,sampleRatings,makePlayer,between,pick,SURNAME,GIVEN} from './league-fill.js';
import {potCap} from '../player-ratings.js';

export const DRAFT={
  rounds:7,
  // [이름, 인원, 현재 OVR, 잠재력 중심]
  tiers:[['즉시전력',2,[45,52],[60,72]],['상위 유망주',9,[30,42],[58,70]],['중위 유망주',28,[28,40],[48,60]],['뎁스',61,[25,38],[38,52]]],
  strength:{good:{shift:1,label:'풍년'},normal:{shift:0,label:'보통'},thin:{shift:-1,label:'흉년'}}, // 즉시전력 ±1, 상위 유망주 ±3
  width:{floor:3,balance:8,ceiling:17},               // 잠재력 범위 반폭
  typeShare:{hs:{ceiling:.5,balance:.4},college:{floor:.5,balance:.4}}, // 나머지는 반대 성향
  hsShare:.6,age:{hs:18,college:22},collegeBonus:3,   // 대졸은 현재 능력 +3
  salary:3000,                                        // 신인 계약 3,000만, 1년
  shape:{hitter:{contact:[20,60],eye:[20,60],power:[20,60],speed:[25,65],defense:[25,65]},pitcher:{velocity:[25,62],stuff:[20,60],control:[20,60],stamina:[25,65]}},
};
const HIT_POS=['C','1B','2B','3B','SS','LF','CF','RF'];
/** 9월 둘째 주 월요일. */
export function draftDate(year){
  const d=new Date(Date.UTC(year,8,1));
  const firstMon=1+((8-d.getUTCDay())%7);
  return `${year}-09-${String(firstMon+7).padStart(2,'0')}`;
}
export const draftStrength=year=>{const h=hash01(`${year}:draft:strength`);return h<.25?'thin':h>.75?'good':'normal';};
const typeOf=(entry,u)=>{const t=DRAFT.typeShare[entry],k=Object.keys(t);return u<t[k[0]]?k[0]:u<t[k[0]]+t[k[1]]?k[1]:entry==='hs'?'floor':'ceiling';};

export function buildDraftPool(year){
  const rng=rngFrom(year*104729+3),st=DRAFT.strength[draftStrength(year)],pool=[];
  const counts=DRAFT.tiers.map(([,n],k)=>k===0?Math.max(0,n+st.shift):k===1?n+3*st.shift:k===3?n-4*st.shift:n);
  let id=0;
  DRAFT.tiers.forEach(([tier,,cur,center],k)=>{for(let i=0;i<counts[k];i++){
    const entry=rng()<DRAFT.hsShare?'hs':'college',type=typeOf(entry,rng()),pitcher=rng()<.5;
    const pos=pitcher?'RP':pick(rng,HIT_POS),band=[cur[0]+(entry==='college'?DRAFT.collegeBonus:0),cur[1]+(entry==='college'?DRAFT.collegeBonus:0)];
    const ratings=sampleRatings(rng,pitcher,pos,DRAFT.shape[pitcher?'pitcher':'hitter'],band);
    const p=makePlayer(rng,{id:`d${year}-${id++}`,name:pick(rng,SURNAME)+pick(rng,GIVEN)+pick(rng,GIVEN),team:'',teamIndex:null,pitcher,pos,age:DRAFT.age[entry],ratings,entry,rookie:true});
    const c=between(rng,center),w=DRAFT.width[type];
    const lo=Math.max(p.ovr,c-w),hi=Math.min(80,Math.max(lo+1,c+w));
    p.pot=potCap(Math.round(lo+(hi-lo)*(rng()+rng())/2),p.ovr); // 범위 안에서 가운데가 두꺼운 분포
    pool.push({id:p.id,tier,type,entry,potRange:[lo,hi],player:p});
  }});
  return pool;
}
/** 지명 순서: 직전 시즌 최종 순위 역순(없으면 당일 순위 역순), 라운드마다 같은 순서. */
export const draftOrder=state=>[...(state.prevFinalOrder??standings(state).map(r=>r.team))].reverse();
export const draftPending=state=>!!state.draft&&!state.draft.done&&state.draft.year===state.season.year;
/** 드래프트 날이 되면 연다(hooks.dayTick). force는 시즌이 드래프트 날 전에 끝났을 때 오프시즌 시작에서 쓴다. */
export function maybeOpenDraft(state,{force=false}={}){
  const s=state.season;
  if(state.draft?.year===s.year)return false;
  if(!force&&(s.phase==='ended'||s.date<draftDate(s.year)))return false;
  const pool=buildDraftPool(s.year);
  state.draft={year:s.year,order:draftOrder(state),pool,picks:[],done:false};
  s.news=[...s.news,`${s.year} 신인 드래프트 개최 · 후보 ${pool.length}명(${DRAFT.strength[draftStrength(s.year)].label})`].slice(-20);
  return true;
}
hooks.dayTick=maybeOpenDraft;
export const onClock=d=>d.picks.length<DRAFT.rounds*d.order.length?d.order[d.picks.length%d.order.length]:null;
const aiValue=e=>e.player.ovr+(e.potRange[0]+e.potRange[1])/2;
function take(d,team,e){d.picks.push({round:Math.floor(d.picks.length/d.order.length)+1,team,id:e.id});e.pickedBy=team;}
export function pickProspect(state,id){
  const d=state.draft;
  if(!draftPending(state))return {ok:false,reason:'드래프트가 열려 있지 않습니다.'};
  if(onClock(d)!==0)return {ok:false,reason:'내 지명 차례가 아닙니다.'};
  const e=d.pool.find(x=>x.id===id&&x.pickedBy===undefined);
  if(!e)return {ok:false,reason:'지명할 수 없는 선수입니다.'};
  take(d,0,e);
  return {ok:true,reason:''};
}
/** AI 차례를 진행한다. untilMine이면 내 차례에서 멈추고, 아니면 내 차례도 AI 규칙으로 지명한다. */
export function autoPick(state,{untilMine=true}={}){
  const d=state.draft;let n=0;
  while(draftPending(state)){
    const team=onClock(d);
    if(team===null){d.done=true;break;}
    if(team===0&&untilMine)break;
    const e=d.pool.filter(x=>x.pickedBy===undefined).sort((a,b)=>aiValue(b)-aiValue(a)||(a.id<b.id?-1:1))[0];
    if(!e){d.done=true;break;}
    take(d,team,e);n++;
  }
  if(d&&onClock(d)===null)d.done=true;
  return n;
}
/** 오프시즌 ⑥ 진입: 지명자를 각 팀 2군으로(신인 계약 3,000만 1년, FA까지 고졸 8·대졸 7시즌). */
export function joinDraftees(state){
  const d=state.draft;
  if(!d||d.joined)return 0;
  if(!d.done)autoPick(state,{untilMine:false});
  for(const pk of d.picks){
    const e=d.pool.find(x=>x.id===pk.id),p=e.player;
    Object.assign(p,{team:teams[pk.team],teamIndex:pk.team,group:'second',role:null,contract:{salary:DRAFT.salary,years:1,kind:'rookie'},faYear:d.year+FIN.faSeasons[e.entry],
      stats:{batting:{},pitching:{}},history:{},energy:100,lastPlayed:null,streak:0});
    delete p.rookie;
    (pk.team?state.league[pk.team]:state.players).push(p);
  }
  d.joined=true;
  return d.picks.length;
}
