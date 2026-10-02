// draft-ui.js
// 신인 드래프트 화면 마크업. 상태를 바꾸지 않는다. panel 렌더러는 app.js 것을 받아 쓴다.
import {teams} from './model.js';
import {DRAFT,draftStrength,onClock} from './game/contract/draft.js';

const TYPE={floor:'플로어',balance:'밸런스',ceiling:'실링'},ENTRY={hs:'고졸',college:'대졸'};
const cell=v=>`<td style="font-variant-numeric:tabular-nums">${v}</td>`;

export function draftMarkup(state,{panel}){
  const d=state.draft;
  if(!d)return panel('신인 드래프트','<div class="empty">드래프트가 아직 열리지 않았습니다.</div>');
  const clock=onClock(d),mine=clock===0&&!d.done,round=Math.min(DRAFT.rounds,Math.floor(d.picks.length/d.order.length)+1);
  const pick=d.picks.length+1,left=d.pool.filter(e=>e.pickedBy===undefined);
  const head=`<div class="toolbar"><span class="muted">${d.year} 신인 드래프트 · ${DRAFT.strength[draftStrength(d.year)].label} · ${d.done?'종료':`${round}라운드 ${pick}번째 지명 · 차례 ${teams[clock]}`}</span>${d.done?'<button class="primary right" data-nav="home">사무실로 <span>▶</span></button>':mine?'<span class="right tag">내 차례</span>':'<button class="primary right" data-action="draftauto">내 차례까지 진행 <span>▶</span></button>'}</div>`;
  const note=`<div class="offnote"><p>지명 순서는 지난 시즌 순위 역순(첫 시즌은 지금 순위 역순), ${DRAFT.rounds}라운드입니다. 잠재력은 범위로만 보입니다. 플로어픽은 범위가 좁아 확실하고, 실링픽은 범위가 넓어 터지면 크지만 아닐 수도 있습니다. 지명한 선수는 오프시즌 로스터 확정 단계에서 2군으로 합류합니다(신인 계약 3,000만).</p>${d.done?'':'<p><button class="secondary" data-action="draftall">남은 지명 모두 자동(내 차례 포함)</button></p>'}</div>`;
  const rows=[...left].sort((a,b)=>(b.player.ovr+(b.potRange[0]+b.potRange[1])/2)-(a.player.ovr+(a.potRange[0]+a.potRange[1])/2));
  const table=rows.length?`<div class="tablewrap" style="max-height:560px"><table><thead><tr><th>선수</th><th>포지션</th><th>나이</th><th>출신</th><th>유형</th><th>현재 OVR</th><th>잠재력</th><th></th></tr></thead><tbody>${rows.map(e=>`<tr><td class="name">${e.player.name}</td>${cell(e.player.pitcher?'투수':e.player.pos)}${cell(e.player.age)}${cell(ENTRY[e.entry])}${cell(TYPE[e.type])}${cell(e.player.ovr)}${cell(`${e.potRange[0]}~${e.potRange[1]}`)}<td>${mine?`<button class="secondary" data-draft-pick="${e.id}">지명</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">남은 후보가 없습니다.</div>';
  const myPicks=d.picks.filter(p=>p.team===0).map(p=>{const e=d.pool.find(x=>x.id===p.id);return `<p>${p.round}R ${e.player.name} · ${e.player.pitcher?'투수':e.player.pos} · ${TYPE[e.type]} · ${e.potRange[0]}~${e.potRange[1]}</p>`;}).join('')||'<p class="muted">아직 지명한 선수가 없습니다.</p>';
  const recent=d.picks.slice(-12).reverse().map(p=>`<p>${p.round}R ${teams[p.team]} ${d.pool.find(x=>x.id===p.id).player.name}</p>`).join('')||'<p class="muted">-</p>';
  return `${head}<div class="rostergrid"><div>${panel(`후보 ${left.length}명`,note+table)}</div><div>${panel('내 지명',`<div class="offnote">${myPicks}</div>`)}${panel('최근 지명',`<div class="offnote">${recent}</div>`)}</div></div>`;
}
