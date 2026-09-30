# 계약 시스템 PR 3 (연봉 협상) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오프시즌 ③에서 계약이 끝나는 국내 선수의 요구액을 계산하고, 내 팀은 전원 수용 또는 선수별 제시(확률 수락 → 거절 시 연봉조정)로, AI는 전원 수용으로 다음 시즌 연봉을 확정한다.

**Architecture:** 순수 로직은 새 파일 `game/contract/salary.js`. `offseason.js`는 ②를 떠날 때 노화 전 OVR을 기록하고, ③을 떠날 때 `settleSalaries`를 부른다. 협상 기록은 `state.offseason.salary`(오프시즌 동안만). 화면은 `offseason-ui.js`의 ③ 패널, `app.js`는 클릭 처리 두 개.

**Tech Stack:** 순수 ES 모듈 JS, `node:test`, localStorage. 패키지 추가 없음.

**Spec:** [`docs/superpowers/specs/2026-09-29-contract-system-design.md`](../specs/2026-09-29-contract-system-design.md) "선수 가치와 연봉 요구액", "연봉 협상 (③)". 전제: PR 2(`feat/contract-release`, #7). 이 브랜치는 PR 2 위에서 시작하며 PR 2 머지 후 main으로 rebase한다.

## Global Constraints

- `AGENTS.md`: 브랜치 `feat/contract-salary`, 새 로직은 새 파일, `app.js`·`model.js` 한 줄 포맷 유지·최소 수정, `vendor/`·엔진 생성 파일·`game/kbo-2026.js` 수정 금지.
- 금액 단위 만 원. 재정 수치는 `FIN`, 협상 수치는 `SALARY`(`salary.js`) 한 곳에만.
- `game/contract/*.js` ↔ `model.js` 순환 import: 모듈 최상위에서 `model.js` 값을 읽지 않는다.
- 확률 판정은 `hash01(\`${연도}:${선수 id}:${키}\`)`로 재현 가능하게.
- 외국인 선수는 협상 대상이 아니다(PR 5). 저장 버전 유지(기록은 오프시즌 객체 안, 이전 저장은 `??=` 기본값).
- 커밋: 한 줄 요약 + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `dist/`는 마지막 태스크에서 `npm run build`로만.

## 확정 수치·규칙 (계획 작성 시 결정)

- **가치** = `OVR 가치 × (1 − 0.4w) + 성적 가치 × 0.4w`. w = 출전 비중 `PA/(PA+200)`(타자) 또는 `IP/(IP+60)`(투수). 설계의 `OVR×0.6 + 성적×0.4×w`는 출전이 적으면 가치 합이 0.6배로 줄어 "OVR 쪽으로 수렴"이라는 의도와 어긋나 가중 평균으로 바꾼다.
- **성적 가치**: 방금 끝난 시즌(`p.history[연도]`)의 타자 OPS / 투수 평균자책을 리그 기준 선수(타자 100타석+, 투수 30이닝+)의 평균·표준편차로 `성적 OVR = 50 + 8 × z`(투수는 평균자책이 낮을수록 +)로 바꾼 뒤 `max(0,(성적 OVR − 45)/5)`. 기록이 없으면 w=0.
- **요구액**: 설계 공식 그대로(인상 60% 반영, 삭감 50% 반영, 삭감 상한 1억 이상 40% · 1억 미만 30%), 100만 원 단위 반올림, 최저 3,000만.
- **협상 대상**: 국내 선수 중 `contract.years === 1`이고 `faYear !== 오프시즌 연도`. 다년 계약(years > 1)은 ③을 떠날 때 years −1.
- **FA 자격 선수(`faYear === 연도`)**: FA 단계(PR 4)가 생기기 전까지 ③을 떠날 때 요구액으로 자동 재계약(보류 1년), `faYear += 4`(재자격). PR 4에서 FA 시장으로 교체한다.
- **제시**: 선수당 한 번. 제시액 ≥ 요구액이면 수락. 낮으면 비율 표(95% 이상 85% · 90% 60% · 85% 35% · 80% 15% · 80% 미만 0%)로 수락 판정, 거절이면 연봉조정(구단안 70%). 제시액은 삭감 상한 아래로 내릴 수 없고, 제시액 기준 캡·예산 검사(`replacing` = 전년 연봉).
- **확정**: 결과 연봉으로 `contract = {salary, years: 1, kind: 'reserve'}`. 미처리 선수는 ③을 떠날 때 요구액으로 자동 수용.
- **AI**: 전원 요구액 수용. ③을 떠난 뒤 캡을 넘으면 OVR 낮은 국내 선수부터 자유계약 시장으로 방출(설계 AI 규칙).
- **노화 요약**: ②를 떠날 때(노화 직전) 내 팀 국내 선수 OVR을 `o.ovrBefore`에 기록, ③ 화면 첫머리에 변화가 큰 선수를 보여 준다.

## File Structure

| 파일 | 책임 |
|---|---|
| `game/contract/salary.js` (신규) | `SALARY`, `leaguePerf`, `playerValue`, `demandSalary`, `acceptChance`, `negotiable`, `offerSalary`, `acceptAllDemands`, `settleSalaries` |
| `game/contract/offseason.js` (수정) | ②를 떠날 때 `ovrBefore` 기록, ③을 떠날 때 `settleSalaries` |
| `offseason-ui.js` (수정) | ③ 패널 |
| `app.js` (수정) | `data-offer`, `data-action="acceptall"` 클릭 처리 |
| `tests/contract-salary.test.mjs` (신규) | 단위 테스트 |
| `tests/contract-offseason.test.mjs` (수정) | 흐름·화면 |

---

### Task 1: 요구액·협상 로직 (`salary.js`)

**Files:**
- Create: `game/contract/salary.js`
- Test: `tests/contract-salary.test.mjs`

**Interfaces:**
- Consumes: `teams`, `teamPlayers` (`model.js`), `seasonLine` (`game/league-season.js`), `FIN`, `ovrValue`, `serviceFactor`, `serviceYears`, `canAfford`, `hash01`, `money` (`finance.js`), `aiReleaseOverflow`은 쓰지 않음(캡 초과 방출은 이 파일의 `aiCapRelease`)
- Produces:
  - `SALARY = {perfWeight:.4, minPA:100, minIP:30, raise:.6, cut:.5, cutCap:{big:.4,small:.3,line:10000}, accept:[[.95,.85],[.90,.60],[.85,.35],[.80,.15]], clubWins:.7}`
  - `leaguePerf(state, year) → {bat:{mean,sd}, pit:{mean,sd}}`
  - `playerValue(p, year, perf) → number`
  - `demandSalary(p, year, perf) → number`, `cutFloor(prev) → number`
  - `acceptChance(ratio) → number`
  - `negotiable(p, year) → boolean`
  - `offerSalary(state, id, offer) → {ok, reason, result?: 'accepted'|'club'|'player', salary?}` (내 팀, 단계 `salary`에서만, 선수당 한 번)
  - `acceptAllDemands(state) → number`
  - `settleSalaries(state) → void`
  - `state.offseason.salary = {[id]: {demand, offer?, result, salary}}`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/contract-salary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason} from '../game/league-season.js';
import {SALARY,leaguePerf,playerValue,demandSalary,cutFloor,acceptChance,negotiable,offerSalary,acceptAllDemands,settleSalaries} from '../game/contract/salary.js';
import {ovrValue,FIN,domesticPayroll} from '../game/contract/finance.js';

const off=()=>{const s=ensureSeason(initialState());s.offseason={step:'salary',year:2026,finalOrder:teams.map((_,i)=>i),log:[],freeAgents:[],retired:[],salary:{}};return s;};
const noPerf={bat:{mean:.7,sd:.1},pit:{mean:4,sd:1}};

test('가치: 기록이 없으면 OVR 가치, 기록이 많으면 성적 쪽으로',()=>{
  const p={id:'a',age:28,ovr:60,pitcher:false,history:{}};
  assert.equal(playerValue(p,2026,noPerf),ovrValue(p));
  const hot={...p,history:{2026:{batting:{pa:600,ab:500,h:175,doubles:35,hr:30,bb:80,so:80},pitching:{}}}};
  assert.ok(playerValue(hot,2026,noPerf)>ovrValue(p));
  const cold={...p,history:{2026:{batting:{pa:600,ab:560,h:110,so:150,bb:30},pitching:{}}}};
  assert.ok(playerValue(cold,2026,noPerf)<ovrValue(p));
});

test('리그 성적 기준: 기준 타석·이닝 이상만, 표준편차 0 방지',()=>{
  const s=off(),perf=leaguePerf(s,2026);
  assert.ok(perf.bat.sd>0&&perf.pit.sd>0);
});

test('요구액: 인상은 60%, 삭감은 50% 반영, 삭감 상한, 100만 원 단위, 최저 3,000만',()=>{
  const p={id:'a',age:30,entry:'hs',ovr:60,pitcher:false,history:{},contract:{salary:20000,years:1,kind:'reserve'}};
  // 적정 = 3 × 5억 × 0.6(연차 9) = 9억 → 2억 + (9억−2억)×0.6 = 6.2억
  assert.equal(demandSalary(p,2026,noPerf),62000);
  const q={...p,ovr:45,contract:{salary:50000,years:1,kind:'reserve'}}; // 적정 3,000만 → 5억 − 4.7억×0.5 = 2.65억, 하한 5억×0.6 = 3억
  assert.equal(demandSalary(q,2026,noPerf),30000);
  assert.equal(cutFloor(50000),30000);
  assert.equal(cutFloor(8000),5600);
  const r={...p,ovr:40,contract:{salary:3000,years:1,kind:'reserve'}};
  assert.equal(demandSalary(r,2026,noPerf),FIN.minSalary);
});

test('수락 확률 표',()=>{
  assert.equal(acceptChance(1),1);
  assert.equal(acceptChance(.96),.85);
  assert.equal(acceptChance(.90),.60);
  assert.equal(acceptChance(.87),.35);
  assert.equal(acceptChance(.80),.15);
  assert.equal(acceptChance(.79),0);
});

test('협상 대상: 국내·계약 마지막 해·FA 아님',()=>{
  assert.equal(negotiable({contract:{years:1},faYear:2028},2026),true);
  assert.equal(negotiable({contract:{years:2},faYear:2028},2026),false);
  assert.equal(negotiable({contract:{years:1},faYear:2026},2026),false);
  assert.equal(negotiable({foreign:true,contract:{years:1}},2026),false);
});

test('제시: 요구액 이상이면 수락, 선수당 한 번, 단계·하한 검사',()=>{
  const s=off(),p=s.players.find(x=>negotiable(x,2026)),perf=leaguePerf(s,2026),demand=demandSalary(p,2026,perf);
  s.offseason.step='fa';
  assert.equal(offerSalary(s,p.id,demand).ok,false);
  s.offseason.step='salary';
  assert.match(offerSalary(s,p.id,cutFloor(p.contract.salary)-100).reason,/삭감 한도/);
  const r=offerSalary(s,p.id,demand);
  assert.deepEqual([r.ok,r.result,r.salary],[true,'accepted',demand]);
  assert.equal(offerSalary(s,p.id,demand).ok,false);
});

test('낮은 제시: 판정은 재현 가능, 거절이면 연봉조정으로 구단안 또는 선수안',()=>{
  const a=off(),b=off();
  const ids=a.players.filter(x=>negotiable(x,2026)&&x.contract.salary>=6000).slice(0,8).map(x=>x.id);
  const perf=leaguePerf(a,2026);
  const results=ids.map(id=>{const p=a.players.find(x=>x.id===id),d=demandSalary(p,2026,perf),o=Math.max(cutFloor(p.contract.salary),Math.round(d*.86/100)*100);const r=offerSalary(a,id,o);offerSalary(b,id,o);return [r.result,r.salary,d,o];});
  assert.deepEqual(ids.map(id=>a.offseason.salary[id]),ids.map(id=>b.offseason.salary[id]));
  for(const [res,sal,d,o] of results){
    if(res==='accepted'||res==='club')assert.equal(sal,o);
    else assert.equal(sal,d);
  }
});

test('전원 수용과 확정: 대상은 요구액 보류 1년, 다년은 1년 줄고, FA 자격자는 재계약·재자격 +4, 외국인 그대로',()=>{
  const s=off();
  const multi=s.players.find(p=>p.contract?.years>1),fa=s.players.find(p=>!p.foreign&&p.faYear===2026&&p.contract.years===1),foreign=s.players.find(p=>p.foreign);
  const multiYears=multi?.years??multi?.contract.years,foreignC=structuredClone(foreign.contract);
  const n=acceptAllDemands(s);
  assert.ok(n>0);
  assert.ok(Object.values(s.offseason.salary).every(r=>r.result==='demand'));
  settleSalaries(s);
  for(const p of s.players.filter(p=>s.offseason.salary[p.id]))assert.deepEqual(p.contract,{salary:s.offseason.salary[p.id].salary,years:1,kind:'reserve'});
  if(multi)assert.equal(multi.contract.years,multiYears-1);
  if(fa){assert.equal(fa.faYear,2030);assert.equal(fa.contract.years,1);}
  assert.deepEqual(foreign.contract,foreignC);
});

test('AI는 전원 요구액 수용, 캡을 넘으면 OVR 낮은 국내 선수부터 시장으로',()=>{
  const s=off();
  s.finance.cap=domesticPayroll(s.league[3])-1;
  settleSalaries(s);
  assert.ok(domesticPayroll(s.league[3])<=s.finance.cap);
  assert.ok(s.offseason.freeAgents.some(p=>p.fromTeam===3));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/contract-salary.test.mjs`
Expected: FAIL (`Cannot find module '.../game/contract/salary.js'`)

- [ ] **Step 3: 구현**

```js
// game/contract/salary.js
/** 연봉 협상(오프시즌 ③). 요구액 산정, 내 팀 제시·연봉조정, 전원 수용, 확정. 기록은 state.offseason.salary. 상태는 제자리 변경한다. */
import {teams,teamPlayers,movePlayer} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {seasonLine} from '../league-season.js';
import {FIN,ovrValue,serviceFactor,serviceYears,canAfford,hash01,domesticPayroll} from './finance.js';

export const SALARY={
  perfWeight:.4,minPA:100,minIP:30,
  raise:.6,cut:.5,cutCap:{big:.4,small:.3,line:10000}, // 삭감 상한: 1억 이상 40% · 미만 30%
  accept:[[.95,.85],[.90,.60],[.85,.35],[.80,.15]],   // 제시/요구 비율 → 수락 확률
  clubWins:.7,                                        // 연봉조정 구단안 채택 확률
};
const round100=v=>Math.round(v/100)*100;
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const spread=(a,m)=>Math.sqrt(mean(a.map(x=>(x-m)**2)))||1;
const line=(p,year)=>seasonLine(p.history?.[year],p.pitcher);
const ipOf=l=>l.outs/3;

/** 방금 끝난 시즌의 리그 기준(타자 100타석+, 투수 30이닝+) OPS·평균자책 평균과 표준편차. */
export function leaguePerf(state,year){
  const all=teams.flatMap((_,i)=>teamPlayers(state,i)),lines=all.map(p=>[p,line(p,year)]);
  const bat=lines.filter(([p,l])=>!p.pitcher&&l.pa>=SALARY.minPA).map(([,l])=>l.ops);
  const pit=lines.filter(([p,l])=>p.pitcher&&ipOf(l)>=SALARY.minIP).map(([,l])=>l.era);
  const bm=bat.length?mean(bat):.7,pm=pit.length?mean(pit):4.5;
  return {bat:{mean:bm,sd:spread(bat,bm)},pit:{mean:pm,sd:spread(pit,pm)}};
}
/** 가치 = OVR 가치 × (1−0.4w) + 성적 가치 × 0.4w. w는 출전 비중. */
export function playerValue(p,year,perf){
  const l=line(p,year),base=ovrValue(p);
  const w=p.pitcher?ipOf(l)/(ipOf(l)+60):l.pa/(l.pa+200);
  if(!w)return base;
  const z=p.pitcher?(perf.pit.mean-l.era)/perf.pit.sd:(l.ops-perf.bat.mean)/perf.bat.sd;
  const perfValue=Math.max(0,(50+8*z-45)/5),k=SALARY.perfWeight*w;
  return base*(1-k)+perfValue*k;
}
export const cutFloor=prev=>round100(prev*(1-(prev>=SALARY.cutCap.line?SALARY.cutCap.big:SALARY.cutCap.small)));
export function demandSalary(p,year,perf){
  const fair=Math.max(FIN.minSalary,playerValue(p,year,perf)*FIN.marketUnit*serviceFactor(serviceYears(p))),prev=p.contract.salary;
  const raw=fair>=prev?prev+(fair-prev)*SALARY.raise:Math.max(cutFloor(prev),prev-(prev-fair)*SALARY.cut);
  return Math.max(FIN.minSalary,round100(raw));
}
export const acceptChance=ratio=>ratio>=1?1:(SALARY.accept.find(([min])=>ratio>=min-1e-9)?.[1]??0);
export const negotiable=(p,year)=>!p.foreign&&p.contract?.years===1&&p.faYear!==year;

const record=o=>(o.salary??={});
export function offerSalary(state,id,offer){
  const o=state.offseason,p=state.players.find(x=>x.id===id);
  if(!o||o.step!=='salary')return {ok:false,reason:'연봉 협상 단계가 아닙니다.'};
  if(!p||!negotiable(p,o.year))return {ok:false,reason:'협상 대상이 아닙니다.'};
  if(record(o)[id])return {ok:false,reason:'이미 협상을 마친 선수입니다.'};
  const floor=cutFloor(p.contract.salary);
  if(offer<floor)return {ok:false,reason:`삭감 한도(${floor.toLocaleString('ko-KR')}만) 아래로 제시할 수 없습니다.`};
  const check=canAfford(state,0,{salary:offer,replacing:p.contract.salary});
  if(!check.ok)return check;
  const demand=demandSalary(p,o.year,leaguePerf(state,o.year));
  let result='accepted',salary=offer;
  if(offer<demand&&hash01(`${o.year}:${id}:accept`)>=acceptChance(offer/demand)){
    result=hash01(`${o.year}:${id}:arbitration`)<SALARY.clubWins?'club':'player';
    if(result==='player')salary=demand;
  }
  record(o)[id]={demand,offer,result,salary};
  o.log.push(`${p.name} 연봉 ${({accepted:'합의',club:'조정(구단안)',player:'조정(선수안)'})[result]} ${salary.toLocaleString('ko-KR')}만`);
  return {ok:true,reason:'',result,salary};
}
/** 내 팀에서 아직 협상하지 않은 대상 전원을 요구액으로. 처리한 인원을 돌려준다. */
export function acceptAllDemands(state){
  const o=state.offseason,perf=leaguePerf(state,o.year);let n=0;
  for(const p of state.players)if(negotiable(p,o.year)&&!record(o)[p.id]){const d=demandSalary(p,o.year,perf);record(o)[p.id]={demand:d,result:'demand',salary:d};n++;}
  return n;
}
/** AI가 캡을 넘으면 OVR 낮은 국내 선수부터 자유계약 시장으로(최소 규칙). */
function aiCapRelease(state,team){
  const o=state.offseason;
  while(domesticPayroll(teamPlayers(state,team))>state.finance.cap){
    const p=teamPlayers(state,team).filter(x=>!x.foreign).sort((a,b)=>a.ovr-b.ovr)[0];
    if(!p)break;
    state.league[team]=state.league[team].filter(x=>x.id!==p.id);
    (o.freeAgents??=[]).push({...p,group:'second',fromTeam:team,contract:null});
    o.log.push(`${teams[team]} ${p.name} 방출(캡 초과)`);
  }
}
/** ③을 떠날 때: 내 팀 미처리 수용, 전 구단 대상 확정, 다년 1년 차감, FA 자격자 임시 재계약(PR 4 전), AI 캡 초과 방출. */
export function settleSalaries(state){
  const o=state.offseason,year=o.year,perf=leaguePerf(state,year);
  acceptAllDemands(state);
  teams.forEach((_,team)=>{
    for(const p of teamPlayers(state,team)){
      if(p.foreign||!p.contract)continue;
      if(team===0&&record(o)[p.id]){p.contract={salary:record(o)[p.id].salary,years:1,kind:'reserve'};continue;}
      if(p.contract.years>1){p.contract.years-=1;continue;}
      const d=demandSalary(p,year,perf);
      if(p.faYear===year)p.faYear=year+FIN.refaSeasons; // PR 4(FA)에서 시장으로 교체
      p.contract={salary:d,years:1,kind:'reserve'};
    }
    if(team>0)aiCapRelease(state,team);
  });
}
```

(주의: `movePlayer` import는 쓰지 않으면 넣지 않는다. 위 코드는 AI 팀만 방출하므로 `movePlayer`가 필요 없다 — import 목록에서 빼고 구현한다.)

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/contract-salary.test.mjs`
Expected: PASS (9 tests). 요구액 숫자 테스트가 실패하면 테스트 주석의 계산(적정 → 반영률 → 하한 → 100만 원 반올림)을 코드와 대조한다. 수치(`SALARY`, `FIN`)는 바꾸지 않는다.

- [ ] **Step 5: 전체 테스트, 커밋**

Run: `npm test` (전부 PASS)

```bash
git add game/contract/salary.js tests/contract-salary.test.mjs
git commit -m "Add salary demand and negotiation logic for the offseason

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 오프시즌 연결과 ③ 화면

**Files:**
- Modify: `game/contract/offseason.js`
- Modify: `offseason-ui.js`
- Modify: `app.js`
- Modify: `tests/contract-offseason.test.mjs`

**Interfaces:**
- Consumes: Task 1 전부
- Produces: `state.offseason.ovrBefore = {[id]: ovr}`(②를 떠날 때 내 팀 국내 선수), ③을 떠날 때 `settleSalaries`. 버튼 `data-offer="{id}"`(같은 행의 `<input data-offer-input="{id}">` 값 사용), `data-action="acceptall"`.

- [ ] **Step 1: 실패하는 테스트 추가** (`tests/contract-offseason.test.mjs`, import에 `import {negotiable} from '../game/contract/salary.js';`)

```js
test('③: 노화 전 OVR 기록, 떠날 때 연봉 확정(대상은 보류 1년)',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);nextStep(s);
  assert.equal(s.offseason.step,'salary');
  const mine=s.players.filter(p=>!p.foreign);
  assert.ok(mine.every(p=>typeof s.offseason.ovrBefore[p.id]==='number'));
  const target=mine.find(p=>negotiable(p,2026));
  nextStep(s);
  assert.equal(s.offseason.step,'fa');
  assert.equal(target.contract.years,1);
  assert.equal(target.contract.kind,'reserve');
  assert.equal(s.offseason.salary[target.id].result,'demand');
});

test('③ 화면: 요구액 표, 제시 입력·버튼, 전원 수용 버튼, 끝난 선수는 결과 표시',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);nextStep(s);
  const panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`,opts={tab:null,panel,standingsTable:()=>''};
  const id=s.players.find(p=>negotiable(p,2026)).id;
  const html=offseasonMarkup(s,opts);
  assert.match(html,/요구액/);
  assert.match(html,new RegExp(`data-offer-input="${id}"`));
  assert.match(html,new RegExp(`data-offer="${id}"`));
  assert.match(html,/data-action="acceptall"/);
  s.offseason.salary={[id]:{demand:5000,result:'accepted',offer:5000,salary:5000}};
  assert.doesNotMatch(offseasonMarkup(s,opts),new RegExp(`data-offer="${id}"`));
});
```

Run: `node --test tests/contract-offseason.test.mjs` → FAIL

- [ ] **Step 2: `offseason.js`**

import 추가: `import {settleSalaries} from './salary.js';`

`nextStep`의 ② 처리 줄을 교체(노화 직전 OVR 기록):

```js
  if(o.step==='retire'){aiReleaseOverflow(state);o.ovrBefore=Object.fromEntries(state.players.filter(p=>!p.foreign).map(p=>[p.id,p.ovr]));ageLeague(state);ageFreeAgents(state);o.log.push('선수단 나이 +1 · 성장·노화 반영');}
  if(o.step==='salary')settleSalaries(state);
```

- [ ] **Step 3: `offseason-ui.js`**

import 추가: `import {negotiable,demandSalary,leaguePerf,cutFloor} from './game/contract/salary.js';`

`stepBody`에 `salary` 분기 추가(`retire` 분기 뒤):

```js
  if(step==='salary'){
    const rec=o.salary??{},perf=leaguePerf(state,o.year),before=o.ovrBefore??{},live=o.step==='salary';
    const changes=state.players.filter(p=>before[p.id]!==undefined&&before[p.id]!==p.ovr).sort((a,b)=>Math.abs(b.ovr-before[b.id])-Math.abs(a.ovr-before[a.id])).slice(0,8);
    const change=changes.length?changes.map(p=>{const d=p.ovr-before[p.id];return `${p.name} <span style="color:var(${d>0?'--ok':'--red'})">${d>0?'▲':'▼'}${Math.abs(d)}</span>`;}).join(' · '):'능력 변화가 있는 선수가 없습니다.';
    const rows=state.players.filter(p=>negotiable(p,o.year));
    const label={accepted:'합의',club:'조정(구단안)',player:'조정(선수안)',demand:'요구액 수용'};
    const table=playerTable(rows,[['선수',p=>p.name],['나이',p=>p.age],['OVR',p=>p.ovr],['전년',p=>money(p.contract.salary)],['요구액',p=>money(rec[p.id]?.demand??demandSalary(p,o.year,perf))],['하한',p=>money(cutFloor(p.contract.salary))]],p=>rec[p.id]?`${label[rec[p.id].result]} ${money(rec[p.id].salary)}`:live?`<input type="number" step="100" min="${cutFloor(p.contract.salary)}" value="${demandSalary(p,o.year,perf)}" data-offer-input="${p.id}" aria-label="${p.name} 제시액(만 원)" style="width:90px"> <button class="secondary" data-offer="${p.id}">제시</button>`:'-','협상 대상이 없습니다.');
    const pending=rows.filter(p=>!rec[p.id]).length;
    return `<div class="offnote"><p><strong>능력 변화</strong> · ${change}</p><p>협상 대상 ${rows.length}명 · 남은 ${pending}명. 요구액보다 낮게 제시하면 거절될 수 있고, 거절하면 연봉조정(구단안 70%)으로 결정됩니다. 선수당 한 번 제시할 수 있고, 남은 선수는 다음 단계로 넘어갈 때 요구액으로 계약합니다.</p>${live&&pending?'<p><button class="secondary" data-action="acceptall">남은 선수 전원 요구액 수용</button></p>':''}</div>${table}`;
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/contract-offseason.test.mjs` → PASS

- [ ] **Step 5: `app.js` (한 줄 포맷 유지)**

1. 3번째 줄 import 뒤에 추가: `import {offerSalary,acceptAllDemands} from './game/contract/salary.js';`
2. 확인: `grep -o "d\.offer\|acceptall" app.js` → 출력 없음
3. 클릭 처리의 `if(d.sign){…}` 블록 **앞**에 추가(sign 블록의 `return`이 뒤 처리를 막지 않도록):

```js
if(d.offer){const input=document.querySelector(`[data-offer-input="${d.offer}"]`),r=offerSalary(state,d.offer,Number(input?.value));if(!r.ok){toast(r.reason);return;}save();render();toast(({accepted:'합의했습니다.',club:'연봉조정: 구단안이 채택됐습니다.',player:'연봉조정: 선수안이 채택됐습니다.'})[r.result]);}if(d.action==='acceptall'){const n=acceptAllDemands(state);save();render();toast(`${n}명과 요구액으로 계약했습니다.`);}
```

Run: `node --check app.js && npm test` → PASS

- [ ] **Step 6: 커밋**

```bash
git add game/contract/offseason.js offseason-ui.js app.js tests/contract-offseason.test.mjs
git commit -m "Wire salary negotiation into offseason step 3 with offers and accept-all

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(브라우저 확인은 조율자가 직접 한다.)

---

### Task 3: 문서, 빌드

- [ ] **Step 1:** 설계 문서 `### 연봉 협상 (③)` 절 끝에 추가:

```markdown
- 확정 규칙(PR 3): 가치 = OVR 가치 × (1 − 0.4w) + 성적 가치 × 0.4w(설계 초안의 `×0.6 + ×0.4w`는 출전이 적으면 가치가 줄어 가중 평균으로 변경). 성적 가치는 직전 시즌 OPS·평균자책을 리그 기준 선수(100타석·30이닝+) 평균·표준편차로 `50 + 8z` OVR 척도로 환산. 대상은 계약 마지막 해 국내 선수(FA 자격자 제외), 다년 계약은 1년 차감. 선수당 제시 1회, 판정은 `연도:id` 해시. FA 자격자는 PR 4 전까지 요구액으로 자동 재계약·재자격 +4. AI는 전원 수용 후 캡 초과분을 OVR 낮은 순으로 방출.
```

- [ ] **Step 2:** README의 "연봉 협상·FA·외국인·드래프트는 후속 업데이트에서 추가됩니다"를 "연봉 협상(요구액 제시·연봉조정)이 동작하며, FA·외국인·드래프트는 후속 업데이트에서 추가됩니다"로 교체.

- [ ] **Step 3:** `npm run build && npm test`, `cmp game/contract/salary.js dist/game/contract/salary.js`

- [ ] **Step 4:** 커밋 `Document salary negotiation rules and rebuild dist` + trailer.
