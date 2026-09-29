// game/season-runner.js
/** 여러 날 진행. 경기마다 브라우저에 양보해 진행률·중단이 동작하고, 하루가 끝날 때마다 저장한다. */
import {addDays} from './league-schedule.js';
import {todayGames,myGame,lineupProblem,playLeagueGame,finishDay,flushBoxes} from './league-season.js';

export function targetDate(state,unit){
  const {date,schedule}=state.season;
  if(unit==='week')return addDays(date,6);
  if(unit==='month'){const [y,m]=date.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
  if(unit==='season')return schedule.at(-1).date;
  return date;
}

export async function advance(state,until,{onProgress=()=>{},shouldStop=()=>false,save=()=>{},pause=()=>new Promise(r=>setTimeout(r,0))}={}){
  const s=state.season,total=s.schedule.filter(g=>g.status==='scheduled'&&g.date<=until).length;
  let done=0;
  while(s.phase!=='ended'&&s.date<=until){
    if(myGame(state)?.status==='scheduled'){const blocked=lineupProblem(state);if(blocked)return {done,total,blocked};}
    for(const g of todayGames(state)){
      if(g.status!=='scheduled')continue;
      playLeagueGame(state,g);
      onProgress({done:++done,total,date:s.date});
      await pause();
    }
    finishDay(state);
    flushBoxes(s.year);
    save(state);
    if(shouldStop())return {done,total,stopped:true};
  }
  return {done,total};
}
