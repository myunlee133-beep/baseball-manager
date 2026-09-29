import { createGame, aiPitch, simulateHalfInning, simulateGame, getCurrentBatter, getCurrentPitcher } from './game/engine.js';
import { seedPlayers, teams, positions } from './model.js';

export const ENGINE_SAVE_KEY='dugout-active-game-v1';
const clamp=(v,min=20,max=80)=>Math.max(min,Math.min(max,Math.round(v)));
const rate=(value,average,spread)=>clamp(50+(value-average)*spread);
const handed=id=>id.split('').reduce((n,c)=>n+c.charCodeAt(0),0)%3===0?'좌':'우';

/**
 * DUGOUT 화면 능력치를 프로야구 10의 20–80 엔진 능력치로 바꾼다.
 * 종합(OVR)은 작은 보정만 주고, 실제 성적 성향이 각 능력의 중심을 결정한다.
 */
export function toEngineHitter(player){
  const pa=Math.max(1,player.pa),ab=Math.max(1,player.ab),bip=Math.max(1,player.ab-player.k-player.hr+player.sacFlies||0);
  const avg=player.h/ab,kRate=player.k/pa,bbRate=player.bb/pa,hrRate=player.hr/pa;
  const ovr=(player.ovr-70)*.18;
  return {
    id:player.id,name:player.name,position:player.pos,bats:handed(player.id),
    contact:clamp((rate(avg,.260,115)+rate(kRate,.20,-80))/2+ovr),
    eye:clamp(rate(bbRate,.09,145)+ovr),
    power:clamp(rate(hrRate,.028,360)+ovr),
    speed:clamp(43+Math.min(20,player.sb*1.2)+ovr),
    defense:clamp(46+(player.ovr-70)*.45+(['C','SS','CF'].includes(player.pos)?4:0)),
    fatigue:clamp(100-player.energy,0,100),
    hidden:{babip:clamp(rate((player.h-player.hr)/bip,.310,90)+ovr)},
  };
}

export function toEnginePitcher(player){
  const ovr=(player.ovr-70)*.18;
  return {
    id:player.id,name:player.name,throws:handed(player.id),role:player.pos==='SP'?'선발':'중계',
    velocity:clamp(48+(player.ovr-70)*.35+(Number(player.id.split('-').at(-1))%7-3)),
    stuff:clamp(rate(player.k9,8.0,3.2)+ovr),
    control:clamp(rate(player.bb9,3.2,-5.2)+ovr),
    stamina:clamp(player.pos==='SP'?48+(player.ovr-60)*.55:30+(player.ovr-60)*.22),
    hold:clamp(48+(player.ovr-70)*.25),pitchCount:0,fatigue:clamp(100-player.energy,0,100),
  };
}

function makeTeam(name,index,players,order,field,starterId,roles={}){
  const raw=new Map(players.map(p=>[p.id,p]));
  const lineup=order.map((id,i)=>{
    const p=toEngineHitter(raw.get(id));
    return {player:p,position:Object.keys(field).find(pos=>field[pos]===id)||positions[i]};
  });
  const activeHitters=players.filter(p=>!p.pitcher&&p.group==='first');
  const activePitchers=players.filter(p=>p.pitcher&&p.group==='first');
  const pitcherIds=new Set(activePitchers.map(p=>p.id));
  const pitchers=activePitchers.map(p=>({...toEnginePitcher(p),role:p.id===starterId?'선발':roles[p.id]?.role==='마무리'?'마무리':p.pos==='SP'?'선발':'중계'}));
  const starter=pitchers.find(p=>p.id===starterId)||pitchers.find(p=>p.role==='선발')||pitchers[0];
  return {id:`dugout-${index}`,name,shortName:name.split(' ')[0],city:name.split(' ')[0],color:'#80e1bc',lineup,
    bench:activeHitters.filter(p=>!order.includes(p.id)).map(toEngineHitter),pitchers,
    minorHitters:players.filter(p=>!p.pitcher&&p.group==='second').map(toEngineHitter),
    minorPitchers:players.filter(p=>p.pitcher&&p.group==='second').map(toEnginePitcher),
    currentPitcherId:starter.id,usedPlayerIds:[],usedPitcherIds:[]};
}

export function createDugoutGame(state,opponentIndex,seed=20330614){
  const opponent=seedPlayers(opponentIndex);
  const order=opponent.filter(p=>!p.pitcher&&p.group==='first').slice(0,9).map(p=>p.id);
  const field=Object.fromEntries(positions.map((pos,i)=>[pos,order[i]]));
  const theirStarter=opponent.find(p=>p.pitcher&&p.group==='first'&&p.pos==='SP')?.id;
  const home=makeTeam(teams[0],0,state.players,state.order,state.field,state.strategy.next||state.rotation[0],state.roles);
  const away=makeTeam(teams[opponentIndex],opponentIndex,opponent,order,field,theirStarter);
  return createGame(home,away,seed);
}

export function advanceDugoutGame(game,mode){
  if(game.status==='final')return game;
  if(mode==='game')return simulateGame(game);
  if(mode==='half')return simulateHalfInning(game);
  return aiPitch(game);
}
export const currentMatchup=game=>({batter:getCurrentBatter(game),pitcher:getCurrentPitcher(game)});
export function saveDugoutGame(game){localStorage.setItem(ENGINE_SAVE_KEY,JSON.stringify(game));}
export function loadDugoutGame(){try{return JSON.parse(localStorage.getItem(ENGINE_SAVE_KEY));}catch{return null;}}
export function clearDugoutGame(){localStorage.removeItem(ENGINE_SAVE_KEY);}

