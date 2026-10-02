// offseason-ui.js
// 오프시즌 화면 마크업. 상태를 바꾸지 않는다. panel·standingsTable 렌더러는 app.js 것을 받아 쓴다.
import {teams} from './model.js';
import {STEPS,STEP_LABELS,rosterProblems,stepBlock} from './game/contract/offseason.js';
import {teamFinance,money} from './game/contract/finance.js';
import {FILL} from './game/contract/league-fill.js';
import {negotiable,demandSalary,leaguePerf,cutFloor} from './game/contract/salary.js';
import {askingSalary} from './game/contract/release.js';
import {FA} from './game/contract/fa.js';

// 사용액/한도. 90% 초과 --gold, 초과 --red (DESIGN.md 5-2)
const usage=(used,max)=>{const r=used/max,c=r>1?'var(--red)':r>.9?'var(--gold)':'var(--text)';return `<strong style="color:${c};font-variant-numeric:tabular-nums">${money(used)}</strong> <span class="muted">/ ${money(max)}</span>`;};

// 선수 표. action(p)가 마지막 칸 버튼을 만든다. 숫자 칸은 tabular-nums
function playerTable(rows,cols,action,empty){
  if(!rows.length)return `<div class="empty">${empty}</div>`;
  const cell=v=>`<td style="font-variant-numeric:tabular-nums">${v}</td>`;
  return `<div class="tablewrap"><table><thead><tr>${cols.map(([l])=>`<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(p=>`<tr>${cols.map(([,f])=>cell(f(p))).join('')}<td>${action(p)}</td></tr>`).join('')}</tbody></table></div>`;
}
const releaseTable=state=>playerTable([...state.players].sort((a,b)=>a.ovr-b.ovr),[['선수',p=>p.name],['포지션',p=>p.pos],['나이',p=>p.age],['OVR',p=>p.ovr],['연봉',p=>p.contract?money(p.contract.salary):'-'],['구분',p=>p.group==='first'?'1군':p.group==='second'?'2군':'부상']],p=>['retire','salary','roster'].includes(state.offseason.step)?`<button class="secondary" data-release="${p.id}">방출</button>`:'-','선수가 없습니다.');

function stepBody(state,step,{standingsTable,problems}){
  const o=state.offseason;
  if(step==='close'){const rank=o.finalOrder.indexOf(0)+1;return `<div class="offnote"><p>${teams[0]} 최종 ${rank}위 · 다음 시즌 순위 수입 ${money(state.finance.teams[0].income)}</p></div>${standingsTable()}`;}
  if(step==='retire'){
    const r=o.retired??[],mine=r.filter(x=>x.team===0);
    const list=r.length?`<p>${r.map(x=>`${x.team===0?'<strong>':''}${teams[x.team]} ${x.name}(${x.age}세, OVR ${x.ovr})${x.team===0?'</strong>':''}`).join(' · ')}</p>`:'<p class="muted">은퇴 선수가 없습니다.</p>';
    return `<div class="offnote"><p><strong>은퇴 선수 ${r.length}명</strong>${mine.length?` · ${teams[0]} ${mine.length}명`:''}</p>${list}<p class="muted">방출한 선수는 자유계약 시장으로 가고, 오프시즌이 끝날 때까지 계약하지 못하면 은퇴합니다. 방출은 되돌릴 수 없습니다.</p></div>${releaseTable(state)}`;
  }
  if(step==='fa'){
    const fa=o.fa;
    if(!fa)return '<div class="empty">FA 시장이 아직 열리지 않았습니다.</div>';
    const live=o.step==='fa'&&fa.round<FA.rounds;
    const rows=[...fa.pool].sort((a,b)=>(a.fromTeam===0?0:1)-(b.fromTeam===0?0:1)||b.player.ovr-a.player.ovr);
    const status=e=>e.signedBy!==undefined?`<strong>${teams[e.signedBy]}</strong> ${e.years}년 ${money(e.salary)}`:fa.mine[e.id]?`내 제시 ${fa.mine[e.id].years}년 ${money(fa.mine[e.id].salary)}`:live?'':'미계약';
    const action=e=>{
      if(e.signedBy!==undefined||!live)return status(e)||'-';
      const m=fa.mine[e.id],st=status(e);
      return `${st?`<span class="muted">${st}</span> `:''}<select data-fa-years="${e.id}" aria-label="${e.player.name} 기간">${[1,2,3,4].map(y=>`<option value="${y}" ${(m?.years??(e.player.age>=30?3:2))===y?'selected':''}>${y}년</option>`).join('')}</select><input type="number" step="100" min="3000" value="${m?.salary??e.ask}" data-fa-salary="${e.id}" aria-label="${e.player.name} 연봉(만 원)" style="width:82px"><span class="muted">만</span> <button class="secondary" data-fa-offer="${e.id}">제시</button>`;
    };
    const table=playerTable(rows,[['선수',e=>e.player.name],['원소속',e=>teams[e.fromTeam]],['나이',e=>e.player.age],['OVR',e=>e.player.ovr],['등급',e=>e.grade],['요구액',e=>money(e.ask)]],action,'FA 자격자가 없습니다.');
    const mineOwn=fa.pool.filter(e=>e.fromTeam===0).length;
    const header=`<div class="offnote"><p><strong>${fa.round}/${FA.rounds} 라운드</strong> · 자격자 ${fa.pool.length}명(내 팀 ${mineOwn}명) · 계약 ${fa.pool.filter(e=>e.signedBy!==undefined).length}명</p><p class="muted">선수는 라운드마다 최고 제안을 보고 수락하거나 다음 라운드를 기다립니다(앞 라운드일수록 더 높은 조건을 요구). 원소속팀 +10%, 지난 시즌 순위가 높은 팀 최대 +10% 가산이 붙고, 30세 이상은 긴 계약을 27세 이하는 짧은 계약을 선호합니다. 구단당 외부 FA는 최대 ${FA.maxExternal}명, A·B등급을 영입하면 원소속팀에 보상금(A 직전 연봉 300%, B 200%)을 내고, 예산이 모자라면 보호선수 ${FA.protect}명 밖 최고 OVR 1명을 대신 보내고 보상금(A 200%·B 150%)을 냅니다. 미계약 선수는 ⑥ 자유계약 시장으로 갑니다.</p>${live?`<p><button class="secondary" data-action="faround">${fa.round+1}라운드 진행</button></p>`:''}</div>`;
    const log=fa.log.length?`<div class="offnote"><p><strong>계약 결과</strong></p>${fa.log.slice(-12).reverse().map(l=>`<p>${l}</p>`).join('')}</div>`:'';
    return `${header}${table}${log}`;
  }
  if(step==='salary'){
    const rec=o.salary??{},perf=leaguePerf(state,o.year),before=o.ovrBefore??{},live=o.step==='salary';
    const changes=state.players.filter(p=>before[p.id]!==undefined&&before[p.id]!==p.ovr).sort((a,b)=>Math.abs(b.ovr-before[b.id])-Math.abs(a.ovr-before[a.id])).slice(0,8);
    const change=changes.length?changes.map(p=>{const d=p.ovr-before[p.id];return `${p.name} <span style="color:var(${d>0?'--ok':'--red'})">${d>0?'▲':'▼'}${Math.abs(d)}</span>`;}).join(' · '):'능력 변화가 있는 선수가 없습니다.';
    const rows=state.players.filter(p=>negotiable(p,o.year));
    const label={accepted:'합의',club:'조정(구단안)',player:'조정(선수안)',demand:'요구액 수용'};
    const table=playerTable(rows,[['선수',p=>p.name],['나이',p=>p.age],['OVR',p=>p.ovr],['전년',p=>money(p.contract.salary)],['요구액',p=>money(rec[p.id]?.demand??demandSalary(p,o.year,perf))],['하한',p=>money(cutFloor(p.contract.salary))]],p=>rec[p.id]?`${label[rec[p.id].result]} ${money(rec[p.id].salary)}`:live?`<input type="number" step="100" min="${cutFloor(p.contract.salary)}" value="${demandSalary(p,o.year,perf)}" data-offer-input="${p.id}" aria-label="${p.name} 제시액(만 원)" style="width:90px"><span class="muted">만</span> <button class="secondary" data-offer="${p.id}">제시</button>`:'-','협상 대상이 없습니다.');
    const pending=rows.filter(p=>!rec[p.id]).length;
    return `<div class="offnote"><p><strong>능력 변화</strong> · ${change}</p><p>협상 대상 ${rows.length}명 · 남은 ${pending}명. 요구액보다 낮게 제시하면 거절될 수 있고, 거절하면 연봉조정으로 결정되며, 낮게 제시할수록 선수안(요구액)이 채택될 가능성이 커집니다. 선수당 한 번 제시할 수 있고, 남은 선수는 다음 단계로 넘어갈 때 요구액으로 계약합니다.</p>${live&&pending?'<p><button class="secondary" data-action="acceptall">남은 선수 전원 요구액 수용</button></p>':''}</div>${table}<div class="offnote"><p><strong>내 팀 방출</strong></p></div>${releaseTable(state)}`;
  }
  if(step==='roster'){
    const over=problems.over.length?`<p style="color:var(--red)">55명을 넘는 구단: ${problems.over.map(t=>`${teams[t.team]} ${t.count}명`).join(', ')}</p>`:`<p>모든 구단이 ${FILL.max}명 이하입니다.</p>`;
    const warn=problems.warnings.map(w=>`<p style="color:var(--gold)">${w}</p>`).join('');
    const market=playerTable([...(o.freeAgents??[])].sort((a,b)=>b.ovr-a.ovr),[['선수',p=>p.name],['원소속',p=>teams[p.fromTeam]],['포지션',p=>p.pos],['나이',p=>p.age],['OVR',p=>p.ovr],['요구 연봉',p=>money(askingSalary(p))]],p=>p.foreign?'-':`<button class="secondary" data-sign="${p.id}">영입</button>`,'자유계약 시장에 선수가 없습니다.');
    return `<div class="offnote">${over}${warn}<p class="muted">새 시즌을 시작하면 ${o.year+1} 일정이 만들어집니다. 시장에 남은 선수는 은퇴합니다.</p><p><strong>자유계약 시장</strong></p></div>${market}<div class="offnote"><p><strong>내 팀 방출</strong></p></div>${releaseTable(state)}`;
  }
  return '<div class="empty">이 단계는 다음 업데이트에서 추가됩니다.</div>';
}

export function offseasonMarkup(state,{tab,panel,standingsTable}){
  const o=state.offseason,cur=STEPS.indexOf(o.step),show=tab&&STEPS.indexOf(tab)>=0&&STEPS.indexOf(tab)<=cur?tab:o.step;
  const f=teamFinance(state,0),problems=rosterProblems(state),block=stepBlock(state),blocked=!!block;
  const context=`${o.year} 오프시즌 · ${cur+1}. ${STEP_LABELS[o.step]} · 캡 여유 ${money(f.capRoom)} · 예산 여유 ${money(f.budgetRoom)} · 로스터 ${f.count}/${FILL.max}`,ctx=block?`${context} · <span style="color:var(--red)">${block}</span>`:context;
  const tabs=`<div class="subtabs" role="tablist" aria-label="오프시즌 단계">${STEPS.map((s,i)=>`<button role="tab" data-offtab="${s}" aria-selected="${show===s}" class="${show===s?'active':''}" ${i>cur?'disabled':''}>${i+1}. ${STEP_LABELS[s]}${i<cur?' ✓':''}</button>`).join('')}</div>`;
  const t=state.finance.teams[0];
  const summary=`<div class="offnote"><p>샐러리캡 ${usage(f.capUsed,f.cap)}</p><p>예산 ${usage(f.budgetUsed,f.budget)}</p><p>로스터 <strong>${f.count}</strong> <span class="muted">/ ${FILL.max}</span></p><p class="muted">모기업 지원 ${money(t.support)} · 순위 수입 ${money(t.income)}</p></div>`;
  const news=`<div class="offnote">${[...o.log].reverse().map(l=>`<p>${l}</p>`).join('')}</div>`;
  return `<div class="toolbar"><span class="muted">${ctx}</span><button class="primary right" data-action="nextstep" ${blocked?'disabled':''}>${o.step==='roster'?'새 시즌 시작':'다음 단계'} <span>▶</span></button></div>${tabs}<div class="rostergrid"><div>${panel(`${STEPS.indexOf(show)+1}. ${STEP_LABELS[show]}`,stepBody(state,show,{standingsTable,problems}))}</div><div>${panel('재정 요약',summary)}${panel('오프시즌 뉴스',news)}</div></div>`;
}
