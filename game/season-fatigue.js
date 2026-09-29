// game/season-fatigue.js
/** 시즌 체력 모델. 수치는 전부 FATIGUE 에 있다 — 시즌 스모크(npm run test:season) 결과로 조정한다. */
import {assignPositions} from './fielding.js';
import {addDays} from './league-schedule.js';

export const FATIGUE={
  start:{default:10,C:15,DH:5},extraInning:1,sub:4,
  starterPerPitch:0.6,relieverPerPitch:1.0,backToBack:10,threeDays:20,
  recover:{hitter:6,pitcher:10},idle:{hitter:1.5,pitcher:1.0},old:{age:33,rate:0.8},young:{age:25,rate:1.1},
  penaltyFrom:70,penaltyRate:0.3,
  rest:{hitter:45,catcher:55,starter:70,reliever:30},
};
const DROPS=['contact','power','speed','defense','velocity','stuff','control'];

export function spendEnergy(p,{bat,pit,startPos,innings=9,date}){
  let cost=0;
  if(p.pitcher){
    if(!pit)return;
    p.streak=(p.lastPlayed===addDays(date,-1)?p.streak||0:0)+1;
    cost=pit.starts?pit.pitches*FATIGUE.starterPerPitch
      :pit.pitches*FATIGUE.relieverPerPitch+(p.streak>=3?FATIGUE.threeDays:p.streak===2?FATIGUE.backToBack:0);
  }else if(startPos){
    cost=(FATIGUE.start[startPos]??FATIGUE.start.default)+Math.max(0,innings-9)*FATIGUE.extraInning;
  }else if(bat)cost=FATIGUE.sub;
  else return;
  p.energy=Math.max(0,Math.round(p.energy-cost));
  p.lastPlayed=date;
}

export function recoverDay(players,date){
  for(const p of players){
    if(p.energy>=100)continue;
    const kind=p.pitcher?'pitcher':'hitter';
    const age=p.age>=FATIGUE.old.age?FATIGUE.old.rate:p.age<=FATIGUE.young.age?FATIGUE.young.rate:1;
    const gain=FATIGUE.recover[kind]*(p.lastPlayed===date?1:FATIGUE.idle[kind])*age;
    p.energy=Math.min(100,Math.round(p.energy+gain));
  }
}

export function energyPenalty(ratings,energy){
  const d=Math.max(0,FATIGUE.penaltyFrom-energy)*FATIGUE.penaltyRate;
  return Object.fromEntries(Object.entries(ratings).map(([k,v])=>[k,DROPS.includes(k)?Math.max(5,Math.round(v-d)):v]));
}

/** 경기 전 기용: 지친 야수 휴식, 선발 선택(불펜 데이 포함), 등판 불가 불펜. auto=false 면 편성 그대로. */
export function restPlan(base,players,{auto,turn=0}){
  const byId=new Map(players.map(p=>[p.id,p])),rotation=base.rotation,bullpen=base.bullpen,k=Math.max(1,rotation.length);
  let order=[...base.order],field={...base.field},starterId=rotation[turn%k]??bullpen[0],nextTurn=(turn+1)%k;
  const unavailable=new Set();
  if(!auto)return {order,field,starterId,nextTurn,unavailable};
  const posOf=id=>Object.keys(field).find(pos=>field[pos]===id);
  for(const id of [...order]){
    const tired=byId.get(id),limit=posOf(id)==='C'?FATIGUE.rest.catcher:FATIGUE.rest.hitter;
    if(!tired||tired.energy>=limit)continue;
    const bench=players.filter(p=>!p.pitcher&&p.group==='first'&&!order.includes(p.id)&&p.energy>tired.energy).sort((a,b)=>b.energy-a.energy);
    for(const sub of bench){
      const next=order.map(x=>x===id?sub.id:x);
      const preferred=Object.fromEntries(next.map(x=>[x,posOf(x===sub.id?id:x)]));
      const spots=assignPositions(next.map(x=>{const q=byId.get(x);return {id:x,position:q.pos,defense:q.ratings.defense};}),preferred);
      if(!spots)continue;
      order=next;field=Object.fromEntries(spots.map((pos,i)=>[pos,next[i]]));break;
    }
  }
  const pick=[...Array(rotation.length).keys()].map(j=>(turn+j)%rotation.length).find(j=>byId.get(rotation[j])?.energy>=FATIGUE.rest.starter);
  if(pick!==undefined){starterId=rotation[pick];nextTurn=(pick+1)%k;}
  else starterId=[...bullpen].sort((a,b)=>byId.get(b).energy-byId.get(a).energy)[0]??starterId;
  for(const id of bullpen)if(id!==starterId&&byId.get(id).energy<FATIGUE.rest.reliever)unavailable.add(id);
  if(bullpen.every(id=>id===starterId||unavailable.has(id)))unavailable.clear();
  return {order,field,starterId,nextTurn,unavailable};
}
