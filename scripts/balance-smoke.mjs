// scripts/balance-smoke.mjs — 계약 시스템 전체(은퇴·연봉·FA·외국인·드래프트)를 거쳐 여러 시즌을 돌리고 밸런스 지표를 출력한다.
// node scripts/balance-smoke.mjs [시즌 수=10] [경기 돌릴 시즌 수=0]
//   경기 없는 시즌은 월간 성장만 6회 돌리고 바로 오프시즌(성적·순위가 없어 연봉은 OVR 가치만, 순위 수입은 팀 번호 순).
//   경기 시즌은 리그 전 경기를 엔진으로 돌린다(시즌당 약 1분). 내 팀(KT)은 AI처럼 자동 처리한다.
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason,allPlayers,seasonLine,standings} from '../game/league-season.js';
import {monthlyGrowth} from '../game/growth.js';
import {advance} from '../game/season-runner.js';
import {beginOffseason,nextStep} from '../game/contract/offseason.js';
import {runFaRound} from '../game/contract/fa.js';
import {closeForeign} from '../game/contract/foreign.js';
import {autoPick,draftPending,maybeOpenDraft} from '../game/contract/draft.js';
import {releasePlayer} from '../game/contract/release.js';
import {domesticPayroll,teamFinance,money,FIN,fairSalary} from '../game/contract/finance.js';

const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const SEASONS=Number(process.argv[2]??10),GAME_SEASONS=Number(process.argv[3]??0);
const s=ensureSeason(initialState());
if(process.env.NOFX){ // 비교용: 외국인 없이(개막 편성은 다시 짠다)
  const {teamSetup}=await import('../model.js');
  for(let i=0;i<teams.length;i++){const r=teamPlayers(s,i).filter(p=>!p.foreign);for(const p of r)if(p.group==='second'&&p.role)p.group='first';if(i)s.league[i]=r;else{s.players=r;Object.assign(s,teamSetup(r));}}
}
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0,f1=v=>v.toFixed(1),f3=v=>v.toFixed(3).replace(/^0/,'');
const cohorts={}; // 드래프트 연도 → 지명자 id

async function playSeason(withGames){
  const year=s.season.year;
  if(withGames){
    for(;;){
      const r=await advance(s,s.season.schedule.at(-1).date,{pause:async()=>{}});
      if(r.stopped==='draft'){autoPick(s,{untilMine:false});continue;}
      if(r.blocked)throw new Error(r.blocked);
      if(s.season.phase==='ended')break;
    }
  }else{
    for(let m=4;m<=9;m++){s.season.date=`${year}-0${m}-01`;monthlyGrowth(s);}
    s.season.date=`${year}-09-20`;maybeOpenDraft(s);autoPick(s,{untilMine:false});
    s.season.phase='ended';
  }
}
function battingPitching(){
  const ps=allPlayers(s),line=p=>seasonLine(p.stats,p.pitcher); // 오프시즌 전이라 올해 성적은 stats에 있다
  const sp=ps.filter(p=>p.pitcher).map(p=>[p,line(p)]).filter(([,l])=>l.outs>=90);
  const bat=ps.filter(p=>!p.pitcher).map(p=>[p,line(p)]).filter(([,l])=>l.pa>=200);
  const era=list=>{const o=list.reduce((a,[,l])=>a+l.outs,0),er=list.reduce((a,[,l])=>a+l.er,0);return o?er*27/o:0;};
  const ops=list=>mean(list.map(([,l])=>l.ops));
  const fx=a=>a.filter(([p])=>p.foreign),dom=a=>a.filter(([p])=>!p.foreign);
  const topEra=[...sp].filter(([,l])=>l.outs>=300).sort((a,b)=>a[1].era-b[1].era).slice(0,10);
  return `ERA 리그 ${era(sp).toFixed(2)}(외국인 ${era(fx(sp)).toFixed(2)} / 국내 ${era(dom(sp)).toFixed(2)}) · OPS 리그 ${f3(ops(bat))}(외국인 ${f3(ops(fx(bat)))} / 국내 ${f3(ops(dom(bat)))}) · 평균자책 상위10 중 외국인 ${topEra.filter(([p])=>p.foreign).length}명`;
}
function report(year,log){
  const ps=allPlayers(s),dom=ps.filter(p=>!p.foreign),top=[...ps].sort((a,b)=>b.ovr-a.ovr);
  const firsts=teams.flatMap((_,i)=>teamPlayers(s,i).filter(p=>p.group==='first'));
  const fx=ps.filter(p=>p.foreign),pay=teams.map((_,i)=>domesticPayroll(teamPlayers(s,i)));
  const budgetRoom=teams.map((_,i)=>teamFinance(s,i).budgetRoom),sizes=teams.map((_,i)=>teamPlayers(s,i).length);
  const n=(re)=>log.filter(l=>re.test(l)).length;
  const retire=(log.find(l=>/^은퇴 \d+명/.test(l))??'').match(/은퇴 (\d+)명/)?.[1]??0;
  const faOpen=(log.find(l=>/FA 시장 개장/.test(l))??'').match(/(\d+)명/)?.[1]??0;
  const faMoved=log.filter(l=>/^FA 계약/.test(l)).length;
  const cohort=Object.entries(cohorts).map(([y,ids])=>{const c=ps.filter(p=>ids.includes(p.id));return `${y}:${c.length}명 OVR ${f1(mean(c.map(p=>p.ovr)))} (55+ ${c.filter(p=>p.ovr>=55).length})`;}).join(' | ');
  console.log(`\n== ${year} 오프시즌 뒤 (${year+1} 개막 전) ==`);
  console.log(`선수 ${ps.length}명 · 상위276 OVR ${f1(mean(top.slice(0,276).map(p=>p.ovr)))} · 평균 나이 ${f1(mean(ps.map(p=>p.age)))} · 40세+ ${ps.filter(p=>p.age>=40).length} · 1군 OVR ${f1(mean(firsts.map(p=>p.ovr)))} · 상위 10명 OVR ${f1(mean(top.slice(0,10).map(p=>p.ovr)))} · OVR 70+ ${ps.filter(p=>p.ovr>=70).length} · POT 80 ${ps.filter(p=>p.pot>=80).length}`);
  console.log(`외국인 ${fx.length}명 OVR ${f1(mean(fx.map(p=>p.ovr)))} · 상위 30명 중 외국인 ${top.slice(0,30).filter(p=>p.foreign).length}명 · 국내 상위 10명 OVR ${f1(mean(dom.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,10).map(p=>p.ovr)))}`);
  const fair=teams.map((_,i)=>teamPlayers(s,i).filter(p=>!p.foreign).reduce((x,p)=>x+fairSalary(p),0)),kinds={};for(const p of dom)kinds[p.contract?.kind]=(kinds[p.contract?.kind]??0)+p.contract.salary;
  console.log(`적정 연봉 합 평균 ${money(mean(fair))} · 계약 종류별 연봉 합(리그) ${Object.entries(kinds).map(([k,v])=>`${k} ${money(v)}`).join(' / ')}`);
  console.log(`국내 총연봉 최소 ${money(Math.min(...pay))} 평균 ${money(mean(pay))} 최대 ${money(Math.max(...pay))} (캡 ${money(FIN.cap)}, 90%+ ${pay.filter(v=>v>=FIN.cap*.9).length}팀) · 예산 여유 최소 ${money(Math.min(...budgetRoom))} · 로스터 ${Math.min(...sizes)}~${Math.max(...sizes)}명`);
  console.log(`은퇴 ${retire} · FA 자격 ${faOpen}명 중 계약 ${faMoved} · AI 방출 ${n(/AI 구단 방출|방출\(캡 초과\)/)}건 · 외국인 재계약 포기 ${n(/외국인 .* 재계약 포기/)}명 · 미계약 은퇴 ${(log.find(l=>/미계약 자유계약 선수/.test(l))??'').match(/(\d+)명/)?.[1]??0}`);
  if(cohort)console.log(`드래프트 코호트: ${cohort}`);
}

const t0=Date.now();
for(let k=0;k<SEASONS;k++){
  const year=s.season.year,withGames=k<GAME_SEASONS;
  await playSeason(withGames);
  if(s.draft?.year===year)cohorts[year]=s.draft.picks.map(p=>p.id);
  if(withGames){const st=standings(s);console.log(`\n## ${year} 정규시즌: 1위 ${teams[st[0].team]} ${st[0].w}-${st[0].l} · 10위 ${teams[st[9].team]} ${st[9].w}-${st[9].l}`);console.log(battingPitching());}
  beginOffseason(s);
  const log=s.offseason.log;
  while(s.offseason){
    const step=s.offseason.step;
    if(step==='fa')for(let i=0;i<3;i++)runFaRound(s);
    if(step==='foreign')closeForeign(s);
    if(step==='roster')while(s.players.length>55)releasePlayer(s,[...s.players].filter(p=>!p.foreign).sort((a,b)=>a.ovr-b.ovr)[0].id);
    const before=s.offseason;
    if(!nextStep(s)){console.log('막힘:',step,s.offseason?.step);break;}
    if(!s.offseason)report(year,before.log);
  }
  if(draftPending(s))autoPick(s,{untilMine:false});
}
console.log(`\n${SEASONS}시즌 ${((Date.now()-t0)/1000).toFixed(0)}초`);
