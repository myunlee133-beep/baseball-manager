# 계약 시스템 PR 2 (은퇴·방출·자유계약 시장) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오프시즌 ②에서 리그 전체 자동 은퇴와 내 팀 방출을, ⑥에서 자유계약 시장 영입을 처리하고, AI 구단의 55명 초과분 방출과 미계약자 은퇴로 리그 인원을 유지한다.

**Architecture:** 순수 로직은 새 파일 `game/contract/release.js`에 두고, `game/contract/offseason.js`의 단계 전환에서 호출한다. 자유계약 시장은 오프시즌 동안만 존재하므로 `state.offseason.freeAgents`에 둔다(최상위 상태 필드 추가 없음, 저장 버전 유지). 화면은 `offseason-ui.js`의 ②·⑥ 패널과 `app.js` 클릭 처리 두 줄만 바꾼다.

**Tech Stack:** 브라우저용 순수 ES 모듈 JS, `node:test`, localStorage. 패키지 추가 없음.

**Spec:** [`docs/superpowers/specs/2026-09-29-contract-system-design.md`](../specs/2026-09-29-contract-system-design.md) "은퇴·방출 (②)", "AI 최소 규칙", "전체 흐름". 전제: PR 1(`feat/contract-base`, [#6](https://github.com/myunlee133-beep/baseball-manager/pull/6)) 머지.

## Global Constraints

- `AGENTS.md` 준수: 브랜치 `feat/contract-release`, 새 로직은 새 파일, `app.js`·`model.js`는 한 줄 압축 포맷 유지·최소 수정, `vendor/`·엔진 생성 파일·`game/kbo-2026.js` 수정 금지.
- 금액 단위 만 원. 재정 수치는 `FIN`(`game/contract/finance.js`), 은퇴 수치는 `RETIRE`(`release.js`) 한 곳에만.
- `game/contract/*.js`는 `model.js`와 순환 import다. 모듈 최상위 코드에서 `model.js`의 값을 읽지 않는다(함수 안에서만).
- 판정은 재현 가능해야 한다: 난수 대신 `hash01(\`${연도}:${선수 id}:retire\`)`로 결정.
- 외국인 선수는 은퇴하지 않고(외국인 계약은 PR 5), 방출은 가능하다.
- 방출한 선수의 남은 연봉은 사라진다(잔여 연봉 부담 없음, 단순화). 방출은 되돌릴 수 없으므로 화면에서 확인 창을 띄운다.
- 사용자 문구는 한국어. 화면 규칙 `DESIGN.md`(버튼은 보조 스타일 `secondary`, CTA는 기존 [다음 단계] 하나).
- 커밋 메시지: 한 줄 요약 + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `dist/`는 마지막 태스크에서 `npm run build`로만 갱신.

## 확정 수치 (계획 작성 시 결정, 사용자 승인 대상)

- 은퇴 기본 확률(노화 전 나이): 32세 이하 0 · 33세 2% · 34세 5% · 35세 10% · 36세 18% · 37세 28% · 38세 40% · 39세 55% · 40~41세 70% · 42세 이상 90%.
- 능력 보정: OVR 60 이상 ×0.5, OVR 40 이하 ×1.5, 상한 100%.
- 2026 개막 리그 기준 기대 은퇴 약 24명/년(팀별 0.9~4.8명).
- 자유계약 시장 요구 연봉 = `fairSalary(p)`(보류 1년 계약). 영입은 ⑥에서만, 캡·예산·55명 검사.
- 은퇴는 ① → ②로 넘어갈 때 판정해 ②에서 보여 준다. 방출은 ②와 ⑥에서 가능.
- AI: ②를 떠날 때와 ⑥을 떠날 때 55명 초과분을 OVR 낮은 국내 선수부터 방출. 자유계약 시장에서 영입하지 않음.
- ⑥을 떠날 때 시장에 남은 선수는 전원 은퇴.
- 노화 때 자유계약 시장 선수도 나이 +1(성장·노화 훅은 리그 선수에만 적용되는 한계를 문서에 남긴다).

## File Structure

| 파일 | 책임 |
|---|---|
| `game/contract/release.js` (신규) | `RETIRE` 상수, `retireChance`, `runRetirements`, `releasePlayer`, `askingSalary`, `signFreeAgent`, `aiReleaseOverflow`, `retireUnsigned`, `ageFreeAgents` |
| `game/contract/finance.js` (수정) | `hash01` export 한 줄 |
| `game/contract/offseason.js` (수정) | `beginOffseason`에 `freeAgents`·`retired`, `nextStep`에서 release.js 호출 |
| `offseason-ui.js` (수정) | ② 은퇴 목록 + 방출 표, ⑥ 방출 표 + 자유계약 시장 표 |
| `app.js` (수정) | `data-release`, `data-sign` 클릭 처리와 import |
| `tests/contract-release.test.mjs` (신규) | release.js 단위 테스트 |
| `tests/contract-offseason.test.mjs` (수정) | 흐름·화면 테스트 갱신 |

---

### Task 1: 은퇴·방출·시장 로직 (`release.js`)

**Files:**
- Create: `game/contract/release.js`
- Modify: `game/contract/finance.js` (hash 아래 한 줄)
- Test: `tests/contract-release.test.mjs`

**Interfaces:**
- Consumes: `teams`, `teamPlayers`, `movePlayer` (`model.js`), `fairSalary`, `canAfford`, `hash01` (finance.js), `FILL.max` (league-fill.js)
- Produces:
  - `RETIRE: {byAge: [maxAge, prob][], strong: {ovr, factor}, weak: {ovr, factor}}`
  - `retireChance(p): number` (0~1, 외국인 0)
  - `runRetirements(state): {id,name,team,age,ovr}[]` — `state.offseason.retired`에 저장, 리그에서 제거, 로그
  - `releasePlayer(state, id): boolean` — 내 팀 선수를 `state.offseason.freeAgents`로(단계 `retire`·`roster`에서만)
  - `askingSalary(p): number`
  - `signFreeAgent(state, id): {ok, reason}` — 단계 `roster`에서만
  - `aiReleaseOverflow(state): number` — AI 구단 55명 초과분 방출 수
  - `retireUnsigned(state): number`, `ageFreeAgents(state): void`
  - 자유계약 선수 객체: 원래 선수 필드 + `fromTeam`(원소속 팀 번호), `contract: null`, `group: 'second'`

- [ ] **Step 1: finance.js에 hash01 export**

`game/contract/finance.js`의 `const hash=...;` 줄 바로 아래에 추가:

```js
export const hash01=hash; // 재현 가능한 0~1 판정(은퇴 등)
```

- [ ] **Step 2: 실패하는 테스트 작성**

```js
// tests/contract-release.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,teams,teamPlayers} from '../model.js';
import {ensureSeason} from '../game/league-season.js';
import {RETIRE,retireChance,runRetirements,releasePlayer,askingSalary,signFreeAgent,aiReleaseOverflow,retireUnsigned,ageFreeAgents} from '../game/contract/release.js';
import {fairSalary,domesticPayroll} from '../game/contract/finance.js';

const off=(step='retire')=>{const s=ensureSeason(initialState());s.offseason={step,year:2026,finalOrder:teams.map((_,i)=>i),log:[],freeAgents:[],retired:[]};return s;};
const all=s=>teams.flatMap((_,i)=>teamPlayers(s,i));

test('은퇴 확률: 나이표 × 능력 보정, 외국인 0, 상한 1',()=>{
  assert.equal(retireChance({age:32,ovr:50}),0);
  assert.equal(retireChance({age:35,ovr:50}),.10);
  assert.equal(retireChance({age:35,ovr:62}),.05);
  assert.equal(retireChance({age:35,ovr:38}),.15000000000000002);
  assert.equal(retireChance({age:43,ovr:30}),1);
  assert.equal(retireChance({age:40,ovr:50,foreign:true}),0);
  assert.equal(RETIRE.byAge.at(-1)[0],Infinity);
});

test('자동 은퇴: 리그에서 빠지고 기록되며 같은 해면 결과가 같다, 규모는 연 10~45명',()=>{
  const a=off(),b=off(),before=all(a).length;
  const out=runRetirements(a);
  assert.deepEqual(runRetirements(b).map(r=>r.id),out.map(r=>r.id));
  assert.ok(out.length>=10&&out.length<=45,`${out.length}명`);
  assert.equal(all(a).length,before-out.length);
  assert.deepEqual(a.offseason.retired,out);
  for(const r of out)assert.ok(!all(a).some(p=>p.id===r.id));
  assert.ok(out.every(r=>r.age>=33));
  assert.match(a.offseason.log.at(-1),/은퇴/);
});

test('내 팀 선수가 은퇴하면 라인업·로테이션에서도 빠진다',()=>{
  const s=off(),sp=s.rotation[0],p=s.players.find(x=>x.id===sp);
  p.age=45;p.ovr=30;p.foreign=false;
  runRetirements(s);
  assert.ok(!s.players.some(x=>x.id===sp));
  assert.ok(!s.rotation.includes(sp));
});

test('방출: ②·⑥에서만, 내 팀에서 빠져 시장으로(원소속·계약 없음), 캡 사용액 감소',()=>{
  const s=off('salary'),id=s.order.find(x=>!s.players.find(p=>p.id===x).foreign); // 외국인은 캡에 안 잡히므로 국내 주전
  assert.equal(releasePlayer(s,id),false);
  s.offseason.step='retire';
  const before=domesticPayroll(s.players);
  assert.equal(releasePlayer(s,id),true);
  assert.ok(!s.players.some(p=>p.id===id));
  assert.ok(!s.order.includes(id)&&!Object.values(s.field).includes(id));
  const fa=s.offseason.freeAgents.find(p=>p.id===id);
  assert.equal(fa.fromTeam,0);
  assert.equal(fa.contract,null);
  assert.ok(domesticPayroll(s.players)<before);
  assert.equal(releasePlayer(s,'nope'),false);
});

test('시장 영입: ⑥에서만, 요구 연봉 = 적정 연봉, 내 팀 2군·보류 1년, 55명·캡 검사',()=>{
  const s=off('retire'),id=s.players.find(p=>!p.foreign&&p.group==='second').id;
  releasePlayer(s,id);
  assert.equal(signFreeAgent(s,id).ok,false);
  s.offseason.step='roster';
  const fa=s.offseason.freeAgents[0];
  assert.equal(askingSalary(fa),fairSalary(fa));
  assert.deepEqual(signFreeAgent(s,id),{ok:true,reason:''});
  const p=s.players.find(x=>x.id===id);
  assert.equal(p.group,'second');
  assert.equal(p.teamIndex,0);
  assert.deepEqual(p.contract,{salary:askingSalary(p),years:1,kind:'reserve'});
  assert.equal(s.offseason.freeAgents.length,0);
  // 55명이면 영입 불가
  const other=s.league[5].pop();
  s.offseason.freeAgents.push({...other,fromTeam:5,contract:null});
  assert.equal(s.players.length,55);
  assert.deepEqual(signFreeAgent(s,other.id),{ok:false,reason:'로스터 55명이 찼습니다.'});
  // 캡 초과면 불가
  s.players.pop();
  s.finance.cap=domesticPayroll(s.players);
  assert.match(signFreeAgent(s,other.id).reason,/캡 초과/);
});

test('AI 55명 초과분은 OVR 낮은 국내 선수부터 방출, 내 팀은 건드리지 않음',()=>{
  const s=off();
  const extra=structuredClone(s.league[2].slice(-3)).map((p,k)=>({...p,id:`2-x${k}`,ovr:99}));
  s.league[2].push(...extra);
  s.players.push({...structuredClone(s.players.at(-1)),id:'0-x'});
  const lowest=[...s.league[2]].filter(p=>!p.foreign).sort((a,b)=>a.ovr-b.ovr).slice(0,3).map(p=>p.id);
  assert.equal(aiReleaseOverflow(s),3);
  assert.equal(s.league[2].length,55);
  assert.deepEqual(s.offseason.freeAgents.map(p=>p.id).sort(),lowest.sort());
  assert.equal(s.players.length,56);
});

test('미계약자 은퇴와 시장 선수 노화',()=>{
  const s=off();
  releasePlayer(s,s.order[0]);releasePlayer(s,s.order[0]);
  const age=s.offseason.freeAgents[0].age;
  ageFreeAgents(s);
  assert.equal(s.offseason.freeAgents[0].age,age+1);
  assert.equal(retireUnsigned(s),2);
  assert.deepEqual(s.offseason.freeAgents,[]);
  assert.match(s.offseason.log.at(-1),/2명/);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/contract-release.test.mjs`
Expected: FAIL (`Cannot find module '.../game/contract/release.js'`)

- [ ] **Step 4: 구현**

```js
// game/contract/release.js
/** 은퇴·방출·자유계약 시장. 시장은 오프시즌 동안만 state.offseason.freeAgents 에 있다. 상태는 제자리 변경한다. */
import {teams,teamPlayers,movePlayer} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {fairSalary,canAfford,hash01} from './finance.js';
import {FILL} from './league-fill.js';

export const RETIRE={
  // [나이 상한, 기본 확률]. 판정은 노화 전 나이로 한다
  byAge:[[32,0],[33,.02],[34,.05],[35,.10],[36,.18],[37,.28],[38,.40],[39,.55],[41,.70],[Infinity,.90]],
  strong:{ovr:60,factor:.5},weak:{ovr:40,factor:1.5},
};
export function retireChance(p){
  if(p.foreign)return 0;
  const base=RETIRE.byAge.find(([max])=>p.age<=max)[1];
  const f=p.ovr>=RETIRE.strong.ovr?RETIRE.strong.factor:p.ovr<=RETIRE.weak.ovr?RETIRE.weak.factor:1;
  return Math.min(1,base*f);
}
/** 팀에서 선수를 뺀다. 내 팀은 movePlayer로 라인업·로테이션·불펜에서 먼저 정리한다. */
function removeFromTeam(state,team,id){
  if(team===0){movePlayer(state,id,'second');state.players=state.players.filter(p=>p.id!==id);}
  else state.league[team]=state.league[team].filter(p=>p.id!==id);
}
const toFreeAgent=(p,team)=>({...p,group:'second',role:p.pitcher?null:p.role==='주전'?'벤치':p.role,fromTeam:team,contract:null});

/** ①→② 때 리그 전체 은퇴 판정. 같은 해·같은 선수면 결과가 같다. */
export function runRetirements(state){
  const o=state.offseason,out=[];
  teams.forEach((_,team)=>{
    for(const p of [...teamPlayers(state,team)]){
      if(hash01(`${o.year}:${p.id}:retire`)<retireChance(p)){removeFromTeam(state,team,p.id);out.push({id:p.id,name:p.name,team,age:p.age,ovr:p.ovr});}
    }
  });
  o.retired=out;
  const mine=out.filter(r=>r.team===0).map(r=>r.name);
  o.log.push(`은퇴 ${out.length}명${mine.length?` · ${teams[0]} ${mine.join(', ')}`:''}`);
  return out;
}
export function releasePlayer(state,id){
  const o=state.offseason,p=state.players.find(x=>x.id===id);
  if(!o||!['retire','roster'].includes(o.step)||!p)return false;
  removeFromTeam(state,0,id);
  (o.freeAgents??=[]).push(toFreeAgent(p,0));
  o.log.push(`${teams[0]} ${p.name} 방출`);
  return true;
}
export const askingSalary=p=>fairSalary(p);
export function signFreeAgent(state,id){
  const o=state.offseason;
  if(!o||o.step!=='roster')return {ok:false,reason:'자유계약 선수 영입은 로스터 확정 단계에서 할 수 있습니다.'};
  const k=(o.freeAgents??=[]).findIndex(p=>p.id===id);
  if(k<0)return {ok:false,reason:'자유계약 시장에 없는 선수입니다.'};
  if(state.players.length>=FILL.max)return {ok:false,reason:`로스터 ${FILL.max}명이 찼습니다.`};
  const p=o.freeAgents[k],salary=askingSalary(p),check=canAfford(state,0,{salary});
  if(!check.ok)return check;
  o.freeAgents.splice(k,1);
  const {fromTeam,...rest}=p;
  state.players.push({...rest,team:teams[0],teamIndex:0,group:'second',contract:{salary,years:1,kind:'reserve'}});
  o.log.push(`${teams[0]} ${p.name} 영입(자유계약)`);
  return {ok:true,reason:''};
}
/** AI 구단이 55명을 넘으면 OVR 낮은 국내 선수부터 방출한다(최소 규칙, 게임성 단계에서 교체). */
export function aiReleaseOverflow(state){
  const o=state.offseason;let n=0;
  for(let team=1;team<teams.length;team++){
    while(teamPlayers(state,team).length>FILL.max){
      const p=teamPlayers(state,team).filter(x=>!x.foreign).sort((a,b)=>a.ovr-b.ovr)[0];
      removeFromTeam(state,team,p.id);
      (o.freeAgents??=[]).push(toFreeAgent(p,team));
      n++;
    }
  }
  if(n)o.log.push(`AI 구단 방출 ${n}명`);
  return n;
}
/** 노화 단계에서 시장 선수도 나이를 먹는다(성장·노화 훅은 리그 선수에만 적용). */
export function ageFreeAgents(state){for(const p of state.offseason.freeAgents??[])p.age+=1;}
/** ⑥을 떠날 때 시장에 남은 선수는 은퇴한다. */
export function retireUnsigned(state){
  const o=state.offseason,n=(o.freeAgents??[]).length;
  if(n)o.log.push(`미계약 자유계약 선수 ${n}명 은퇴`);
  o.freeAgents=[];
  return n;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/contract-release.test.mjs`
Expected: PASS (7 tests). "규모는 연 10~45명"이 실패하면 수치를 바꾸지 말고 실제 인원을 보고한다(확정 수치는 사용자 승인 대상).

- [ ] **Step 6: 커밋**

```bash
git add game/contract/release.js game/contract/finance.js tests/contract-release.test.mjs
git commit -m "Add retirement, release and free-agent market logic for the offseason

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 오프시즌 단계에 연결 (`offseason.js`)

**Files:**
- Modify: `game/contract/offseason.js`
- Modify: `tests/contract-offseason.test.mjs`

**Interfaces:**
- Consumes: Task 1 전부
- Produces: `beginOffseason`이 `offseason.freeAgents=[]`, `offseason.retired=[]`를 만든다. `nextStep`: close→retire 때 `runRetirements`, retire를 떠날 때 `aiReleaseOverflow` → `ageLeague` → `ageFreeAgents`, roster를 떠날 때 `aiReleaseOverflow` → 내 팀 55명 검사 → `retireUnsigned` → `prepareNextSeason`

- [ ] **Step 1: 테스트 갱신 (실패 확인용)**

`tests/contract-offseason.test.mjs`에서:

1. `'55명을 넘는 구단이 있으면 새 시즌으로 넘어가지 않는다'` 테스트 전체를 아래 두 테스트로 교체(AI 초과는 이제 자동 방출되므로 막히는 것은 내 팀뿐):

```js
test('내 팀이 55명을 넘으면 새 시즌으로 넘어가지 않는다',()=>{
  const s=ended();
  beginOffseason(s);
  while(s.offseason.step!=='roster')nextStep(s);
  s.players.push({...structuredClone(s.players.at(-1)),id:'0-extra'});
  const n=s.players.length;
  assert.deepEqual(rosterProblems(s).over,[{team:0,count:n}]);
  assert.equal(nextStep(s),false);
  assert.equal(s.offseason.step,'roster');
  assert.equal(s.season.year,2026);
});

test('AI 구단이 55명을 넘으면 ⑥을 떠날 때 자동 방출되고, 시장에 남은 선수는 은퇴한다',()=>{
  const s=ended();
  beginOffseason(s);
  while(s.offseason.step!=='roster')nextStep(s);
  s.league[3].push({...structuredClone(s.league[3].at(-1)),id:'3-extra',ovr:99});
  assert.equal(nextStep(s),true);
  assert.equal(s.league[3].length,55);
  assert.equal(s.offseason,null);
  assert.equal(s.season.year,2027);
});

test('②에 들어올 때 은퇴가 판정되고, 떠날 때 시장 선수도 나이를 먹는다',()=>{
  const s=ended();
  beginOffseason(s);
  assert.deepEqual(s.offseason.freeAgents,[]);
  nextStep(s);
  assert.equal(s.offseason.step,'retire');
  assert.ok(s.offseason.retired.length>0);
  s.offseason.freeAgents.push({...structuredClone(s.players.at(-1)),id:'fa-1',fromTeam:0,contract:null});
  const age=s.offseason.freeAgents[0].age;
  nextStep(s);
  assert.equal(s.offseason.freeAgents[0].age,age+1);
});
```

2. `'①~⑥ 진행…'` 테스트는 그대로 둔다(내 팀 첫 선수는 외국인이라 은퇴하지 않는다).

Run: `node --test tests/contract-offseason.test.mjs`
Expected: FAIL (AI 초과 테스트에서 `nextStep`이 false, `freeAgents` undefined)

- [ ] **Step 2: 구현**

`game/contract/offseason.js` import에 추가:

```js
import {runRetirements,aiReleaseOverflow,ageFreeAgents,retireUnsigned} from './release.js';
```

`beginOffseason`의 `state.offseason={…}` 객체에 `freeAgents:[],retired:[]`를 추가:

```js
  state.offseason={step:'close',year,finalOrder:order,log:[`${year} 시즌 종료 · 1위 ${teams[order[0]]}`],freeAgents:[],retired:[]};
```

`nextStep` 전체를 교체:

```js
/** 다음 단계로. ①→② 은퇴 판정, ②를 떠날 때 AI 방출·노화, ⑥을 떠날 때 AI 방출·55명 검사·미계약자 은퇴 후 새 시즌. 넘어가지 못하면 false. */
export function nextStep(state){
  const o=state.offseason;
  if(!o)return false;
  o.freeAgents??=[];
  if(o.step==='roster'){
    aiReleaseOverflow(state);
    if(rosterProblems(state).over.length)return false;
    retireUnsigned(state);
    prepareNextSeason(state);
    state.offseason=null;
    return true;
  }
  if(o.step==='retire'){aiReleaseOverflow(state);ageLeague(state);ageFreeAgents(state);o.log.push('선수단 나이 +1 · 성장·노화 반영');}
  o.step=STEPS[STEPS.indexOf(o.step)+1];
  if(o.step==='retire')runRetirements(state);
  return true;
}
```

- [ ] **Step 3: 통과 확인**

Run: `node --test tests/contract-offseason.test.mjs tests/contract-release.test.mjs`
Expected: PASS

- [ ] **Step 4: 전체 테스트와 커밋**

Run: `npm test`
Expected: 전부 PASS

```bash
git add game/contract/offseason.js tests/contract-offseason.test.mjs
git commit -m "Run retirements, AI overflow releases and unsigned retirements in offseason steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 화면 (② 은퇴·방출, ⑥ 방출·자유계약 시장)

**Files:**
- Modify: `offseason-ui.js` (`stepBody`의 `retire`·`roster` 분기, 헬퍼 추가)
- Modify: `app.js` (3번째 줄 import, 클릭 처리)
- Modify: `tests/contract-offseason.test.mjs` (마크업 테스트 추가)

**Interfaces:**
- Consumes: `askingSalary`, `releasePlayer`, `signFreeAgent` (Task 1), `money` (finance.js)
- Produces: 버튼 `data-release="{선수 id}"`, `data-sign="{선수 id}"`

- [ ] **Step 1: 실패하는 마크업 테스트 추가**

`tests/contract-offseason.test.mjs`에 추가:

```js
test('② 화면: 은퇴 목록과 내 팀 방출 버튼, ⑥ 화면: 자유계약 시장 영입 버튼',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);
  const panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`,opts={tab:null,panel,standingsTable:()=>''};
  const two=offseasonMarkup(s,opts);
  assert.match(two,/은퇴 선수/);
  assert.match(two,new RegExp(s.offseason.retired[0].name));
  assert.match(two,new RegExp(`data-release="${s.players.at(-1).id}"`));
  const id=s.players.at(-1).id;
  releasePlayer(s,id);
  while(s.offseason.step!=='roster')nextStep(s);
  const six=offseasonMarkup(s,opts);
  assert.match(six,/자유계약 시장/);
  assert.match(six,new RegExp(`data-sign="${id}"`));
  assert.match(six,/data-release=/);
});
```

파일 위 import에 `import {releasePlayer} from '../game/contract/release.js';`를 추가한다.

Run: `node --test tests/contract-offseason.test.mjs`
Expected: FAIL (`/은퇴 선수/` 불일치)

- [ ] **Step 2: `offseason-ui.js` 구현**

import에 추가:

```js
import {askingSalary} from './game/contract/release.js';
```

`stepBody` 위에 헬퍼 추가:

```js
// 선수 표. action(p)가 마지막 칸 버튼을 만든다. 숫자 칸은 tabular-nums
function playerTable(rows,cols,action,empty){
  if(!rows.length)return `<div class="empty">${empty}</div>`;
  const cell=v=>`<td style="font-variant-numeric:tabular-nums">${v}</td>`;
  return `<div class="tablewrap"><table><thead><tr>${cols.map(([l])=>`<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(p=>`<tr>${cols.map(([,f])=>cell(f(p))).join('')}<td>${action(p)}</td></tr>`).join('')}</tbody></table></div>`;
}
const releaseTable=state=>playerTable([...state.players].sort((a,b)=>a.ovr-b.ovr),[['선수',p=>p.name],['포지션',p=>p.pos],['나이',p=>p.age],['OVR',p=>p.ovr],['연봉',p=>p.contract?money(p.contract.salary):'-'],['구분',p=>p.group==='first'?'1군':p.group==='second'?'2군':'부상']],p=>`<button class="secondary" data-release="${p.id}">방출</button>`,'선수가 없습니다.');
```

`stepBody`에서 `if(step==='roster'){…}` 분기 **앞**에 `retire` 분기를 추가하고, `roster` 분기의 반환값에 두 표를 붙인다:

```js
  if(step==='retire'){
    const r=o.retired??[],mine=r.filter(x=>x.team===0);
    const list=r.length?`<p>${r.map(x=>`${x.team===0?'<strong>':''}${teams[x.team]} ${x.name}(${x.age}세, OVR ${x.ovr})${x.team===0?'</strong>':''}`).join(' · ')}</p>`:'<p class="muted">은퇴 선수가 없습니다.</p>';
    return `<div class="offnote"><p><strong>은퇴 선수 ${r.length}명</strong>${mine.length?` · ${teams[0]} ${mine.length}명`:''}</p>${list}<p class="muted">방출한 선수는 자유계약 시장으로 가고, 오프시즌이 끝날 때까지 계약하지 못하면 은퇴합니다. 방출은 되돌릴 수 없습니다.</p></div>${releaseTable(state)}`;
  }
```

`roster` 분기의 `return` 줄을 교체:

```js
    const market=playerTable([...(o.freeAgents??[])].sort((a,b)=>b.ovr-a.ovr),[['선수',p=>p.name],['원소속',p=>teams[p.fromTeam]],['포지션',p=>p.pos],['나이',p=>p.age],['OVR',p=>p.ovr],['요구 연봉',p=>money(askingSalary(p))]],p=>`<button class="secondary" data-sign="${p.id}">영입</button>`,'자유계약 시장에 선수가 없습니다.');
    return `<div class="offnote">${over}${warn}<p class="muted">새 시즌을 시작하면 ${o.year+1} 일정이 만들어집니다. 시장에 남은 선수는 은퇴합니다.</p><p><strong>자유계약 시장</strong></p></div>${market}<div class="offnote"><p><strong>내 팀 방출</strong></p></div>${releaseTable(state)}`;
```

- [ ] **Step 3: 마크업 테스트 통과 확인**

Run: `node --test tests/contract-offseason.test.mjs`
Expected: PASS

- [ ] **Step 4: `app.js` 연결 (한 줄 포맷 유지)**

1. 3번째 줄의 `import {beginOffseason,nextStep} from './game/contract/offseason.js';` 뒤에 추가:

```js
import {releasePlayer,signFreeAgent} from './game/contract/release.js';
```

2. `data-release`, `data-sign`이 기존 코드에서 쓰이지 않는지 확인:

Run: `grep -o "d\.release\|d\.sign\|data-release\|data-sign" app.js`
Expected: 출력 없음

3. 클릭 처리에서 `if(d.offtab){offTab=d.offtab;render();}` 바로 뒤에 추가:

```js
if(d.release){const p=state.players.find(x=>x.id===d.release);if(p&&confirm(`${p.name} 선수를 방출할까요? 되돌릴 수 없습니다.`)&&releasePlayer(state,d.release)){normalizeNext();save();render();toast(`${p.name} 선수를 방출했습니다.`);}}if(d.sign){const r=signFreeAgent(state,d.sign);if(!r.ok){toast(r.reason);return;}save();render();toast('자유계약 선수를 영입했습니다.');}
```

Run: `node --check app.js && npm test`
Expected: 문법 오류 없음, 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add offseason-ui.js app.js tests/contract-offseason.test.mjs
git commit -m "Show retirements, release controls and free-agent market in offseason steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(브라우저 확인은 조율자가 이 태스크 뒤에 직접 한다: ② 은퇴 목록·방출 확인 창, ⑥ 시장 영입과 캡·55명 안내 토스트, 새로고침 이어가기, 콘솔 오류.)

---

### Task 4: 문서, 빌드

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-29-contract-system-design.md` ("은퇴·방출 (②)" 절에 확정 수치)
- Regenerate: `dist/`

- [ ] **Step 1: 설계 문서에 확정 수치 기록**

`docs/superpowers/specs/2026-09-29-contract-system-design.md`의 `### 은퇴·방출 (②)` 절 끝에 추가:

```markdown
- 확정 수치(PR 2): 기본 확률 33세 2% · 34세 5% · 35세 10% · 36세 18% · 37세 28% · 38세 40% · 39세 55% · 40~41세 70% · 42세 이상 90%, OVR 60 이상 ×0.5 · 40 이하 ×1.5. 2026 개막 리그 기준 연 약 24명. 판정은 `연도:선수 id` 해시로 재현 가능.
- 자유계약 시장은 `state.offseason.freeAgents`(오프시즌 동안만). 요구 연봉 = 적정 연봉, 보류 1년. 영입은 ⑥에서만. 방출 선수의 잔여 연봉은 사라진다(단순화). 시장 선수는 노화 때 나이만 +1(성장·노화 훅 미적용).
```

- [ ] **Step 2: README 갱신**

`README.md`의 "은퇴·연봉·FA·외국인·드래프트의 실제 처리는 후속 업데이트에서 추가됩니다" 문장을 교체:

```markdown
은퇴(나이·능력 기반 자동)와 방출·자유계약 시장(⑥에서 영입)이 동작하며, 연봉 협상·FA·외국인·드래프트는 후속 업데이트에서 추가됩니다
```

- [ ] **Step 3: 빌드와 전체 테스트**

```bash
npm run build
npm test
ls dist/game/contract/release.js
node -e "Promise.all([import('./dist/model.js'),import('./dist/offseason-ui.js'),import('./dist/game/contract/release.js')]).then(()=>console.log('dist ok'))"
```

Expected: 빌드 성공, 테스트 전부 PASS, `dist ok`

- [ ] **Step 4: 커밋**

```bash
git add README.md docs/superpowers/specs/2026-09-29-contract-system-design.md dist
git commit -m "Document retirement numbers and rebuild dist for release and free agency

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(푸시와 PR 생성은 조율자가 한다.)
