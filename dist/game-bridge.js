import { createGame, aiPitch, simulateHalfInning, simulateGame, getCurrentBatter, getCurrentPitcher } from './game/engine.js';
import { teams, positions, teamPlayers, teamSetup } from './model.js';

export const ENGINE_SAVE_KEY='dugout-active-game-v1';
const clamp=(v,min=20,max=80)=>Math.max(min,Math.min(max,Math.round(v)));
const handed=id=>id.split('').reduce((n,c)=>n+c.charCodeAt(0),0)%3===0?'좌':'우';
// 엔진은 좌/우만 받는다. 스위치히터는 좌타로 넣고, 모르는 선수는 id 해시로 고정 배정한다.
const hand=(h,id)=>h==='R'?'우':h==='L'||h==='S'?'좌':handed(id);

/** 저장된 20–80 능력치를 그대로 프로야구 10 엔진 입력으로 넘긴다. 히든 스탯은 엔진이 id 로 만든다. */
export function toEngineHitter(player){
  const r=player.ratings;
  return {
    id:player.id,name:player.name,position:player.pos,bats:hand(player.bats,player.id),
    contact:r.contact,eye:r.eye,power:r.power,speed:r.speed,defense:r.defense,
    fatigue:clamp(100-player.energy,0,100),
  };
}

export function toEnginePitcher(player){
  const r=player.ratings;
  return {
    id:player.id,name:player.name,throws:hand(player.throws,player.id),role:player.pos==='SP'?'선발':'중계',
    velocity:r.velocity,stuff:r.stuff,control:r.control,stamina:r.stamina,
    hold:clamp(48+(r.control-50)*.25),pitchCount:0,fatigue:clamp(100-player.energy,0,100),
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
  const opponent=teamPlayers(state,opponentIndex),their=teamSetup(opponent);
  const home=makeTeam(teams[0],0,state.players,state.order,state.field,state.strategy.next||state.rotation[0],state.roles);
  const away=makeTeam(teams[opponentIndex],opponentIndex,opponent,their.order,their.field,their.rotation[0],their.roles);
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

