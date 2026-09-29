// offseason-ui.js
// 오프시즌 화면 마크업. 상태를 바꾸지 않는다. panel·standingsTable 렌더러는 app.js 것을 받아 쓴다.
import {teams} from './model.js';
import {STEPS,STEP_LABELS,rosterProblems} from './game/contract/offseason.js';
import {teamFinance,money} from './game/contract/finance.js';
import {FILL} from './game/contract/league-fill.js';
import {askingSalary} from './game/contract/release.js';

// 사용액/한도. 90% 초과 --gold, 초과 --red (DESIGN.md 5-2)
const usage=(used,max)=>{const r=used/max,c=r>1?'var(--red)':r>.9?'var(--gold)':'var(--text)';return `<strong style="color:${c};font-variant-numeric:tabular-nums">${money(used)}</strong> <span class="muted">/ ${money(max)}</span>`;};

// 선수 표. action(p)가 마지막 칸 버튼을 만든다. 숫자 칸은 tabular-nums
function playerTable(rows,cols,action,empty){
  if(!rows.length)return `<div class="empty">${empty}</div>`;
  const cell=v=>`<td style="font-variant-numeric:tabular-nums">${v}</td>`;
  return `<div class="tablewrap"><table><thead><tr>${cols.map(([l])=>`<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(p=>`<tr>${cols.map(([,f])=>cell(f(p))).join('')}<td>${action(p)}</td></tr>`).join('')}</tbody></table></div>`;
}
const releaseTable=state=>playerTable([...state.players].sort((a,b)=>a.ovr-b.ovr),[['선수',p=>p.name],['포지션',p=>p.pos],['나이',p=>p.age],['OVR',p=>p.ovr],['연봉',p=>p.contract?money(p.contract.salary):'-'],['구분',p=>p.group==='first'?'1군':p.group==='second'?'2군':'부상']],p=>['retire','roster'].includes(state.offseason.step)?`<button class="secondary" data-release="${p.id}">방출</button>`:'-','선수가 없습니다.');

function stepBody(state,step,{standingsTable,problems}){
  const o=state.offseason;
  if(step==='close'){const rank=o.finalOrder.indexOf(0)+1;return `<div class="offnote"><p>${teams[0]} 최종 ${rank}위 · 다음 시즌 순위 수입 ${money(state.finance.teams[0].income)}</p></div>${standingsTable()}`;}
  if(step==='retire'){
    const r=o.retired??[],mine=r.filter(x=>x.team===0);
    const list=r.length?`<p>${r.map(x=>`${x.team===0?'<strong>':''}${teams[x.team]} ${x.name}(${x.age}세, OVR ${x.ovr})${x.team===0?'</strong>':''}`).join(' · ')}</p>`:'<p class="muted">은퇴 선수가 없습니다.</p>';
    return `<div class="offnote"><p><strong>은퇴 선수 ${r.length}명</strong>${mine.length?` · ${teams[0]} ${mine.length}명`:''}</p>${list}<p class="muted">방출한 선수는 자유계약 시장으로 가고, 오프시즌이 끝날 때까지 계약하지 못하면 은퇴합니다. 방출은 되돌릴 수 없습니다.</p></div>${releaseTable(state)}`;
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
  const f=teamFinance(state,0),problems=rosterProblems(state),blocked=o.step==='roster'&&problems.over.length>0;
  const context=`${o.year} 오프시즌 · ${cur+1}. ${STEP_LABELS[o.step]} · 캡 여유 ${money(f.capRoom)} · 예산 여유 ${money(f.budgetRoom)} · 로스터 ${f.count}/${FILL.max}`;
  const tabs=`<div class="subtabs" role="tablist" aria-label="오프시즌 단계">${STEPS.map((s,i)=>`<button role="tab" data-offtab="${s}" aria-selected="${show===s}" class="${show===s?'active':''}" ${i>cur?'disabled':''}>${i+1}. ${STEP_LABELS[s]}${i<cur?' ✓':''}</button>`).join('')}</div>`;
  const t=state.finance.teams[0];
  const summary=`<div class="offnote"><p>샐러리캡 ${usage(f.capUsed,f.cap)}</p><p>예산 ${usage(f.budgetUsed,f.budget)}</p><p>로스터 <strong>${f.count}</strong> <span class="muted">/ ${FILL.max}</span></p><p class="muted">모기업 지원 ${money(t.support)} · 순위 수입 ${money(t.income)}</p></div>`;
  const news=`<div class="offnote">${[...o.log].reverse().map(l=>`<p>${l}</p>`).join('')}</div>`;
  return `<div class="toolbar"><span class="muted">${context}</span><button class="primary right" data-action="nextstep" ${blocked?'disabled':''}>${o.step==='roster'?'새 시즌 시작':'다음 단계'} <span>▶</span></button></div>${tabs}<div class="rostergrid"><div>${panel(`${STEPS.indexOf(show)+1}. ${STEP_LABELS[show]}`,stepBody(state,show,{standingsTable,problems}))}</div><div>${panel('재정 요약',summary)}${panel('오프시즌 뉴스',news)}</div></div>`;
}
