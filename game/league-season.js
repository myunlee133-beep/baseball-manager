// game/league-season.js
/** 시즌 진행: 하루 경기 결과 반영, 순위, 날짜 넘김, 3단계 훅, 박스스코어 저장, 시즌 전환. 상태는 제자리 변경한다. */
import {simulateGame} from './engine.js';
import {buildSchedule,openingDay,addDays} from './league-schedule.js';
import {spendEnergy,recoverDay} from './season-fatigue.js';
import {createLeagueGame} from '../game-bridge.js';
import {teams,teamPlayers,positions} from '../model.js';
import {ensureDev} from './growth.js';

/** 3단계 연결점. 2단계에서는 비어 있다. */
export const hooks={monthlyTick(state){},offseasonTick(state){}};

const blankStats=()=>({batting:{},pitching:{}});
export function createSeason(year){
  return {year,date:openingDay(year),phase:'preseason',schedule:buildSchedule(year),
    standings:Object.fromEntries(teams.map((_,i)=>[i,{w:0,l:0,t:0,rf:0,ra:0,last:[]}])),
    rotationTurn:Object.fromEntries(teams.map((_,i)=>[i,0]).filter(([i])=>i>0)),autoRestMine:true,news:[]};
}
export const allPlayers=state=>teams.flatMap((_,i)=>teamPlayers(state,i));
export function ensureSeason(state){
  state.season??=createSeason(2026);
  state.inbox??=[];
  for(const p of allPlayers(state)){p.energy??=100;p.stats??=blankStats();p.history??={};p.lastPlayed??=null;p.streak??=0;ensureDev(p);}
  if((state.version??0)<5)state.version=5; // v4 이전 저장은 upgradeToV4 가 4로 맞춘 뒤 여기서 성장 필드를 채운다
  return state;
}
export const todayGames=state=>state.season.schedule.filter(g=>g.date===state.season.date);
export const myGame=state=>todayGames(state).find(g=>g.home===0||g.away===0);
export function lineupProblem(state){
  if(state.order.length!==9)return `선발 타자가 ${state.order.length}명입니다. 9명을 채워주세요.`;
  if(!positions.every(p=>state.field[p]))return '비어 있는 수비 위치가 있습니다.';
  if(!state.rotation.length)return '선발 투수가 없습니다.';
  return null;
}

// 박스스코어: 메모리 캐시 + 하루 끝에 flush. 나중에 IndexedDB 로 옮길 때 이 네 함수만 바꾼다.
const boxKey=y=>`dugout-boxes-${y}`,storage=()=>globalThis.localStorage;
let cache={year:null,data:{}};
function boxes(year){if(cache.year!==year){let data={};try{data=JSON.parse(storage()?.getItem(boxKey(year))??'{}')||{};}catch{}cache={year,data};}return cache.data;}
export const loadBox=(year,id)=>boxes(year)[id]??null;
export function saveBox(year,id,box){boxes(year)[id]=box;}
export function flushBoxes(year){storage()?.setItem(boxKey(year),JSON.stringify(boxes(year)));}
export function dropBoxes(year){storage()?.removeItem(boxKey(year));if(cache.year===year)cache={year:null,data:{}};}

const nonzero=lines=>Object.fromEntries(Object.entries(lines).map(([id,l])=>[id,Object.fromEntries(Object.entries(l).filter(([,v])=>v))]));
const addLine=(target,line)=>{for(const [k,v] of Object.entries(line))if(v)target[k]=(target[k]||0)+v;};
const md=iso=>`${Number(iso.slice(5,7))}/${Number(iso.slice(8,10))}`;

export function applyResult(state,g,game,plans){
  const s=state.season,{home,away}=game.score,innings=Math.max(game.lineScore.home.length,game.lineScore.away.length);
  Object.assign(g,{status:'final',score:{home,away},innings,decisions:{win:game.decisions?.win??null,loss:game.decisions?.loss??null,save:game.decisions?.save??null}});
  for(const [team,rf,ra] of [[g.home,home,away],[g.away,away,home]]){
    const r=s.standings[team];r.rf+=rf;r.ra+=ra;
    const res=rf>ra?'W':rf<ra?'L':'T';if(res==='W')r.w++;else if(res==='L')r.l++;else r.t++;
    r.last=[...r.last,res].slice(-5);
  }
  const who=new Map([...teamPlayers(state,g.home),...teamPlayers(state,g.away)].map(p=>[p.id,p]));
  const starters={...plans.home.starters,...plans.away.starters};
  saveBox(s.year,g.id,{lineScore:game.lineScore,hits:game.hits,errors:game.errors,bat:nonzero(game.battingStats),pit:nonzero(game.pitchingStats),pos:starters});
  for(const [id,p] of who){
    const bat=game.battingStats[id],pit=game.pitchingStats[id];
    if(bat)addLine(p.stats.batting,bat);
    if(pit)addLine(p.stats.pitching,pit);
    spendEnergy(p,{bat,pit,startPos:starters[id],innings,date:g.date});
  }
  for(const plan of [plans.home,plans.away]){
    if(plan.team===0)state.strategy.next=state.rotation[plan.nextTurn]??state.rotation[0]??'';
    else s.rotationTurn[plan.team]=plan.nextTurn;
  }
  s.news=[...s.news,`${md(g.date)} ${teams[g.away]} ${away} : ${home} ${teams[g.home]}`].slice(-20);
  s.phase='regular';
}

export function playLeagueGame(state,g,{autoMine=state.season.autoRestMine}={}){
  const {plans,engine}=createLeagueGame(state,g,{autoMine});
  applyResult(state,g,simulateGame(engine),plans);
}

export function finishDay(state){
  const s=state.season;
  recoverDay(allPlayers(state),s.date);
  s.date=addDays(s.date,1);
  if(s.date.endsWith('-01'))hooks.monthlyTick(state);
  if(!s.schedule.some(g=>g.status==='scheduled'))s.phase='ended';
}

export function standings(state){
  const rows=Object.entries(state.season.standings).map(([team,r])=>({team:Number(team),...r,g:r.w+r.l+r.t,pct:r.w/Math.max(1,r.w+r.l)}));
  rows.sort((a,b)=>b.pct-a.pct||(b.rf-b.ra)-(a.rf-a.ra)||a.team-b.team);
  const top=rows[0];
  return rows.map(r=>({...r,gb:((top.w-r.w)+(r.l-top.l))/2}));
}

export function seasonLine(stats=blankStats(),pitcher=false){
  const b=stats.batting||{},q=stats.pitching||{},n=k=>b[k]||0,m=k=>q[k]||0;
  const ab=n('ab'),h=n('h'),hr=n('hr'),d=n('doubles'),t=n('triples'),so=n('so'),bbB=n('bb'),hbp=n('hitByPitch'),sf=n('sacFlies'),pa=n('pa');
  const tb=h+d+2*t+3*hr,obp=(h+bbB+hbp)/Math.max(1,ab+bbB+hbp+sf),slg=tb/Math.max(1,ab),outs=m('outs'),er=m('earnedRuns');
  const per9=v=>outs?v*27/outs:0;
  return {pa,ab,h,doubles:d,triples:t,hr:pitcher?m('homeRunsAllowed'):hr,rbi:n('rbi'),sb:n('stolenBases'),attempts:n('stolenBases')+n('caughtStealing'),
    bb:pitcher?m('walks'):bbB,k:pitcher?m('strikeouts'):so,avg:h/Math.max(1,ab),obp,slg,ops:obp+slg,babip:(h-hr)/Math.max(1,ab-so-hr+sf),iso:slg-h/Math.max(1,ab),
    bbRate:bbB/Math.max(1,pa),kRate:so/Math.max(1,pa),g:pitcher?m('games'):n('games'),gs:m('starts'),w:m('wins'),l:m('losses'),sv:m('saves'),hld:m('holds'),
    outs,ip:Math.floor(outs/3)+(outs%3)/10,ha:m('hitsAllowed'),er,r:m('runsAllowed'),hp:m('hitBatters'),era:per9(er),whip:outs?(m('hitsAllowed')+m('walks'))*3/outs:0,
    k9:per9(m('strikeouts')),bb9:per9(m('walks')),war:null};
}

/** ① 시즌 마감: 올해 성적을 history[연도]로 옮긴다. 나이·일정은 그대로. */
export function closeSeason(state){
  const year=state.season.year;
  for(const p of allPlayers(state)){
    if(Object.keys(p.stats.batting).length||Object.keys(p.stats.pitching).length)p.history[year]=p.stats;
    p.stats=blankStats();
  }
}
/** 노화: 나이 +1, 체력 회복, 3단계 성장·퇴화 훅. 오프시즌 ②와 ③ 사이에서 부른다. */
export function ageLeague(state){
  for(const p of allPlayers(state)){p.age+=1;p.energy=100;p.lastPlayed=null;p.streak=0;}
  hooks.offseasonTick(state);
}
/** 새 시즌 준비: 지난 박스스코어 삭제, 다음 연도 일정·순위. 오프시즌 ⑥ 뒤에 부른다. */
export function prepareNextSeason(state){
  const year=state.season.year;
  dropBoxes(year);
  const autoRestMine=state.season.autoRestMine;
  state.season={...createSeason(year+1),autoRestMine};
  state.strategy.next=state.rotation[0]??'';
}
export function startNextSeason(state){closeSeason(state);ageLeague(state);prepareNextSeason(state);}
