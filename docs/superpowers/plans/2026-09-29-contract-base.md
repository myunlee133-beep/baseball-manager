# 계약 시스템 PR 0·PR 1 (데이터 검토 + 기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 연봉 상위 약 50명 데이터를 검토받고(PR 0), 모든 구단을 55명(국내 52 + 외국인 3)으로 채운 뒤 계약·재정(캡·예산) 필드와 6단계 오프시즌 뼈대를 시즌 흐름에 연결한다(PR 1).

**Architecture:** 순수 로직은 `game/contract/` 아래 새 파일(`finance.js`, `league-fill.js`, `offseason.js`, `salary-2026.js`)에 두고, 화면 마크업은 루트 `offseason-ui.js`(기존 `game-ui.js` 방식)에 둔다. `game/league-season.js`의 `startNextSeason`을 `closeSeason`/`ageLeague`/`prepareNextSeason`으로 나눠 오프시즌 단계 사이에 끼운다. `model.js`는 `initialState`·`loadState`·저장 키만, `app.js`는 메뉴·종료 모달·클릭 처리만 최소 수정한다.

**Tech Stack:** 브라우저용 순수 ES 모듈 JS, Node 내장 `node:test`(`npm test`), localStorage. 패키지 추가 없음.

**Spec:** [`docs/superpowers/specs/2026-09-29-contract-system-design.md`](../specs/2026-09-29-contract-system-design.md) (특히 "PR 1 상세: 기반")

## Global Constraints

- `AGENTS.md` 준수: 작업마다 브랜치 하나·PR 하나, 브랜치 이름 `feat/…`, 새 로직은 새 파일, `model.js`·`app.js`는 한 줄 압축 포맷을 유지하고 필요한 곳만 고친다(전체 재포맷 금지), `vendor/`와 `build-engine`이 만드는 엔진 파일(`game/engine.js`, `game/play.js` 등)·`game/kbo-2026.js`(생성물) 수정 금지.
- 금액 단위는 **만 원**. 1억 = 10,000. 모든 재정 수치는 `game/contract/finance.js`의 `FIN` 한 곳에만 둔다.
- 저장 키: 본 상태 `dugout-prototype-v4`. v3(`dugout-prototype-v3`)과 v2(`dugout-prototype-v2`)는 읽어서 v4로 옮기고 지운다.
- 로스터 상한 55명(외국인 포함), 국내 52명 + 외국인 3명(투수 2, 타자 1).
- 가상 선수의 `generated: true`는 **화면에 표시하지 않는다**.
- 사용자에게 보이는 문구는 한국어. 화면 규칙은 `DESIGN.md`(CTA는 화면당 민트 버튼 하나, 숫자 셀 tabular-nums, 색은 의미가 있을 때만: 90% 초과 `--gold`, 초과 `--red`).
- `model.js` ↔ `game/contract/finance.js`·`league-fill.js`는 순환 import다. 이 파일들의 **모듈 최상위 코드에서 다른 쪽의 값(`teams`, `teamPlayers`, `positions`, `FIN` 등)을 읽지 않는다**. 함수 안에서만 쓴다. 어느 파일을 먼저 import하느냐에 따라 초기화 전 접근 오류(TDZ)가 난다. 예: `finance.js`를 먼저 import하는 테스트에서 `league-fill.js` 최상위가 `FIN`을 읽으면 실패한다.
- 테스트는 `tests/*.test.mjs`, 스타일은 `import test from 'node:test'; import assert from 'node:assert/strict';`.
- 커밋 메시지: 한 줄 요약 + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `dist/`는 마지막 태스크에서 `npm run build`로만 갱신한다(필요 시 먼저 `npm install`).

## File Structure

| 파일 | 책임 |
|---|---|
| `docs/superpowers/specs/2026-09-29-kbo-2026-salaries.md` (신규, PR 0) | 연봉 상위 약 50명 조사 결과와 출처·확신도 (사용자 검토용) |
| `game/contract/salary-2026.js` (신규, PR 0) | 검토된 값 `SALARY_2026` (선수 id → `{name, salary, kind, years, faYear}`) |
| `game/contract/finance.js` (신규) | `FIN` 상수, 금액 표기, 가치·연차·FA 연도 추정, 적정 연봉, 첫 계약 부여, 캡·예산 계산, 순위 수입 |
| `game/contract/league-fill.js` (신규) | 가상 국내 선수 생성, 외국인 3명 생성·편성, `prepareRoster`, `upgradeToV4` |
| `game/contract/offseason.js` (신규) | 단계 목록, `beginOffseason`, `nextStep`, `rosterProblems` |
| `offseason-ui.js` (신규) | 오프시즌 화면 마크업 `offseasonMarkup` |
| `game/league-season.js` (수정) | `startNextSeason` → `closeSeason` + `ageLeague` + `prepareNextSeason` |
| `model.js` (수정) | `initialState`가 로스터 채우기·계약·재정 포함, 저장 키 v4, `loadState`가 v3·v2를 v4로 이관 |
| `app.js` (수정) | 종료 모달 버튼, 오프시즌 메뉴·화면, 다음 단계 처리, 홈의 [오프시즌 계속] |
| `tests/contract-salary-data.test.mjs`, `tests/contract-finance.test.mjs`, `tests/contract-fill.test.mjs`, `tests/contract-offseason.test.mjs` (신규) | 단위·통합 테스트 |
| `tests/league-season.test.mjs` (수정) | 인원 410 → 550, 저장 키 v4 이관 |

모듈 의존 방향: `app.js` → `offseason-ui.js` → `game/contract/offseason.js` → `game/league-season.js` → `game-bridge.js` → `model.js` → `game/contract/league-fill.js` → `game/contract/finance.js` ⇢ `model.js`(함수 안에서만).

---

## PR 0: 실제 연봉 데이터 검토

### Task 1: 연봉 상위 약 50명 조사 문서와 데이터 파일

**Files:**
- Create: `docs/superpowers/specs/2026-09-29-kbo-2026-salaries.md`
- Create: `game/contract/salary-2026.js`
- Test: `tests/contract-salary-data.test.mjs`

**Interfaces:**
- Produces: `SALARY_2026: { [playerId: string]: { name: string, salary: number /*만 원*/, kind: 'reserve'|'fa', years: number /*2026 포함 남은 연수*/, faYear: number|null } }`

- [ ] **Step 1: 브랜치 준비**

현재 브랜치(설계 문서·이 계획 커밋이 있음)를 PR 0 브랜치로 이름을 바꾼다.

```bash
git fetch github && git rebase github/main
git branch -m feat/contract-salary-data
```

- [ ] **Step 2: 대상 선수 목록 뽑기**

```bash
node -e "import('./game/kbo-2026.js').then(({PLAYERS})=>{const top=[...PLAYERS].sort((a,b)=>b.ovr-a.ovr||(b.faYear?1:0)-(a.faYear?1:0));const pick=new Map();for(const p of PLAYERS)if(p.faYear)pick.set(p.id,p);for(const p of top){if(pick.size>=60)break;pick.set(p.id,p);}for(const p of pick.values())console.log([p.id,p.team,p.name,p.age,p.ovr,p.faYear??''].join('\t'));})"
```

원문 `faYear`가 있는 46명(FA 계약자)과 OVR 상위 선수를 합쳐 약 60명 후보가 나온다. 조사 결과 2026 연봉 상위 약 50명을 남긴다(후보에 없는 고액 연봉자가 조사 중 나오면 추가).

- [ ] **Step 3: 공개 자료 조사와 검토 문서 작성**

각 선수에 대해 2026 연봉(만 원), 계약 종류(`fa` = FA 계약·비FA 다년계약 중, `reserve` = 단년 보류선수 계약), 2026 포함 남은 계약 연수, FA 예정 연도(2026 시즌 뒤 FA면 2026)를 조사한다. 출처는 구단 공식 발표·KBO 공시·주요 언론의 연봉 계약 기사. 계약금·옵션은 연 평균에 포함하지 않고 **해당 연도 연봉**만 적는다. 원문 `faYear`가 있는 선수는 그 값을 그대로 쓴다(스펙: 원문 우선).

`docs/superpowers/specs/2026-09-29-kbo-2026-salaries.md`를 아래 형식으로 쓴다.

```markdown
# 2026 KBO 연봉 상위 선수 (계약 시스템 초기값) — 검토용

계약 시스템 설계(2026-09-29-contract-system-design.md) PR 0. 여기 있는 선수만 실제 연봉을 쓰고, 나머지는 `finance.js` 공식으로 추정한다.

- 금액: 만 원, 2026 연봉(계약금·옵션 제외)
- 종류: fa = FA·다년 계약 중 / reserve = 단년 계약
- 확신도: 상 = 공식 발표·공시 / 중 = 복수 언론 / 하 = 추정·단일 출처

| id | 팀 | 선수 | 2026 연봉 | 종류 | 남은 연수 | FA 연도 | 출처 | 확신도 |
|---|---|---|---|---|---|---|---|---|
| 0-0 | KT 위즈 | 고영표 | (조사값) | fa | (조사값) | 2028 | (URL 또는 기사명) | 상 |
```

- [ ] **Step 4: 데이터 파일 작성**

검토 문서의 표와 같은 값으로 `game/contract/salary-2026.js`를 쓴다.

```js
// game/contract/salary-2026.js
// 2026 KBO 연봉 상위 선수 실제값. 근거는 docs/superpowers/specs/2026-09-29-kbo-2026-salaries.md.
// 금액은 만 원. 여기 없는 선수는 finance.js 공식으로 추정한다.
export const SALARY_2026={
  '0-0':{name:'고영표',salary:0,kind:'fa',years:0,faYear:2028}, // 조사값으로 채운다
};
```

(위 한 줄은 형식 예시다. 실제 파일에는 조사한 약 50명 전원을 같은 형식으로 넣고 0을 남기지 않는다.)

- [ ] **Step 5: 형식 검증 테스트 작성**

```js
// tests/contract-salary-data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {SALARY_2026} from '../game/contract/salary-2026.js';
import {PLAYERS} from '../game/kbo-2026.js';

test('실제 연봉 데이터: 약 50명, 선수 id·이름 일치, 값이 유효하고 원문 faYear와 같다',()=>{
  const byId=new Map(PLAYERS.map(p=>[p.id,p])),rows=Object.entries(SALARY_2026);
  assert.ok(rows.length>=40&&rows.length<=60,`${rows.length}명`);
  for(const [id,r] of rows){
    const p=byId.get(id);
    assert.ok(p,`${id} 없음`);
    assert.equal(r.name,p.name,id);
    assert.ok(Number.isInteger(r.salary)&&r.salary>=3000,`${id} 연봉 ${r.salary}`);
    assert.ok(['reserve','fa'].includes(r.kind),`${id} 종류`);
    assert.ok(Number.isInteger(r.years)&&r.years>=1,`${id} 연수`);
    assert.ok(r.faYear===null||(Number.isInteger(r.faYear)&&r.faYear>=2026),`${id} FA 연도`);
    if(p.faYear)assert.equal(r.faYear,p.faYear,`${id} 원문 faYear와 다름`);
  }
});
```

- [ ] **Step 6: 테스트 실행**

Run: `node --test tests/contract-salary-data.test.mjs`
Expected: PASS. 실패하면 메시지의 id를 문서·데이터 양쪽에서 고친다.

- [ ] **Step 7: 전체 테스트와 커밋**

Run: `npm test`
Expected: 전부 PASS

```bash
git add docs/superpowers/specs/2026-09-29-kbo-2026-salaries.md game/contract/salary-2026.js tests/contract-salary-data.test.mjs docs/superpowers/specs/2026-09-29-contract-system-design.md docs/superpowers/plans/2026-09-29-contract-base.md
git commit -m "Add 2026 top-salary data for contract system review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: 사용자 검토 (게이트)**

검토 문서를 사용자에게 보여주고 확신도 "하" 선수와 연봉 합계가 큰 팀을 짚는다. 수정 요청을 반영한 뒤 사용자 승인을 받으면 PR을 연다(`gh pr create`, 본문에 설계 문서·검토 문서 링크). **PR 0이 머지되기 전에는 Task 2로 넘어가지 않는다.**

---

## PR 1: 기반

### Task 2: 재정 모듈 (`finance.js`)

**Files:**
- Create: `game/contract/finance.js`
- Test: `tests/contract-finance.test.mjs`

**Interfaces:**
- Consumes: `SALARY_2026` (Task 1), `teams`, `teamPlayers(state, i)` (`model.js`)
- Produces:
  - `FIN` 상수 객체
  - `money(v: number): string` — `3000 → '3,000만'`, `12000 → '1.2억'`, `1400000 → '140억'`
  - `ovrValue(p): number`, `serviceFactor(years): number`, `entryOf(p): 'hs'|'college'`, `serviceYears(p): number`, `estimateFaYear(p, year): number`, `fairSalary(p, value?): number`
  - `assignContract(p, year): p` — `contract`·`entry`·`faYear`가 없으면 채운다(외국인은 `entry`/`faYear`만 건드리지 않음)
  - `domesticPayroll(players): number`, `foreignPayroll(players): number`
  - `createFinance(): {cap, teams: {[i]: {support, income}}}`
  - `teamFinance(state, i): {cap, capUsed, capRoom, budget, budgetUsed, budgetRoom, count}`
  - `canAfford(state, i, {salary, foreign?, replacing?}): {ok: boolean, reason: string}`
  - `rankIncome(rank: 1..10): number`, `settleIncome(state, order: number[]): void`

- [ ] **Step 1: 브랜치 준비**

PR 0 머지 후:

```bash
git fetch github && git checkout -b feat/contract-base github/main
```

- [ ] **Step 2: 실패하는 테스트 작성**

```js
// tests/contract-finance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {FIN,money,ovrValue,serviceFactor,serviceYears,estimateFaYear,fairSalary,assignContract,domesticPayroll,foreignPayroll,createFinance,teamFinance,canAfford,rankIncome,settleIncome} from '../game/contract/finance.js';

test('금액 표기(만 원 단위)',()=>{
  assert.equal(money(3000),'3,000만');
  assert.equal(money(12000),'1.2억');
  assert.equal(money(1400000),'140억');
});

test('가치와 연차 계수',()=>{
  assert.equal(ovrValue({ovr:45}),0);
  assert.equal(ovrValue({ovr:40}),0);
  assert.equal(ovrValue({ovr:60}),3);
  assert.equal(serviceFactor(1),.2);
  assert.equal(serviceFactor(3),.2);
  assert.equal(serviceFactor(4),.4);
  assert.equal(serviceFactor(6),.4);
  assert.equal(serviceFactor(7),.6);
});

test('연차는 입단 나이와 27세 이상 군 복무 2년으로 추정한다',()=>{
  assert.equal(serviceYears({id:'a',age:25,entry:'hs'}),6);
  assert.equal(serviceYears({id:'a',age:30,entry:'college'}),5);
  assert.equal(serviceYears({id:'a',age:18,entry:'hs'}),0);
});

test('FA 연도 추정: 남은 시즌만큼 뒤, 이미 지났으면 4시즌 주기',()=>{
  assert.equal(estimateFaYear({id:'a',age:25,entry:'hs'},2026),2027);
  assert.equal(estimateFaYear({id:'a',age:19,entry:'hs'},2026),2033);
  assert.equal(estimateFaYear({id:'a',age:30,entry:'college'},2026),2027);
  assert.equal(estimateFaYear({id:'a',age:33,entry:'hs'},2026),2029);
});

test('적정 연봉 = 가치 × 5억 × 연차 계수, 최저 3,000만',()=>{
  assert.equal(fairSalary({id:'a',age:25,entry:'hs',ovr:60}),60000);
  assert.equal(fairSalary({id:'a',age:20,entry:'hs',ovr:40}),FIN.minSalary);
});

test('첫 계약: 조사 데이터가 없으면 보류 1년 적정 연봉, 원문 faYear는 유지, 외국인은 건드리지 않음',()=>{
  const p=assignContract({id:'zz-1',age:25,entry:'hs',ovr:60,faYear:2028},2026);
  assert.deepEqual(p.contract,{salary:60000,years:1,kind:'reserve'});
  assert.equal(p.faYear,2028);
  const g=assignContract({id:'zz-2',age:21,ovr:35,generated:true},2026);
  assert.ok(g.contract.salary>=3000&&g.contract.salary<=4000);
  assert.ok(['hs','college'].includes(g.entry));
  const f={id:'zz-3',foreign:true,faYear:null,contract:{salary:182000,years:1,kind:'foreign',usd:130}};
  assert.deepEqual(assignContract(structuredClone(f),2026),f);
});

const fake=()=>({players:[{contract:{salary:1390000}},{foreign:true,contract:{salary:200000}}],league:{},finance:createFinance()});

test('캡은 국내 선수만, 예산은 외국인 포함',()=>{
  const s=fake();
  assert.equal(domesticPayroll(s.players),1390000);
  assert.equal(foreignPayroll(s.players),200000);
  const t=teamFinance(s,0);
  assert.equal(t.cap,1400000);
  assert.equal(t.capRoom,10000);
  assert.equal(t.budget,FIN.support[0]+FIN.firstYearIncome);
  assert.equal(t.budgetRoom,t.budget-1590000);
  assert.equal(t.count,2);
});

test('하드캡·예산을 넘는 계약은 불가, 사유를 돌려준다',()=>{
  const s=fake();
  assert.deepEqual(canAfford(s,0,{salary:20000}),{ok:false,reason:'캡 초과 1억'});
  assert.deepEqual(canAfford(s,0,{salary:20000,replacing:15000}),{ok:true,reason:''});
  assert.deepEqual(canAfford(s,0,{salary:5000}),{ok:true,reason:''});
  s.finance.teams[0].income=0;s.finance.teams[0].support=1600000;
  assert.deepEqual(canAfford(s,0,{salary:20000,foreign:true}),{ok:false,reason:'예산 초과 1억'});
});

test('순위 수입: 1위 20억부터 2억씩, 정산은 순위 순 팀 번호로',()=>{
  assert.equal(rankIncome(1),200000);
  assert.equal(rankIncome(10),20000);
  const s={finance:createFinance()};
  settleIncome(s,[3,0,1,2,4,5,6,7,8,9]);
  assert.equal(s.finance.teams[3].income,200000);
  assert.equal(s.finance.teams[0].income,180000);
  assert.equal(s.finance.teams[9].income,20000);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/contract-finance.test.mjs`
Expected: FAIL (`Cannot find module '.../game/contract/finance.js'`)

- [ ] **Step 4: 구현**

```js
// game/contract/finance.js
/** 계약·재정: 연봉 산정, 하드캡, 구단 예산. 금액 단위는 모두 만 원(1억 = 10,000). */
import {teams,teamPlayers} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다
import {SALARY_2026} from './salary-2026.js';

export const FIN={
  cap:1400000,                    // 140억. 국내 선수 전원 연봉 합계 상한(하드캡). 외국인 제외
  minSalary:3000,                 // 최저연봉 3,000만
  marketUnit:50000,               // 가치 1당 시장단가 5억
  service:[[3,.2],[6,.4],[Infinity,.6]], // 연차 상한 → 계수 (FA 전 협상력)
  // 모기업 지원금(팀 번호 순: KT 삼성 한화 SSG 키움 NC LG 롯데 두산 KIA). 상 170억 / 중 150억 / 하 120억
  support:[1500000,1700000,1500000,1700000,1200000,1500000,1700000,1500000,1500000,1700000],
  rankTop:200000,rankStep:20000,  // 순위 수입 1위 20억, 한 계단마다 2억 감소
  firstYearIncome:100000,         // 전년 순위가 없는 첫 시즌 10억
  krwPerUsd:.14,                  // 1달러 = 1,400원 = 0.14만 원
  generatedSalary:[3000,4000],    // 가상 선수 연봉 범위
  entryAge:{hs:19,college:23},faSeasons:{hs:8,college:7},refaSeasons:4,
  militaryAge:27,militaryYears:2, // 27세 이상은 군 복무 2년을 뺀다(추정)
};

const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;};

export const money=v=>v>=10000?`${Number((v/10000).toFixed(1))}억`:`${Math.round(v).toLocaleString('ko-KR')}만`;
export const ovrValue=p=>Math.max(0,(p.ovr-45)/5);
export const serviceFactor=years=>FIN.service.find(([max])=>years<=max)[1];
export const entryOf=p=>p.entry??(hash(`${p.id}:entry`)<.6?'hs':'college');
export const serviceYears=p=>Math.max(0,p.age-FIN.entryAge[entryOf(p)]-(p.age>=FIN.militaryAge?FIN.militaryYears:0));
/** 이번 시즌이 끝난 뒤 FA가 되면 year. 자격 시즌 수를 이미 넘긴 선수는 4시즌 재자격 주기로 본다. */
export function estimateFaYear(p,year){
  const left=FIN.faSeasons[entryOf(p)]-(serviceYears(p)+1);
  if(left>=0)return year+left;
  const over=-left%FIN.refaSeasons;
  return year+(over?FIN.refaSeasons-over:0);
}
export const fairSalary=(p,value=ovrValue(p))=>Math.max(FIN.minSalary,Math.round(value*FIN.marketUnit*serviceFactor(serviceYears(p))/100)*100);

/** 계약 필드가 없는 선수에게 첫 계약을 붙인다. 실제 조사값 → 원문 faYear → 추정 순. 외국인 계약은 league-fill 이 만든다. */
export function assignContract(p,year){
  if(p.foreign||p.contract)return p;
  const real=SALARY_2026[p.id];
  p.entry=entryOf(p);
  p.faYear=p.faYear??real?.faYear??estimateFaYear(p,year);
  const [lo,hi]=FIN.generatedSalary;
  const salary=real?.salary??(p.generated?lo+Math.round(hash(`${p.id}:pay`)*(hi-lo)/100)*100:fairSalary(p));
  p.contract={salary,years:real?.years??1,kind:real?.kind??'reserve'};
  return p;
}

export const domesticPayroll=players=>players.reduce((s,p)=>s+(p.foreign?0:p.contract?.salary??0),0);
export const foreignPayroll=players=>players.reduce((s,p)=>s+(p.foreign?p.contract?.salary??0:0),0);
export const createFinance=()=>({cap:FIN.cap,teams:Object.fromEntries(teams.map((_,i)=>[i,{support:FIN.support[i],income:FIN.firstYearIncome}]))});

export function teamFinance(state,i){
  const players=teamPlayers(state,i),f=state.finance.teams[i],dom=domesticPayroll(players),fx=foreignPayroll(players),budget=f.support+f.income;
  return {cap:state.finance.cap,capUsed:dom,capRoom:state.finance.cap-dom,budget,budgetUsed:dom+fx,budgetRoom:budget-dom-fx,count:players.length};
}
/** 계약을 맺으면 캡·예산을 넘는지. replacing은 이 계약으로 사라지는 기존 연봉(재계약 등). */
export function canAfford(state,i,{salary,foreign=false,replacing=0}){
  const t=teamFinance(state,i),extra=salary-replacing;
  if(!foreign&&extra>t.capRoom)return {ok:false,reason:`캡 초과 ${money(extra-t.capRoom)}`};
  if(extra>t.budgetRoom)return {ok:false,reason:`예산 초과 ${money(extra-t.budgetRoom)}`};
  return {ok:true,reason:''};
}
export const rankIncome=rank=>FIN.rankTop-(rank-1)*FIN.rankStep;
/** order: 최종 순위 순서의 팀 번호 배열. 다음 시즌 예산의 순위 수입을 정한다. */
export function settleIncome(state,order){order.forEach((team,k)=>{state.finance.teams[team].income=rankIncome(k+1);});}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/contract-finance.test.mjs`
Expected: PASS (9 tests). `assignContract` 첫 케이스가 실패하면 `zz-1`이 `SALARY_2026`에 없는지 확인한다(없어야 한다).

- [ ] **Step 6: 커밋**

```bash
git add game/contract/finance.js tests/contract-finance.test.mjs
git commit -m "Add contract finance module: salary estimate, hard cap, club budget

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 로스터 채우기 (`league-fill.js`)

**Files:**
- Create: `game/contract/league-fill.js`
- Test: `tests/contract-fill.test.mjs`

**Interfaces:**
- Consumes: `ovr(p)`, `potCap(pot, current)` (`game/player-ratings.js`), `rngFrom(seed)` (루트 `engine.js`), `assignContract`, `createFinance`, `FIN` (Task 2), `teams` (`model.js`, 함수 안에서만)
- Produces:
  - `FILL` 상수 (`domestic: 52`, `max: 55`, 범위들)
  - `fillTeam(roster: Player[], teamIndex: number, {year=2026, foreignGroup='first'}): Player[]` — 제자리 변경. 가상 국내 선수를 52명까지 뒤에 붙이고, 외국인이 없으면 3명을 **앞에** 붙인다
  - `prepareRoster(roster, teamIndex, opts)` — `fillTeam` 후 전원 `assignContract`
  - `upgradeToV4(state): state` — v3/v2 저장을 v4로 (AI 외국인 1군, 내 팀 외국인 2군, `finance`, `offseason: null`, `version: 4`)
  - 선수 필드: 가상 선수 `generated: true`, id `'{팀}-g{n}'` / 외국인 `foreign: true`, id `'{팀}-f{n}'`, `contract: {salary, years: 1, kind: 'foreign', usd}` (`usd`는 만 달러)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/contract-fill.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYERS} from '../game/kbo-2026.js';
import {teams,teamPlayers,teamSetup} from '../model.js';
import {fillTeam,prepareRoster,upgradeToV4,FILL} from '../game/contract/league-fill.js';

const rosterOf=i=>structuredClone(PLAYERS.filter(p=>p.teamIndex===i));
const filled=teams.map((_,i)=>prepareRoster(rosterOf(i),i));
const all=filled.flat();

test('모든 구단 55명 = 국내 52 + 외국인 3(투수 2·타자 1), 실제 410명 유지, id 중복 없음',()=>{
  for(const r of filled){
    assert.equal(r.length,55);
    const f=r.filter(p=>p.foreign);
    assert.equal(f.length,3);
    assert.equal(f.filter(p=>p.pitcher).length,2);
  }
  const ids=new Set(all.map(p=>p.id));
  assert.equal(ids.size,550);
  for(const p of PLAYERS)assert.ok(ids.has(p.id),p.id);
  assert.equal(all.filter(p=>p.generated).length,110);
});

test('가상 선수는 2군 뎁스: OVR 30~42, 19~27세, POT ≥ OVR, 계약 3,000만~4,000만',()=>{
  for(const p of all.filter(p=>p.generated)){
    assert.equal(p.group,'second');
    assert.ok(p.ovr>=FILL.depthOvr[0]&&p.ovr<=FILL.depthOvr[1],`${p.id} ${p.ovr}`);
    assert.ok(p.age>=19&&p.age<=27);
    assert.ok(p.pot>=p.ovr&&p.pot<=80);
    assert.ok(p.contract.salary>=3000&&p.contract.salary<=4000);
    assert.ok(p.name.length>=2);
  }
});

test('가상 선수는 부족한 쪽부터: 투수·야수 모두 26명 또는 원래 인원을 넘겨 채우지 않는다',()=>{
  filled.forEach((r,i)=>{
    const orig=PLAYERS.filter(p=>p.teamIndex===i),dom=r.filter(p=>!p.foreign);
    const n=(a,pitcher)=>a.filter(p=>p.pitcher===pitcher).length;
    assert.ok(n(dom,true)<=Math.max(26,n(orig,true)),`${teams[i]} 투수`);
    assert.ok(n(dom,false)<=Math.max(26,n(orig,false)),`${teams[i]} 야수`);
  });
});

test('외국인 등급: 1선발 63~68, 2선발 58~63, 타자 59~65, 최댓값 ≤ 국내 5위 OVR',()=>{
  const fifth=[...PLAYERS].map(p=>p.ovr).sort((a,b)=>b-a)[4];
  for(const r of filled){
    const [ace,sp2]=r.filter(p=>p.foreign&&p.pitcher).sort((a,b)=>b.ovr-a.ovr),bat=r.find(p=>p.foreign&&!p.pitcher);
    assert.ok(ace.ovr>=63&&ace.ovr<=68,`ace ${ace.ovr}`);
    assert.ok(sp2.ovr>=58&&sp2.ovr<=63,`sp2 ${sp2.ovr}`);
    assert.ok(bat.ovr>=59&&bat.ovr<=65,`bat ${bat.ovr}`);
    for(const p of [ace,sp2,bat]){
      assert.ok(p.ovr<=fifth);
      assert.equal(p.pot,p.ovr);
      assert.ok(p.age>=26&&p.age<=33);
      assert.equal(p.contract.kind,'foreign');
      assert.equal(p.contract.salary,p.contract.usd*1400); // 만 달러 × 1,400원 → 만 원
      assert.equal(p.faYear,null);
    }
  }
});

test('새 게임 편성: 외국인이 1군 로테이션·라인업에 들고 1군 인원과 로테이션 5명은 그대로',()=>{
  for(const [i,r] of filled.entries()){
    assert.equal(r.filter(p=>p.group==='first').length,PLAYERS.filter(p=>p.teamIndex===i&&p.group==='first').length);
    const s=teamSetup(r);
    assert.equal(s.rotation.length,5);
    for(const p of r.filter(p=>p.foreign&&p.pitcher))assert.ok(s.rotation.includes(p.id),`${teams[i]} ${p.id}`);
    assert.ok(Object.values(s.field).includes(r.find(p=>p.foreign&&!p.pitcher).id),teams[i]);
  }
});

test('같은 시드면 같은 결과',()=>{
  const again=prepareRoster(rosterOf(4),4);
  assert.deepEqual(again,filled[4]);
});

test('v3 이관: 내 팀 외국인은 2군(편성 유지), AI 외국인은 1군, 재정·오프시즌 필드 추가',()=>{
  const v3={players:rosterOf(0),league:Object.fromEntries(teams.map((_,i)=>[i,rosterOf(i)]).filter(([i])=>i>0)),order:['0-13'],season:{year:2026}};
  const s=upgradeToV4(v3);
  assert.equal(s.version,4);
  assert.deepEqual(s.order,['0-13']);
  assert.equal(s.offseason,null);
  assert.equal(s.finance.cap,1400000);
  assert.equal(s.players.length,55);
  for(const p of s.players.filter(p=>p.foreign))assert.equal(p.group,'second');
  for(const i of [1,9]){
    assert.equal(s.league[i].length,55);
    for(const p of s.league[i].filter(p=>p.foreign))assert.equal(p.group,'first');
  }
  assert.ok(s.players.every(p=>p.contract));
});

test('fillTeam은 이미 채워진 팀을 다시 늘리지 않는다',()=>{
  const r=structuredClone(filled[2]);
  fillTeam(r,2);
  assert.equal(r.length,55);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/contract-fill.test.mjs`
Expected: FAIL (`Cannot find module '.../game/contract/league-fill.js'`)

- [ ] **Step 3: 구현**

```js
// game/contract/league-fill.js
/** 로스터 채우기: 국내 가상 선수(2군 뎁스)와 외국인 3명을 만든다. 팀·연도 시드로 결과가 고정된다. 상태는 제자리 변경한다. */
import {ovr,potCap} from '../player-ratings.js';
import {rngFrom} from '../../engine.js';
import {FIN,assignContract,createFinance} from './finance.js';
import {teams} from '../../model.js'; // 순환 import: 함수 안에서만 쓴다

export const FILL={
  domestic:52,max:55,
  depthOvr:[30,42],depthAge:[19,27],
  depthShape:{
    hitter:{contact:[25,45],eye:[25,45],power:[25,45],speed:[30,55],defense:[30,55]},
    pitcher:{velocity:[35,55],stuff:[30,50],control:[30,50],stamina:[30,60]},
  },
  // 외국인: OVR 스케일(OVR_BASE 평균 47.1, 표준편차 4.45 → OVR 8)에 맞춘 능력치 범위
  foreignShape:{
    pitcher:{velocity:[52,68],stuff:[50,64],control:[42,60],stamina:[50,66]},
    hitter:{contact:[45,60],eye:[42,58],power:[55,72],speed:[30,50],defense:[35,50]},
  },
  foreignSlots:[{slot:'ace',pitcher:true,ovr:[63,68],usd:130},{slot:'sp2',pitcher:true,ovr:[58,63],usd:100},{slot:'bat',pitcher:false,ovr:[59,65],usd:110}],
  foreignAge:[26,33],usdSpread:.15,
  foreignPos:['1B','LF','RF','DH','1B','LF','RF','DH','3B','CF'], // 1B/LF/RF/DH 80%
};
const HIT_POS=['C','1B','2B','3B','SS','LF','CF','RF'];
const RECORD_KEYS=['pa','ab','h','hr','bb','k','doubles','triples','sb','attempts','rbi','avg','obp','slg','ops','babip','iso','bbRate','kRate','g','gs','w','l','sv','hld','outs','ip','ha','r','er','hp','era','whip','k9','bb9','war'];
const SURNAME='김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나'.split('');
const GIVEN='민준서지현우도윤태영성호재진수빈건하은승찬시훈동규원석형탁범'.split('');
const F_FIRST=['제이크','라이언','마이클','케빈','타일러','브랜든','카를로스','호세','루이스','다니엘','저스틴','애런'];
const F_LAST=['밀러','존슨','로페즈','가르시아','윌슨','마르티네스','스미스','테일러','브라운','에르난데스','클라크','라미레스'];

const between=(rng,[lo,hi])=>lo+Math.floor(rng()*(hi-lo+1));
const pick=(rng,a)=>a[Math.floor(rng()*a.length)];
// 1단계 초기 POT 공식의 성장 여지(scripts/kbo-2026/roster.mjs)와 같은 값
const growth=age=>age<=20?25:age===21?22:age===22?18:age===23?14:age===24?11:age===25?7:age===26?4:0;

/** 모양 범위에서 능력치를 뽑아 OVR이 목표 범위에 들 때까지 다시 뽑는다. */
function sampleRatings(rng,pitcher,pos,shape,[lo,hi],tweak=r=>r){
  for(let n=0;n<500;n++){
    const ratings=tweak(Object.fromEntries(Object.entries(shape).map(([k,r])=>[k,between(rng,r)])));
    const o=ovr({pitcher,pos,ratings});
    if(o>=lo&&o<=hi)return ratings;
  }
  throw new Error(`능력치 생성 실패: ${pos} OVR ${lo}~${hi}`);
}
function makePlayer(rng,base){
  const p={name:'',group:'second',role:null,faYear:null,lastSeason:null,energy:100,no:'',injury:'',days:0,...Object.fromEntries(RECORD_KEYS.map(k=>[k,0])),...base,[base.pitcher?'throws':'bats']:rng()<.3?'L':'R'};
  p.ovr=ovr(p);
  return p;
}
function makeDepth(rng,roster,teamIndex,n){
  const dom=roster.filter(p=>!p.foreign),pitcher=dom.filter(p=>p.pitcher).length<FILL.domestic/2;
  const count=pos=>dom.filter(p=>!p.pitcher&&p.pos===pos).length;
  const pos=pitcher?'RP':HIT_POS.reduce((a,b)=>count(b)<count(a)?b:a);
  const age=between(rng,FILL.depthAge);
  const ratings=sampleRatings(rng,pitcher,pos,FILL.depthShape[pitcher?'pitcher':'hitter'],FILL.depthOvr);
  const p=makePlayer(rng,{id:`${teamIndex}-g${n}`,name:pick(rng,SURNAME)+pick(rng,GIVEN)+pick(rng,GIVEN),team:teams[teamIndex],teamIndex,pitcher,pos,age,ratings,generated:true});
  p.pot=potCap(p.ovr+growth(age)+between(rng,[-7,7]),p.ovr);
  return p;
}
function makeForeign(rng,teamIndex,{slot,pitcher,ovr:band,usd},n){
  const pos=pitcher?'SP':pick(rng,FILL.foreignPos);
  // 구속이 빠를수록 제구가 약간 낮다
  const tweak=r=>pitcher?{...r,control:Math.max(20,r.control-Math.round((r.velocity-60)*.3))}:r;
  const ratings=sampleRatings(rng,pitcher,pos,FILL.foreignShape[pitcher?'pitcher':'hitter'],band,tweak);
  const dollars=Math.round(usd*(1+(rng()*2-1)*FILL.usdSpread));
  const p=makePlayer(rng,{id:`${teamIndex}-f${n}`,name:`${pick(rng,F_FIRST)} ${pick(rng,F_LAST)}`,team:teams[teamIndex],teamIndex,pitcher,pos,role:pitcher?'SP':'주전',age:between(rng,FILL.foreignAge),ratings,foreign:true,
    contract:{salary:Math.round(dollars*10000*FIN.krwPerUsd),years:1,kind:'foreign',usd:dollars},slot}); // FIN은 순환 import라 모듈 최상위가 아닌 여기서 읽는다
  p.pot=p.ovr;
  return p;
}
/** 1군에 외국인을 넣은 만큼 같은 유형 최저 OVR 국내 선수를 2군으로 내리고, 외국인 선발 수만큼 원래 SP 보직을 RP로 바꿔 로테이션 5명을 유지한다. */
function makeRoom(roster,foreigners){
  for(const f of foreigners){
    if(f.pitcher){
      const sp=roster.filter(p=>!p.foreign&&p.group==='first'&&p.role==='SP').sort((a,b)=>a.ovr-b.ovr)[0];
      if(sp)sp.role='RP';
    }
    const out=roster.filter(p=>!p.foreign&&p.group==='first'&&p.pitcher===f.pitcher).sort((a,b)=>a.ovr-b.ovr)[0];
    if(out){out.group='second';if(out.role==='주전')out.role='벤치';}
  }
}

export function fillTeam(roster,teamIndex,{year=2026,foreignGroup='first'}={}){
  const rng=rngFrom(year*100+teamIndex+1);
  let n=0;
  while(roster.filter(p=>!p.foreign).length<FILL.domestic)roster.push(makeDepth(rng,roster,teamIndex,n++));
  if(!roster.some(p=>p.foreign)){
    const foreigners=FILL.foreignSlots.map((s,k)=>makeForeign(rng,teamIndex,s,k));
    for(const f of foreigners)f.group=foreignGroup;
    if(foreignGroup==='first')makeRoom(roster,foreigners);
    roster.unshift(...foreigners); // teamSetup은 배열 앞의 주전을 먼저 수비 위치에 넣는다
  }
  return roster;
}
export function prepareRoster(roster,teamIndex,opts={}){
  fillTeam(roster,teamIndex,opts);
  for(const p of roster)assignContract(p,opts.year??2026);
  return roster;
}
/** v3·v2 저장을 v4로. AI 편성은 경기마다 다시 계산되므로 외국인을 바로 1군에, 내 팀은 편성을 지키려고 2군에 둔다. */
export function upgradeToV4(state){
  const year=state.season?.year??2026;
  teams.forEach((_,i)=>prepareRoster(i?state.league[i]:state.players,i,{year,foreignGroup:i?'first':'second'}));
  state.finance??=createFinance();
  state.offseason??=null;
  state.version=4;
  return state;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/contract-fill.test.mjs`
Expected: PASS (8 tests).
- `능력치 생성 실패`가 나면 해당 모양(`depthShape`/`foreignShape`)의 범위를 목표 OVR 쪽으로 2씩 옮긴다.
- "1군 인원 그대로" 실패: `makeRoom`이 외국인 수만큼 내리는지 확인.
- "외국인 타자가 라인업에" 실패: 외국인이 `roster.unshift`로 앞에 들어가는지, `role`이 `'주전'`인지 확인.

- [ ] **Step 5: 커밋**

```bash
git add game/contract/league-fill.js tests/contract-fill.test.mjs
git commit -m "Fill every club to 55 with depth players and three foreign players

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 새 게임·저장 v4 연결 (`model.js`)

**Files:**
- Modify: `model.js` (7번째 줄 저장 키, `initialState`, `loadState`)
- Modify: `tests/league-season.test.mjs:18`, `tests/league-season.test.mjs:82-95`

**Interfaces:**
- Consumes: `prepareRoster`, `upgradeToV4` (Task 3), `createFinance` (Task 2)
- Produces: `STATE_KEY === 'dugout-prototype-v4'`, `PREV_KEYS = ['dugout-prototype-v3','dugout-prototype-v2']`(기존 `PREV_KEY` 대체), `initialState()`가 `{version:4, finance, offseason:null, ...}`와 55명 로스터를 돌려준다

- [ ] **Step 1: 기존 테스트를 새 기대값으로 고친다 (실패 확인용)**

`tests/league-season.test.mjs` 18번째 줄:

```js
  assert.equal(allPlayers(s).length,550);
```

82~95번째 줄의 v2 이관 테스트를 아래로 바꾼다(첫 줄 import 포함).

```js
import {loadState,STATE_KEY,PREV_KEYS,initialState as fresh4} from '../model.js';

test('v2·v3 저장은 편성 그대로 v4로 옮기고 이전 키를 지운다',()=>{
  assert.equal(STATE_KEY,'dugout-prototype-v4');
  for(const key of PREV_KEYS){
    const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
    const old=fresh4();
    for(const i of Object.keys(old.league))old.league[i]=old.league[i].filter(p=>!p.generated&&!p.foreign);
    old.players=old.players.filter(p=>!p.generated&&!p.foreign);
    for(const p of [...old.players,...Object.values(old.league).flat()])delete p.contract;
    delete old.finance;delete old.offseason;delete old.version;
    old.order=[...old.order].reverse();
    mem.set(key,JSON.stringify(old));
    const {state}=loadState(storage);
    assert.equal(state.version,4,key);
    assert.deepEqual(state.order,old.order,key);
    assert.equal(state.players.length,55,key);
    assert.ok(state.finance,key);
    assert.equal(mem.has(key),false,key);
  }
});
```

(기존 82~95번째 줄의 내용을 먼저 열어 보고, 그 테스트 블록 전체를 위 블록으로 교체한다. 파일 위쪽의 다른 import와 이름이 겹치지 않게 `initialState`는 `fresh4`로 가져온다.)

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/league-season.test.mjs`
Expected: FAIL (`allPlayers(s).length` 410 ≠ 550, `PREV_KEYS` undefined)

- [ ] **Step 3: `model.js` 수정**

1번째 줄 import 뒤에 한 줄 추가:

```js
import {prepareRoster,upgradeToV4} from './game/contract/league-fill.js';import {createFinance} from './game/contract/finance.js';
```

7번째 줄의 `STATE_KEY`·`PREV_KEY` 선언을 교체:

```js
export const STATE_KEY='dugout-prototype-v4',PREV_KEYS=['dugout-prototype-v3','dugout-prototype-v2'],LEGACY_KEYS=['dugout-prototype-v1','dugout-active-game-v1'];
```

`initialState`를 교체(한 줄 유지):

```js
export function initialState(){const all=structuredClone(PLAYERS),rosters=teams.map((_,i)=>prepareRoster(all.filter(p=>p.teamIndex===i),i)),players=rosters[0],setup=teamSetup(players);return {version:4,players,league:Object.fromEntries(rosters.map((r,i)=>[i,r]).filter(([i])=>i>0)),...setup,strategy:{size:'5인',mode:'체력 우선',next:setup.rotation[0],relief:'중요 상황에서만'},finance:createFinance(),offseason:null};}
```

`loadState`에서 `PREV_KEY` 한 개를 읽던 `try{const prev=...}catch{}` 부분을 `PREV_KEYS` 반복으로 교체(한 줄 유지):

```js
export function loadState(storage){const legacy=LEGACY_KEYS.some(k=>storage.getItem(k)!==null);for(const k of LEGACY_KEYS)storage.removeItem(k);try{const saved=JSON.parse(storage.getItem(STATE_KEY));if(saved?.league)return {state:saved,reset:false};}catch{}for(const key of PREV_KEYS){try{const prev=JSON.parse(storage.getItem(key));storage.removeItem(key);if(prev?.league)return {state:upgradeToV4(prev),reset:false};}catch{}}return {state:initialState(),reset:legacy};}
```

`PREV_KEY`를 쓰는 다른 곳이 없는지 확인:

Run: `grep -rn "PREV_KEY\b" --include=*.js --include=*.mjs . | grep -v node_modules | grep -v dist/`
Expected: 출력 없음

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS. 기존 테스트(`model`, `game-bridge`, `season-*`, `league-data`)가 55명 로스터와 외국인 편성에서도 통과해야 한다. 실패하면 어느 테스트가 실제 선수 id나 인원을 가정하는지 보고, 가정이 테스트 쪽 문제면 테스트를 고치고 이유를 커밋 메시지에 적는다.

- [ ] **Step 5: 커밋**

```bash
git add model.js tests/league-season.test.mjs
git commit -m "Start new games with 55-man rosters and finance; migrate v2/v3 saves to v4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 시즌 전환 3분할 (`league-season.js`)

**Files:**
- Modify: `game/league-season.js` (`startNextSeason`, 103~113번째 줄 근처)
- Test: `tests/contract-offseason.test.mjs` (이 태스크에서 새로 만들고 Task 6에서 이어 쓴다)

**Interfaces:**
- Produces: `closeSeason(state)`, `ageLeague(state)`, `prepareNextSeason(state)`. `startNextSeason(state)`는 셋을 차례로 부른다(기존 동작 유지)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/contract-offseason.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {ensureSeason,hooks,closeSeason,ageLeague,prepareNextSeason} from '../game/league-season.js';

const ended=()=>{const s=ensureSeason(initialState());s.season.phase='ended';return s;};

test('시즌 마감은 성적만 보관하고 나이는 그대로',()=>{
  const s=ended(),p=s.players[0],age=p.age;
  p.stats.batting={pa:4,h:1};
  closeSeason(s);
  assert.deepEqual(p.history[2026].batting,{pa:4,h:1});
  assert.deepEqual(p.stats,{batting:{},pitching:{}});
  assert.equal(p.age,age);
  assert.equal(s.season.year,2026);
});

test('노화는 나이 +1, 체력 100, offseasonTick 한 번',()=>{
  const s=ended(),p=s.league[3][0],age=p.age,orig=hooks.offseasonTick;let calls=0;
  p.energy=40;
  hooks.offseasonTick=()=>{calls++;};
  try{ageLeague(s);}finally{hooks.offseasonTick=orig;}
  assert.equal(p.age,age+1);
  assert.equal(p.energy,100);
  assert.equal(calls,1);
});

test('새 시즌 준비는 다음 연도 개막 전으로',()=>{
  const s=ended();
  prepareNextSeason(s);
  assert.equal(s.season.year,2027);
  assert.equal(s.season.phase,'preseason');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/contract-offseason.test.mjs`
Expected: FAIL (`closeSeason` is not exported)

- [ ] **Step 3: 구현**

`game/league-season.js`의 `startNextSeason` 함수 전체를 아래로 교체:

```js
/** ① 시즌 마감: 올해 성적을 history[연도]로 옮긴다. 나이·일정은 그대로. */
export function closeSeason(state){
  const year=state.season.year;
  for(const p of allPlayers(state)){
    if(Object.keys(p.stats.batting).length||Object.keys(p.stats.pitching).length)p.history[year]=p.stats;
    p.stats=blankStats();
  }
}
/** 노화: 나이 +1, 체력 회복, 3단계 성장·퇴화 훅. 오프시즌 ②와 ③ 사이에서 부른다. */
export function ageLeague(state){
  for(const p of allPlayers(state)){p.age+=1;p.energy=100;p.lastPlayed=null;p.streak=0;}
  hooks.offseasonTick(state);
}
/** 새 시즌 준비: 지난 박스스코어 삭제, 다음 연도 일정·순위. 오프시즌 ⑥ 뒤에 부른다. */
export function prepareNextSeason(state){
  const year=state.season.year;
  dropBoxes(year);
  const autoRestMine=state.season.autoRestMine;
  state.season={...createSeason(year+1),autoRestMine};
  state.strategy.next=state.rotation[0]??'';
}
export function startNextSeason(state){closeSeason(state);ageLeague(state);prepareNextSeason(state);}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/contract-offseason.test.mjs tests/league-season.test.mjs`
Expected: PASS (기존 `startNextSeason` 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add game/league-season.js tests/contract-offseason.test.mjs
git commit -m "Split season rollover into close, aging and next-season steps for the offseason

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 오프시즌 단계 진행 (`offseason.js`)

**Files:**
- Create: `game/contract/offseason.js`
- Test: `tests/contract-offseason.test.mjs` (Task 5 파일에 이어서 추가)

**Interfaces:**
- Consumes: `standings`, `closeSeason`, `ageLeague`, `prepareNextSeason` (Task 5), `settleIncome` (Task 2), `FILL.max` (Task 3), `teams`, `teamPlayers`, `positions` (`model.js`)
- Produces:
  - `STEPS = ['close','retire','salary','fa','foreign','roster']`, `STEP_LABELS`
  - `beginOffseason(state): boolean` — `phase==='ended'`이고 오프시즌이 없을 때만. 순위 수입 정산, `closeSeason`, `state.offseason = {step:'close', year, finalOrder, log}`
  - `nextStep(state): boolean` — `retire`에서 넘어갈 때 `ageLeague`, `roster`에서 넘어갈 때 55명 초과 구단이 있으면 `false`, 아니면 `prepareNextSeason` 후 `state.offseason = null`
  - `rosterProblems(state): {over: {team, count}[], warnings: string[]}`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/contract-offseason.test.mjs` 맨 아래에 추가하고, 파일 위 import에 한 줄 더한다.

```js
import {STEPS,beginOffseason,nextStep,rosterProblems} from '../game/contract/offseason.js';
```

```js
test('시즌이 끝나지 않았으면 오프시즌을 시작할 수 없다',()=>{
  const s=ensureSeason(initialState());
  assert.equal(beginOffseason(s),false);
  assert.equal(s.offseason,null);
});

test('①~⑥ 진행: 수입 정산, 노화는 ②→③에서 한 번, 끝나면 다음 시즌 개막 전',()=>{
  const s=ended(),p=s.players[0],age=p.age,orig=hooks.offseasonTick;let calls=0;
  hooks.offseasonTick=()=>{calls++;};
  try{
    assert.equal(beginOffseason(s),true);
    assert.equal(beginOffseason(s),false);
    assert.equal(s.offseason.step,'close');
    assert.equal(s.finance.teams[s.offseason.finalOrder[0]].income,200000);
    assert.equal(s.finance.teams[s.offseason.finalOrder[9]].income,20000);
    const seen=[s.offseason.step];
    while(s.offseason&&s.offseason.step!=='roster'){assert.equal(nextStep(s),true);seen.push(s.offseason.step);if(s.offseason.step==='salary')assert.equal(p.age,age+1);}
    assert.deepEqual(seen,STEPS);
    assert.equal(calls,1);
    assert.equal(nextStep(s),true);
    assert.equal(s.offseason,null);
    assert.equal(s.season.year,2027);
    assert.equal(s.season.phase,'preseason');
    assert.equal(p.age,age+1);
  }finally{hooks.offseasonTick=orig;}
});

test('55명을 넘는 구단이 있으면 새 시즌으로 넘어가지 않는다',()=>{
  const s=ended();
  beginOffseason(s);
  while(s.offseason.step!=='roster')nextStep(s);
  s.league[3].push({...structuredClone(s.league[3].at(-1)),id:'3-extra'});
  assert.deepEqual(rosterProblems(s).over,[{team:3,count:56}]);
  assert.equal(nextStep(s),false);
  assert.equal(s.offseason.step,'roster');
  assert.equal(s.season.year,2026);
});

test('내 팀 편성 경고: 빈 수비 위치, 선발 5명 미만',()=>{
  const s=ended();
  s.field.C=null;s.rotation=s.rotation.slice(0,3);
  assert.deepEqual(rosterProblems(s).warnings,['비어 있는 수비 위치: C','선발 로테이션 3명']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/contract-offseason.test.mjs`
Expected: FAIL (`Cannot find module '.../game/contract/offseason.js'`)

- [ ] **Step 3: 구현**

```js
// game/contract/offseason.js
/** 오프시즌 단계 진행. 시즌 종료(phase 'ended') 뒤 ①~⑥을 거쳐 다음 시즌 개막 전으로 넘어간다. 상태는 제자리 변경한다. */
import {standings,closeSeason,ageLeague,prepareNextSeason} from '../league-season.js';
import {teams,teamPlayers,positions} from '../../model.js';
import {settleIncome} from './finance.js';
import {FILL} from './league-fill.js';

export const STEPS=['close','retire','salary','fa','foreign','roster'];
export const STEP_LABELS={close:'시즌 마감',retire:'은퇴·방출',salary:'연봉 협상',fa:'FA',foreign:'외국인 계약',roster:'로스터 확정'};

export function beginOffseason(state){
  if(state.season.phase!=='ended'||state.offseason)return false;
  const order=standings(state).map(r=>r.team),year=state.season.year;
  settleIncome(state,order);
  closeSeason(state);
  state.offseason={step:'close',year,finalOrder:order,log:[`${year} 시즌 종료 · 1위 ${teams[order[0]]}`]};
  return true;
}
export function rosterProblems(state){
  const over=teams.map((_,team)=>({team,count:teamPlayers(state,team).length})).filter(t=>t.count>FILL.max);
  const warnings=[],empty=positions.filter(p=>!state.field[p]);
  if(empty.length)warnings.push(`비어 있는 수비 위치: ${empty.join(', ')}`);
  if(state.rotation.length<5)warnings.push(`선발 로테이션 ${state.rotation.length}명`);
  return {over,warnings};
}
/** 다음 단계로. ②를 떠날 때 노화, ⑥을 떠날 때 55명 검사 후 새 시즌 준비. 넘어가지 못하면 false. */
export function nextStep(state){
  const o=state.offseason;
  if(!o)return false;
  if(o.step==='roster'){
    if(rosterProblems(state).over.length)return false;
    prepareNextSeason(state);
    state.offseason=null;
    return true;
  }
  if(o.step==='retire'){ageLeague(state);o.log.push('선수단 나이 +1 · 성장·노화 반영');}
  o.step=STEPS[STEPS.indexOf(o.step)+1];
  return true;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/contract-offseason.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add game/contract/offseason.js tests/contract-offseason.test.mjs
git commit -m "Add six-step offseason flow with income settlement and 55-man check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 오프시즌 화면 (`offseason-ui.js`, `app.js`)

**Files:**
- Create: `offseason-ui.js`
- Modify: `app.js` (1~3번째 줄 import, 8~9번째 줄 `titles`/`en`, `shell`의 메뉴 배열과 홈 진행 버튼, `render`, `endMarkup`, 클릭 처리의 `nextseason`)
- Test: `tests/contract-offseason.test.mjs` (마크업 테스트 추가)

**Interfaces:**
- Consumes: `STEPS`, `STEP_LABELS`, `rosterProblems`, `beginOffseason`, `nextStep` (Task 6), `teamFinance`, `money` (Task 2), `FILL.max` (Task 3)
- Produces: `offseasonMarkup(state, {tab, panel, standingsTable}): string` — `panel(title, body, right)`와 `standingsTable()`은 `app.js`의 기존 함수를 넘겨받는다

- [ ] **Step 1: 실패하는 마크업 테스트 추가**

`tests/contract-offseason.test.mjs`에 import 한 줄과 테스트를 추가한다.

```js
import {offseasonMarkup} from '../offseason-ui.js';
```

```js
test('오프시즌 화면: 현재 단계 CTA, 앞 단계 잠금, 끝난 단계 ✓, 재정 요약',()=>{
  const s=ended();
  beginOffseason(s);nextStep(s);
  const panel=(t,b)=>`<section><h2>${t}</h2>${b}</section>`;
  const html=offseasonMarkup(s,{tab:null,panel,standingsTable:()=>'<table></table>'});
  assert.match(html,/data-action="nextstep"/);
  assert.match(html,/다음 단계/);
  assert.match(html,/1\. 시즌 마감 ✓/);
  assert.match(html,/data-offtab="fa"[^>]*disabled/);
  assert.match(html,/2026 오프시즌 · 2\. 은퇴·방출/);
  assert.match(html,/샐러리캡/);
  assert.doesNotMatch(html,/generated/);
  while(s.offseason.step!=='roster')nextStep(s);
  assert.match(offseasonMarkup(s,{tab:null,panel,standingsTable:()=>''}),/새 시즌 시작/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/contract-offseason.test.mjs`
Expected: FAIL (`Cannot find module '.../offseason-ui.js'`)

- [ ] **Step 3: `offseason-ui.js` 구현**

```js
// offseason-ui.js
// 오프시즌 화면 마크업. 상태를 바꾸지 않는다. panel·standingsTable 렌더러는 app.js 것을 받아 쓴다.
import {teams} from './model.js';
import {STEPS,STEP_LABELS,rosterProblems} from './game/contract/offseason.js';
import {teamFinance,money} from './game/contract/finance.js';
import {FILL} from './game/contract/league-fill.js';

// 사용액/한도. 90% 초과 --gold, 초과 --red (DESIGN.md 5-2)
const usage=(used,max)=>{const r=used/max,c=r>1?'var(--red)':r>.9?'var(--gold)':'var(--text)';return `<strong style="color:${c};font-variant-numeric:tabular-nums">${money(used)}</strong> <span class="muted">/ ${money(max)}</span>`;};

function stepBody(state,step,{standingsTable,problems}){
  const o=state.offseason;
  if(step==='close'){const rank=o.finalOrder.indexOf(0)+1;return `<p>${teams[0]} 최종 ${rank}위 · 다음 시즌 순위 수입 ${money(state.finance.teams[0].income)}</p>${standingsTable()}`;}
  if(step==='roster'){
    const over=problems.over.length?`<p style="color:var(--red)">55명을 넘는 구단: ${problems.over.map(t=>`${teams[t.team]} ${t.count}명`).join(', ')}</p>`:`<p>모든 구단이 ${FILL.max}명 이하입니다.</p>`;
    const warn=problems.warnings.map(w=>`<p style="color:var(--gold)">${w}</p>`).join('');
    return `${over}${warn}<p class="muted">새 시즌을 시작하면 ${o.year+1} 일정이 만들어집니다.</p>`;
  }
  return '<div class="empty">이 단계는 다음 업데이트에서 추가됩니다.</div>';
}

export function offseasonMarkup(state,{tab,panel,standingsTable}){
  const o=state.offseason,cur=STEPS.indexOf(o.step),show=tab&&STEPS.indexOf(tab)>=0&&STEPS.indexOf(tab)<=cur?tab:o.step;
  const f=teamFinance(state,0),problems=rosterProblems(state),blocked=o.step==='roster'&&problems.over.length>0;
  const context=`${o.year} 오프시즌 · ${cur+1}. ${STEP_LABELS[o.step]} · 캡 여유 ${money(f.capRoom)} · 예산 여유 ${money(f.budgetRoom)} · 로스터 ${f.count}/${FILL.max}`;
  const tabs=`<div class="subtabs" role="tablist" aria-label="오프시즌 단계">${STEPS.map((s,i)=>`<button role="tab" data-offtab="${s}" aria-selected="${show===s}" class="${show===s?'active':''}" ${i>cur?'disabled':''}>${i+1}. ${STEP_LABELS[s]}${i<cur?' ✓':''}</button>`).join('')}</div>`;
  const t=state.finance.teams[0];
  const money_=`<p>샐러리캡 ${usage(f.capUsed,f.cap)}</p><p>예산 ${usage(f.budgetUsed,f.budget)}</p><p>로스터 <strong>${f.count}</strong> <span class="muted">/ ${FILL.max}</span></p><p class="muted">모기업 지원 ${money(t.support)} · 순위 수입 ${money(t.income)}</p>`;
  const news=`<div class="newslist">${[...o.log].reverse().map(l=>`<p>${l}</p>`).join('')}</div>`;
  return `<div class="toolbar"><span class="muted">${context}</span><button class="primary right" data-action="nextstep" ${blocked?'disabled':''}>${o.step==='roster'?'새 시즌 시작':'다음 단계'} <span>▶</span></button></div>${tabs}<div class="rostergrid"><div>${panel(`${STEPS.indexOf(show)+1}. ${STEP_LABELS[show]}`,stepBody(state,show,{standingsTable,problems}))}</div><div>${panel('재정 요약',money_)}${panel('오프시즌 뉴스',news)}</div></div>`;
}
```

- [ ] **Step 4: 마크업 테스트 통과 확인**

Run: `node --test tests/contract-offseason.test.mjs`
Expected: PASS

- [ ] **Step 5: `app.js` 연결 (최소 수정, 한 줄 포맷 유지)**

각 수정 전에 해당 줄을 열어 정확한 문자열을 확인한다.

1. 2번째 줄의 `league-season.js` import 목록에서 `startNextSeason,`을 지운다(더 이상 쓰지 않음). 3번째 줄 끝에 추가:

```js
import {beginOffseason,nextStep} from './game/contract/offseason.js';import {offseasonMarkup} from './offseason-ui.js';
```

2. 6번째 줄 `let view='home',...` 선언 끝(세미콜론 앞)에 `,offTab=null`을 붙인다.

3. 8번째 줄 `titles`에 `,offseason:'오프시즌'`, 9번째 줄 `en`에 `,offseason:'OFFSEASON'`을 추가한다.

4. `shell` 안의 메뉴 배열 `['home','lineup','roster','records','schedule']`을 교체:

```js
['home','lineup','roster','records','schedule',...(state.offseason?['offseason']:[])]
```

5. `shell` 안 홈 헤더의 날짜 진행 묶음 `<div class="advance">…</div>` 전체를 삼항식으로 감싼다(오프시즌 중에는 날짜 진행 대신 계속 버튼):

```js
${state.offseason?'<div class="advance"><button class="primary" data-nav="offseason">오프시즌 계속 <span>▶</span></button></div>':`<div class="advance">…기존 내용 그대로…</div>`}
```

6. `render`의 화면 표에 오프시즌을 추가:

```js
function render(){if(view==='offseason'&&!state.offseason)view='home';document.title=`DUGOUT — ${titles[view]}`;app.innerHTML=shell(({home,lineup,roster,records,schedule:calendar,team:teamView,offseason:()=>offseasonMarkup(state,{tab:offTab,panel,standingsTable:standings})})[view]());}
```

7. `endMarkup`의 버튼을 교체:

```js
<button class="primary" data-action="offseason">오프시즌 시작 →</button>
```

8. 클릭 처리에서 `if(d.action==='nextseason'){…}` 블록 전체를 교체:

```js
if(d.action==='offseason'){beginOffseason(state);save();modal.close();view='offseason';offTab=null;render();}if(d.action==='nextstep'){if(!nextStep(state)){toast('로스터 55명을 넘는 구단이 있어 새 시즌을 시작할 수 없습니다.');return;}save();offTab=null;if(!state.offseason){view='home';toast(`${state.season.year} 시즌 개막 전으로 넘어왔습니다.`);}render();}if(d.offtab){offTab=d.offtab;render();}
```

- [ ] **Step 6: 전체 테스트**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 7: 브라우저 확인**

Run: `npm run dev` 후 http://127.0.0.1:4173

확인 순서(새 게임으로: 개발자 도구 Application → Local Storage에서 `dugout-prototype-v4` 삭제 후 새로고침):
1. 로스터: KT 55명, 외국인 3명이 1군에 있고 가상 선수에 별도 표시가 없다. 라인업: 외국인 선발 2명이 로테이션, 외국인 타자가 수비 위치에 있다.
2. 홈 [시즌 끝]으로 시즌을 끝까지 진행(약 1분) → 종료 모달 버튼이 "오프시즌 시작 →".
3. 누르면 오프시즌 화면: 컨텍스트 줄, 탭 1~6(2~6 잠김), 우측 재정 요약·뉴스, 우상단 민트 [다음 단계] 하나.
4. [다음 단계]로 ②~⑤는 "다음 업데이트에서 추가됩니다", 지난 탭은 ✓와 함께 눌러 볼 수 있다. ③으로 넘어가면 선수 나이가 1 늘었다(로스터 화면).
5. 오프시즌 도중 새로고침 → 홈에 [오프시즌 계속], 메뉴에 "오프시즌", 같은 단계에서 이어진다.
6. ⑥에서 [새 시즌 시작] → 홈, 2027 개막 전, 메뉴에서 오프시즌이 사라진다.

문제가 있으면 고치고 Step 6부터 다시.

- [ ] **Step 8: 커밋**

```bash
git add offseason-ui.js app.js tests/contract-offseason.test.mjs
git commit -m "Add offseason screen with step tabs, finance summary and news

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 초기 연봉 보정, 문서, 빌드, PR

**Files:**
- Modify: `game/contract/finance.js` (`FIN.marketUnit`만, 필요 시)
- Modify: `tests/contract-finance.test.mjs` (보정 테스트 추가)
- Modify: `README.md`
- Regenerate: `dist/` (`npm run build`)

**Interfaces:**
- Consumes: 모든 이전 태스크

- [ ] **Step 1: 보정 테스트 추가**

`tests/contract-finance.test.mjs` import에 `import {initialState,teams as clubNames,teamPlayers} from '../model.js';`를 더하고 추가:

```js
test('초기 연봉 보정: 팀 국내 총연봉 80억~140억(캡 이하), 리그 평균은 캡의 70~85%',()=>{
  const s=initialState(),pays=clubNames.map((_,i)=>domesticPayroll(teamPlayers(s,i)));
  pays.forEach((v,i)=>assert.ok(v>=800000&&v<=FIN.cap,`${clubNames[i]} ${money(v)}`));
  const avg=pays.reduce((a,b)=>a+b,0)/pays.length;
  assert.ok(avg>=.7*FIN.cap&&avg<=.85*FIN.cap,`평균 ${money(avg)}`);
});
```

- [ ] **Step 2: 실행하고 분포 확인**

Run: `node --test tests/contract-finance.test.mjs`

실패하면 분포를 본다:

```bash
node -e "Promise.all([import('./model.js'),import('./game/contract/finance.js')]).then(([m,f])=>{const s=m.initialState();m.teams.forEach((t,i)=>{const r=m.teamPlayers(s,i);console.log(t,f.money(f.domesticPayroll(r)),'실제값',f.money(r.filter(p=>!p.foreign&&!p.generated).reduce((a,p)=>a+p.contract.salary,0)));});})"
```

- 평균이 낮거나 높으면 `FIN.marketUnit`을 5,000(0.5억) 단위로 조정하고 다시 실행한다.
- **어떤 팀이 PR 0 실제값만으로 캡(140억)을 넘으면 데이터나 캡을 임의로 바꾸지 말고 멈춘다.** 팀 이름과 금액을 사용자에게 보고하고 결정(캡 상향 / 그대로 두고 해당 팀은 방출만 가능)을 받는다(스펙: 시작부터 넘는 팀은 보고).

Expected: PASS

- [ ] **Step 3: README 갱신**

`README.md`의 기능 목록(`- 선수마다 20–80 능력치…` 줄 아래)에 추가:

```markdown
- 구단마다 55명(국내 52 + 외국인 3)이며, 실제 로스터에 2군 뎁스 선수와 가상 외국인 선수를 채웠습니다. 연봉 상위 약 50명은 2026 실제 연봉, 나머지는 능력치·연차로 추정합니다([계약 설계](docs/superpowers/specs/2026-09-29-contract-system-design.md)).
- 샐러리캡(국내 선수 140억, 하드캡)과 구단 예산(모기업 지원 + 순위 수입)이 있습니다. 시즌이 끝나면 오프시즌 6단계(시즌 마감 → 은퇴·방출 → 연봉 협상 → FA → 외국인 → 로스터 확정)를 거쳐 다음 시즌으로 넘어갑니다. 은퇴·연봉·FA·외국인·드래프트의 실제 처리는 후속 업데이트에서 추가됩니다.
```

저장 키 문구 `dugout-prototype-v2`/`v3`가 README에 있으면 `dugout-prototype-v4`로 고친다.

Run: `grep -n "dugout-prototype-v" README.md docs/engine-port.md`

- [ ] **Step 4: 빌드**

```bash
npm install
npm run build
npm test
```

Expected: 빌드 성공, `dist/`에 `game/contract/*.js`와 `offseason-ui.js`가 복사됨, 테스트 전부 PASS. `offseason-ui.js`가 `dist/`에 없으면 `scripts/build.mjs`의 복사 목록(루트 파일 목록)에 `game-ui.js`와 같은 방식으로 추가하고 다시 빌드한다.

Run: `ls dist/offseason-ui.js dist/game/contract/`

- [ ] **Step 5: 커밋**

```bash
git add game/contract/finance.js tests/contract-finance.test.mjs README.md dist scripts/build.mjs
git commit -m "Calibrate initial salaries, document contract base, rebuild dist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 최신 main 반영과 PR**

```bash
git fetch github && git rebase github/main
npm test
git push -u github feat/contract-base
gh pr create --repo myunlee133-beep/baseball-manager --base main --head feat/contract-base --title "계약 시스템 기반: 55명 로스터, 캡·예산, 오프시즌 6단계" --body-file -
```

PR 본문(표준 입력):

```markdown
계약 시스템 PR 1(기반). 설계: docs/superpowers/specs/2026-09-29-contract-system-design.md

## 변경
- 모든 구단 55명: 실제 로스터 + 2군 뎁스 가상 선수 + 외국인 3명(투수 2·타자 1, 전 구단 같은 등급)
- 선수 계약 필드(`contract`, `entry`, `faYear` 전원), 연봉 초기값(상위 약 50명 실제값 + 공식)
- 하드캡 140억(국내 선수), 구단 예산(모기업 지원 + 순위 수입)
- 오프시즌 6단계 화면. ①시즌 마감·⑥로스터 확정만 동작, ②~⑤는 다음 PR

## 공유 파일 변경 (AGENTS.md)
- `model.js`: 저장 키 v4, `initialState`가 로스터 채우기·재정 포함, `loadState`가 v3·v2를 v4로 이관, `PREV_KEY` → `PREV_KEYS`
- `app.js`: 종료 모달 [오프시즌 시작], 오프시즌 메뉴·화면, 홈 [오프시즌 계속]
- `game/league-season.js`: `startNextSeason`을 `closeSeason`/`ageLeague`/`prepareNextSeason`으로 분할(동작 동일). 노화는 오프시즌 ②와 ③ 사이에서 호출
- 새 게임의 AI·내 팀 편성: 외국인 선발 1명마다 원래 SP 중 최저 OVR을 RP로, 1군 최저 OVR을 2군으로

## 테스트
`npm test` 전부 통과. 브라우저에서 시즌 끝 → 오프시즌 ①~⑥ → 2027 개막 전, 도중 새로고침 이어가기 확인.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

PR 생성 후 `ccd_pr` 도구로 PR을 연결하고 CI 결과를 확인한다.
