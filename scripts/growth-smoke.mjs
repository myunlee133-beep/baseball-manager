// scripts/growth-smoke.mjs — 경기 없이 월간 6회 + 오프시즌을 10시즌 돌려 성장 곡선 튜닝 근거를 출력한다.
// 경기를 돌리지 않으므로 내 팀(KT) 1군은 매달 "출전 부족"으로 판정된다. 리그 전체 지표는 AI 369명이 좌우한다.
import {initialState} from '../model.js';
import {ensureSeason,startNextSeason,allPlayers,hooks} from '../game/league-season.js';
import {monthlyGrowth,offseasonGrowth} from '../game/growth.js';

const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const s=ensureSeason(initialState());
let off;hooks.offseasonTick=st=>{off=offseasonGrowth(st);};
const watch=['김도영','최민석','신재인','양의지','최형우'],paths=Object.fromEntries(watch.map(n=>[n,[]]));
const mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
function report(label,events){
  const ps=allPlayers(s),top=[...ps].sort((a,b)=>b.ovr-a.ovr).slice(0,276);
  const band=(lo,hi)=>mean(ps.filter(p=>p.age>=lo&&p.age<=hi).map(p=>p.ovr)).toFixed(1);
  const b=events.filter(e=>e.type==='breakout').length,c=events.length-b;
  console.log(`${label} | 상위276 ${mean(top.map(p=>p.ovr)).toFixed(1)} 하위10% ${top[248].ovr} | ≤22 ${band(0,22)} 23–26 ${band(23,26)} 27–31 ${band(27,31)} 32–35 ${band(32,35)} 36+ ${band(36,99)} | 각성 ${b} 급락 ${c} | POT80 ${ps.filter(p=>p.pot>=80).length} | 평균나이 ${mean(ps.map(p=>p.age)).toFixed(1)}`);
  for(const n of watch){const p=ps.find(x=>x.name===n);if(p)paths[n].push(`${p.age}세 ${p.ovr}/${p.pot}`);}
}
report(`${s.season.year} 개막`,[]);
for(let season=0;season<10;season++){
  const year=s.season.year,events=[];
  for(let m=4;m<=9;m++){s.season.date=`${year}-0${m}-01`;events.push(...monthlyGrowth(s).events);}
  startNextSeason(s);
  events.push(...off.events);
  report(`${year} 종료 후`,events);
}
for(const n of watch)console.log(`${n}: ${paths[n].join(' → ')}`);
