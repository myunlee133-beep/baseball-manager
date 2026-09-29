// scripts/season-smoke.mjs — 시즌 전체 1회. 체력 상수 튜닝 근거를 출력한다.
import {initialState} from '../model.js';
import {ensureSeason,standings,allPlayers,todayGames,playLeagueGame,finishDay} from '../game/league-season.js';
import {teams} from '../model.js';
const s=ensureSeason(initialState()),t0=performance.now();let bullpenDays=0,regulars=[];
while(s.season.phase!=='ended'){
  for(const g of todayGames(s)){playLeagueGame(s,g);}
  finishDay(s);
  const starters=s.players.filter(p=>s.order.includes(p.id));regulars.push(starters.reduce((a,p)=>a+p.energy,0)/starters.length);
}
bullpenDays=allPlayers(s).filter(p=>p.pitcher&&p.pos!=='SP').reduce((a,p)=>a+(p.stats.pitching.starts||0),0);
const sec=((performance.now()-t0)/1000).toFixed(1),finals=s.season.schedule.filter(g=>g.status==='final').length;
console.log(`경기 ${finals}/720 · ${sec}초`);
console.log(`KT 주전 평균 체력: 시즌 평균 ${(regulars.reduce((a,x)=>a+x,0)/regulars.length).toFixed(1)} · 최저 ${Math.min(...regulars).toFixed(1)}`);
console.log(`불펜 투수 선발 등판(불펜 데이) ${bullpenDays}회`);
console.log(standings(s).map((r,i)=>`${i+1}. ${teams[r.team]} ${r.w}-${r.l}-${r.t}`).join('\n'));
if(finals!==720)process.exit(1);
