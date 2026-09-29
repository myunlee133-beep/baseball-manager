# 시즌 진행 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026 개막 전에서 144경기 KBO식 일정을 날짜 단위로 진행하며, 리그 전 경기를 투구 단위 엔진으로 시뮬레이션해 순위·성적·박스스코어·체력을 누적하고, 3단계용 `monthlyTick`/`offseasonTick` 호출 자리를 만든다.

**Architecture:** 순수 로직은 `game/` 아래 새 파일 4개(일정, 체력, 시즌, 러너)에 둔다. `game-bridge.js`는 시즌 경기용 엔진 팀 구성 함수를 얻고, `model.js`는 저장 키만 바뀌며, `app.js`는 화면을 실제 데이터에 연결한다. 상태는 기존 코드처럼 제자리 변경(mutate)하고, 러너가 하루 끝마다 저장한다.

**Tech Stack:** 브라우저용 순수 ES 모듈 JS, Node 내장 `node:test`(`npm test`), localStorage. 패키지 추가 없음.

**Spec:** [`docs/superpowers/specs/2026-09-29-season-progression-design.md`](../specs/2026-09-29-season-progression-design.md)

**검증:** Task 1–6의 코드 블록은 계획 작성 시 그대로 적용해 `node --test tests/*.test.mjs` 57개 전부 통과를 확인했다(적용 후 되돌림). Task 7–9(app.js)는 브라우저 수동 확인이 필요하다.

## Global Constraints

- `AGENTS.md` 준수: 새 로직은 새 파일, `model.js`·`app.js`는 최소 수정(한 줄 압축 포맷 유지, 전체 재포맷 금지), `vendor/`와 기존 엔진 파일(`game/engine.js`, `game/play.js`, `game/manager.js`, `game/fielding.js`, `game/season.js` 등 `build-engine`이 만드는 파일) 수정 금지.
- 새 파일은 전부 `game/` 아래에 둔다(`scripts/build.mjs`가 `game/`을 통째로 `dist/`에 복사하므로 빌드 스크립트 수정 불필요). 이름은 `vendor/pro-baseball/*.ts`와 겹치지 않는다.
- 저장 키: 본 상태 `dugout-prototype-v3`, 박스스코어 `dugout-boxes-{연도}`, 진행 중 경기 `dugout-active-game-v2`. v2 본 상태는 읽어서 v3로 옮긴다.
- 사용자에게 보이는 문구는 한국어.
- 테스트 파일은 `tests/*.test.mjs`(`node --test`), 코드 스타일은 기존 테스트처럼 `import test from 'node:test'; import assert from 'node:assert/strict';`.
- 모든 체력 수치는 `game/season-fatigue.js`의 `FATIGUE` 상수 한 곳에만 둔다.
- 커밋 메시지는 한 줄 요약 + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `dist/`는 마지막 태스크에서 `npm run build`로만 갱신한다(`npm install` 필요 시 먼저).

## 설계 대비 구현 보정 (Task 10에서 스펙 문서에 반영)

1. 선수 필드는 `lastPitched` 대신 `lastPlayed`(야수·투수 공통, 회복 +50% 판정) + `streak`(연속 등판일, 연투 가산)로 둔다.
2. "경기에 안 나간 날 회복 +50%"는 야수만 적용한다(투수 1.0). 투수까지 적용하면 100구 선발이 이틀 만에 70을 넘어 4인 로테이션도 지치지 않아, 스펙 예시("5일 뒤 약 95", "4인 로테이션은 점점 지침")와 어긋난다.
3. 2026 일정은 3/28 개막, 올스타 휴식 7/9–7/12, 9/16 종료(생성 규칙의 결과).
4. 시즌 전체 스모크는 1분 이상 걸려 `npm test`에서 빼고 `npm run test:season`으로 둔다. `npm test`에는 1주 진행 테스트를 넣는다.
5. 진행 중 경기 키를 `dugout-active-game-v2`로 올린다. 1단계 `loadState`가 `dugout-active-game-v1`을 레거시로 지우는 탓에 새로고침 때마다 진행 중 경기가 사라지던 문제도 같이 해결된다.

## File Structure

| 파일 | 책임 |
|---|---|
| `game/league-schedule.js` (신규) | 날짜 유틸(`addDays`, `weekday`), `openingDay(year)`, `buildSchedule(year)` |
| `game/season-fatigue.js` (신규) | `FATIGUE` 상수, `spendEnergy`, `recoverDay`, `energyPenalty`, `restPlan` |
| `game-bridge.js` (수정) | `createLeagueGame(state, g, {autoMine})`, 진행 중 경기 저장 `saveActive/loadActive/clearActive` |
| `game/league-season.js` (신규) | `hooks`, `createSeason`, `ensureSeason`, `todayGames`, `myGame`, `lineupProblem`, `playLeagueGame`, `applyResult`, `finishDay`, `standings`, `seasonLine`, `allPlayers`, 박스스코어 `loadBox/saveBox/flushBoxes/dropBoxes`, `startNextSeason` |
| `game/season-runner.js` (신규) | `targetDate(state, unit)`, `advance(state, until, opts)` |
| `model.js` (수정) | `STATE_KEY` v3, `loadState`가 v2를 읽음 |
| `app.js` (수정) | 헤더·진행 버튼·진행 모달·LIVE GAME 연결·홈·달력·박스스코어·기록실 |
| `scripts/season-smoke.mjs` (신규) | 시즌 전체 1회 실행, 소요 시간·체력 지표 출력 |
| `tests/league-schedule.test.mjs`, `tests/season-fatigue.test.mjs`, `tests/league-season.test.mjs`, `tests/season-runner.test.mjs` (신규) | 단위·통합 테스트 |

모듈 의존 방향(순환 없음): `app.js` → `game/season-runner.js` → `game/league-season.js` → `game-bridge.js` → `model.js`, `game/season-fatigue.js` → `game/fielding.js`, `game/league-schedule.js`.

---

### Task 1: 일정 생성기

**Files:**
- Create: `game/league-schedule.js`
- Test: `tests/league-schedule.test.mjs`

**Interfaces:**
- Produces:
  - `addDays(iso: string, n: number): string` — `'2026-03-28'` 형식, UTC 기준
  - `weekday(iso: string): number` — 0=일 … 6=토
  - `openingDay(year: number): string` — 3/22 이후 첫 토요일 (2026 → `'2026-03-28'`, 2027 → `'2027-03-27'`)
  - `buildSchedule(year: number): Array<{id: string, date: string, home: number, away: number, status: 'scheduled'}>` — 720경기, 날짜순, id `'2026-001'`…`'2026-720'`

**일정 규칙:** 10팀 원형 로빈 9라운드(라운드 = 5경기 쌍). 사이클 6개: 사이클 0–3은 3연전, 4–5는 2연전. 쌍의 홈은 짝수 사이클이 쌍의 첫 팀, 홀수 사이클이 둘째 팀 → 팀 간 16경기, 홈 8·원정 8. 배치: 개막 토·일에 2연전 라운드 1개 → 개막+3일(화)부터 주 25개(화–일). 14번째 주(0부터, 2026은 7/7)는 올스타 주: 화·수 2연전 1개, 목–일 휴식. 24번째 주는 마지막 주: 화·수 2연전 1개. 4·8·12·18·21번째 주는 2연전 3개(화수·목금·토일), 나머지 18주는 3연전 2개(화–목·금–일). 월요일은 항상 휴식. 팀 번호는 연도 시드로 섞어 해마다 대진 순서가 달라진다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/league-schedule.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSchedule,openingDay,addDays,weekday} from '../game/league-schedule.js';

test('날짜 유틸',()=>{
  assert.equal(addDays('2026-03-28',4),'2026-04-01');
  assert.equal(addDays('2026-04-01',-1),'2026-03-31');
  assert.equal(weekday('2026-03-28'),6);
  assert.equal(openingDay(2026),'2026-03-28');
  assert.equal(openingDay(2027),'2027-03-27');
});

test('2026 일정: 720경기, 팀당 144경기, 상대별 16경기(홈 8)',()=>{
  const s=buildSchedule(2026);
  assert.equal(s.length,720);
  assert.equal(new Set(s.map(g=>g.id)).size,720);
  for(let t=0;t<10;t++){
    assert.equal(s.filter(g=>g.home===t||g.away===t).length,144,`팀 ${t}`);
    for(let o=0;o<10;o++)if(o!==t){
      assert.equal(s.filter(g=>g.home===t&&g.away===o).length,8,`${t} 홈 vs ${o}`);
    }
  }
});

test('하루 5경기, 모든 팀 하루 1경기, 월요일·올스타 휴식',()=>{
  const s=buildSchedule(2026),dates=[...new Set(s.map(g=>g.date))];
  assert.equal(dates[0],'2026-03-28');
  assert.equal(dates.at(-1),'2026-09-16');
  assert.equal(dates.length,144);
  for(const d of dates){
    const day=s.filter(g=>g.date===d);
    assert.equal(day.length,5,d);
    assert.equal(new Set(day.flatMap(g=>[g.home,g.away])).size,10,d);
    assert.notEqual(weekday(d),1,`${d} 월요일`);
  }
  for(const d of ['2026-07-09','2026-07-10','2026-07-11','2026-07-12'])assert.ok(!dates.includes(d),d);
  assert.deepEqual(s.map(g=>g.date),[...s.map(g=>g.date)].sort());
});

test('같은 연도는 같은 일정, 다른 연도는 다른 대진',()=>{
  assert.deepEqual(buildSchedule(2026),buildSchedule(2026));
  const a=buildSchedule(2026).slice(0,5).map(g=>[g.home,g.away]),b=buildSchedule(2027).slice(0,5).map(g=>[g.home,g.away]);
  assert.notDeepEqual(a,b);
  assert.equal(buildSchedule(2027)[0].date,'2027-03-27');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/league-schedule.test.mjs`
Expected: FAIL — `Cannot find module '.../game/league-schedule.js'`

- [ ] **Step 3: 구현**

```js
// game/league-schedule.js
/** KBO식 144경기 일정. 3연전 위주 + 2연전, 월요일 휴식, 올스타 휴식 4일. 같은 연도는 항상 같은 일정. */
export const addDays=(iso,n)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const weekday=iso=>new Date(iso+'T00:00:00Z').getUTCDay();
/** 3/22 이후 첫 토요일. */
export function openingDay(year){let d=`${year}-03-22`;while(weekday(d)!==6)d=addDays(d,1);return d;}

const WEEKS=25,ALL_STAR_WEEK=14,FINAL_WEEK=24,TWO_GAME_WEEKS=[4,8,12,18,21];

function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
/** 원형 로빈: 9라운드 × 5쌍. */
function rounds(teams){let a=[...teams];const out=[];for(let r=0;r<9;r++){out.push(Array.from({length:5},(_,i)=>[a[i],a[9-i]]));a=[a[0],a[9],...a.slice(1,9)];}return out;}

export function buildSchedule(year){
  const random=rng(year),order=[...Array(10).keys()];
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const base=rounds(order),three=[],two=[];
  for(let c=0;c<6;c++)for(const pairs of base)(c<4?three:two).push({len:c<4?3:2,flip:c%2===1,pairs});
  const games=[],place=(round,start)=>{for(let k=0;k<round.len;k++)for(const [a,b] of round.pairs)games.push({date:addDays(start,k),home:round.flip?b:a,away:round.flip?a:b});};
  const open=openingDay(year);
  place(two.shift(),open);
  for(let w=0;w<WEEKS;w++){
    const tue=addDays(open,3+7*w);
    if(w===ALL_STAR_WEEK||w===FINAL_WEEK)place(two.shift(),tue);
    else if(TWO_GAME_WEEKS.includes(w))for(const k of [0,2,4])place(two.shift(),addDays(tue,k));
    else for(const k of [0,3])place(three.shift(),addDays(tue,k));
  }
  return games.sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:0).map((g,i)=>({id:`${year}-${String(i+1).padStart(3,'0')}`,...g,status:'scheduled'}));
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/league-schedule.test.mjs`
Expected: PASS 4/4. (마지막 날짜가 `'2026-09-16'`이 아니면 `WEEKS`/주 번호 계산을 점검한다. 개막+3+7×24 = 9/15 화, 9/16 수.)

- [ ] **Step 5: 커밋**

```bash
git add game/league-schedule.js tests/league-schedule.test.mjs
git commit -m "Add KBO-style 144-game schedule generator" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 체력 모델

**Files:**
- Create: `game/season-fatigue.js`
- Test: `tests/season-fatigue.test.mjs`

**Interfaces:**
- Consumes: `addDays` (Task 1), `assignPositions(players, preferred)` from `game/fielding.js` (엔진 기존 함수; `players`는 `{id, position, defense}` 객체 9개, 반환은 위치 문자열 배열 또는 `null`)
- Produces:
  - `FATIGUE` 상수 객체
  - `spendEnergy(player, {bat, pit, startPos, innings, date}): void` — 선수 객체 `energy`/`lastPlayed`/`streak` 변경. `bat`/`pit`은 그 경기 엔진 기록 줄(없으면 `undefined`), `startPos`는 선발 출전 위치(교체면 `undefined`)
  - `recoverDay(players, date): void` — `date`는 방금 끝난 날
  - `energyPenalty(ratings, energy): ratings` — 새 객체 반환
  - `restPlan(base, players, {auto, turn}): {order, field, starterId, nextTurn, unavailable: Set<string>}` — `base = {order, field, rotation, bullpen}`(`field`는 `{위치: 선수id}`), `players`는 그 팀 선수 배열(1단계 선수 객체)

선수 객체 형태(1단계): `{id, pitcher, pos, age, group, energy, ratings:{contact,eye,power,speed,defense}|{velocity,stuff,control,stamina}}`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/season-fatigue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {FATIGUE,spendEnergy,recoverDay,energyPenalty,restPlan} from '../game/season-fatigue.js';
import {initialState,teamSetup} from '../model.js';

const hitter=(o={})=>({id:'h',pitcher:false,pos:'CF',age:28,energy:100,group:'first',ratings:{contact:50,eye:50,power:50,speed:50,defense:50},...o});
const arm=(o={})=>({id:'p',pitcher:true,pos:'RP',age:28,energy:100,group:'first',ratings:{velocity:50,stuff:50,control:50,stamina:40},...o});

test('야수 소모: 선발 −10, 포수 −15, 지명 −5, 연장 이닝당 −1, 교체 −4',()=>{
  const cases=[['CF',9,90],['C',9,85],['DH',9,95],['CF',11,88]];
  for(const [pos,innings,want] of cases){const p=hitter();spendEnergy(p,{bat:{pa:4},startPos:pos,innings,date:'2026-04-01'});assert.equal(p.energy,want,pos+innings);}
  const sub=hitter();spendEnergy(sub,{bat:{pa:1},innings:9,date:'2026-04-01'});assert.equal(sub.energy,96);
  assert.equal(sub.lastPlayed,'2026-04-01');
});

test('투수 소모: 선발 100구 −60, 불펜 투구 수 + 연투 가산',()=>{
  const sp=arm({pos:'SP'});spendEnergy(sp,{pit:{starts:1,pitches:100},date:'2026-04-01'});assert.equal(sp.energy,40);
  const rp=arm();
  spendEnergy(rp,{pit:{pitches:15},date:'2026-04-01'});assert.equal(rp.energy,85);
  spendEnergy(rp,{pit:{pitches:15},date:'2026-04-02'});assert.equal(rp.energy,60); // 15 + 연투 10
  spendEnergy(rp,{pit:{pitches:15},date:'2026-04-03'});assert.equal(rp.energy,25); // 15 + 3연투 20
  assert.equal(rp.streak,3);
  spendEnergy(rp,{pit:{pitches:10},date:'2026-04-05'});assert.equal(rp.energy,15);assert.equal(rp.streak,1);
});

test('회복: 야수 +6(쉬면 +9), 투수 +10, 나이 보정, 상한 100',()=>{
  const played=hitter({energy:50,lastPlayed:'2026-04-01'}),rested=hitter({energy:50,lastPlayed:'2026-03-31'});
  const old=hitter({energy:50,age:35,lastPlayed:'2026-04-01'}),young=arm({energy:50,age:23,lastPlayed:'2026-03-30'});
  const full=hitter({energy:98});
  recoverDay([played,rested,old,young,full],'2026-04-01');
  assert.deepEqual([played.energy,rested.energy,old.energy,young.energy,full.energy],[56,59,55,61,100]);
});

test('체력 70 미만부터 (70 − 체력) × 0.3 만큼 능력치 감소, 선구·체력은 그대로',()=>{
  assert.deepEqual(energyPenalty({contact:50,eye:50,power:50,speed:50,defense:50},80),{contact:50,eye:50,power:50,speed:50,defense:50});
  assert.deepEqual(energyPenalty({contact:50,eye:50,power:50,speed:50,defense:50},30),{contact:38,eye:50,power:38,speed:38,defense:38});
  assert.deepEqual(energyPenalty({velocity:60,stuff:60,control:60,stamina:60},50),{velocity:54,stuff:54,control:54,stamina:60});
});

test('자동 휴식: 지친 주전을 자격 있는 벤치 선수로, 포수는 55 기준',()=>{
  const s=initialState(),players=structuredClone(s.players),base=teamSetup(players);
  const byId=new Map(players.map(p=>[p.id,p]));
  const cf=base.field.CF,c=base.field.C;
  byId.get(cf).energy=44;byId.get(c).energy=54;
  const plan=restPlan(base,players,{auto:true,turn:0});
  assert.ok(!plan.order.includes(cf),'지친 중견수 휴식');
  assert.equal(plan.order.length,9);
  if(players.some(p=>!p.pitcher&&p.group==='first'&&p.pos==='C'&&p.id!==c))assert.ok(!plan.order.includes(c),'포수 휴식');
  assert.equal(new Set(Object.values(plan.field)).size,9);
  const off=restPlan(base,players,{auto:false,turn:0});
  assert.deepEqual(off.order,base.order);
});

test('선발: 체력 70 미만이면 다음 선발, 모두 지치면 불펜 데이, 지친 불펜 제외',()=>{
  const s=initialState(),players=structuredClone(s.players),base=teamSetup(players),byId=new Map(players.map(p=>[p.id,p]));
  byId.get(base.rotation[0]).energy=60;
  let plan=restPlan(base,players,{auto:true,turn:0});
  assert.equal(plan.starterId,base.rotation[1]);
  assert.equal(plan.nextTurn,2%base.rotation.length);
  for(const id of base.rotation)byId.get(id).energy=50;
  byId.get(base.bullpen[0]).energy=20;
  plan=restPlan(base,players,{auto:true,turn:0});
  assert.ok(base.bullpen.includes(plan.starterId),'불펜 데이');
  assert.ok(plan.unavailable.has(base.bullpen[0]));
  for(const id of base.bullpen)byId.get(id).energy=10;
  plan=restPlan(base,players,{auto:true,turn:0});
  assert.equal(plan.unavailable.size,0,'전원 지치면 제한 해제');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/season-fatigue.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: 구현**

```js
// game/season-fatigue.js
/** 시즌 체력 모델. 수치는 전부 FATIGUE 에 있다 — 시즌 스모크(npm run test:season) 결과로 조정한다. */
import {assignPositions} from './fielding.js';
import {addDays} from './league-schedule.js';

export const FATIGUE={
  start:{default:10,C:15,DH:5},extraInning:1,sub:4,
  starterPerPitch:0.6,relieverPerPitch:1.0,backToBack:10,threeDays:20,
  recover:{hitter:6,pitcher:10},idle:{hitter:1.5,pitcher:1.0},old:{age:33,rate:0.8},young:{age:25,rate:1.1},
  penaltyFrom:70,penaltyRate:0.3,
  rest:{hitter:45,catcher:55,starter:70,reliever:30},
};
const DROPS=['contact','power','speed','defense','velocity','stuff','control'];

export function spendEnergy(p,{bat,pit,startPos,innings=9,date}){
  let cost=0;
  if(p.pitcher){
    if(!pit)return;
    p.streak=(p.lastPlayed===addDays(date,-1)?p.streak||0:0)+1;
    cost=pit.starts?pit.pitches*FATIGUE.starterPerPitch
      :pit.pitches*FATIGUE.relieverPerPitch+(p.streak>=3?FATIGUE.threeDays:p.streak===2?FATIGUE.backToBack:0);
  }else if(startPos){
    cost=(FATIGUE.start[startPos]??FATIGUE.start.default)+Math.max(0,innings-9)*FATIGUE.extraInning;
  }else if(bat)cost=FATIGUE.sub;
  else return;
  p.energy=Math.max(0,Math.round(p.energy-cost));
  p.lastPlayed=date;
}

export function recoverDay(players,date){
  for(const p of players){
    if(p.energy>=100)continue;
    const kind=p.pitcher?'pitcher':'hitter';
    const age=p.age>=FATIGUE.old.age?FATIGUE.old.rate:p.age<=FATIGUE.young.age?FATIGUE.young.rate:1;
    const gain=FATIGUE.recover[kind]*(p.lastPlayed===date?1:FATIGUE.idle[kind])*age;
    p.energy=Math.min(100,Math.round(p.energy+gain));
  }
}

export function energyPenalty(ratings,energy){
  const d=Math.max(0,FATIGUE.penaltyFrom-energy)*FATIGUE.penaltyRate;
  return Object.fromEntries(Object.entries(ratings).map(([k,v])=>[k,DROPS.includes(k)?Math.max(5,Math.round(v-d)):v]));
}

/** 경기 전 기용: 지친 야수 휴식, 선발 선택(불펜 데이 포함), 등판 불가 불펜. auto=false 면 편성 그대로. */
export function restPlan(base,players,{auto,turn=0}){
  const byId=new Map(players.map(p=>[p.id,p])),rotation=base.rotation,bullpen=base.bullpen,k=Math.max(1,rotation.length);
  let order=[...base.order],field={...base.field},starterId=rotation[turn%k]??bullpen[0],nextTurn=(turn+1)%k;
  const unavailable=new Set();
  if(!auto)return {order,field,starterId,nextTurn,unavailable};
  const posOf=id=>Object.keys(field).find(pos=>field[pos]===id);
  for(const id of [...order]){
    const tired=byId.get(id),limit=posOf(id)==='C'?FATIGUE.rest.catcher:FATIGUE.rest.hitter;
    if(!tired||tired.energy>=limit)continue;
    const bench=players.filter(p=>!p.pitcher&&p.group==='first'&&!order.includes(p.id)&&p.energy>tired.energy).sort((a,b)=>b.energy-a.energy);
    for(const sub of bench){
      const next=order.map(x=>x===id?sub.id:x);
      const preferred=Object.fromEntries(next.map(x=>[x,posOf(x===sub.id?id:x)]));
      const spots=assignPositions(next.map(x=>{const q=byId.get(x);return {id:x,position:q.pos,defense:q.ratings.defense};}),preferred);
      if(!spots)continue;
      order=next;field=Object.fromEntries(spots.map((pos,i)=>[pos,next[i]]));break;
    }
  }
  const pick=[...Array(rotation.length).keys()].map(j=>(turn+j)%rotation.length).find(j=>byId.get(rotation[j])?.energy>=FATIGUE.rest.starter);
  if(pick!==undefined){starterId=rotation[pick];nextTurn=(pick+1)%k;}
  else starterId=[...bullpen].sort((a,b)=>byId.get(b).energy-byId.get(a).energy)[0]??starterId;
  for(const id of bullpen)if(id!==starterId&&byId.get(id).energy<FATIGUE.rest.reliever)unavailable.add(id);
  if(bullpen.every(id=>id===starterId||unavailable.has(id)))unavailable.clear();
  return {order,field,starterId,nextTurn,unavailable};
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/season-fatigue.test.mjs`
Expected: PASS 6/6. 회복 테스트 기대값 계산: 쉰 야수 50+9=59, 35세 50+4.8→55, 23세 투수 50+11=61.

- [ ] **Step 5: 커밋**

```bash
git add game/season-fatigue.js tests/season-fatigue.test.mjs
git commit -m "Add season energy model: spend, recover, rating penalty, auto rest plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 브리지 — 시즌 경기 엔진 팀 구성과 진행 중 경기 저장

**Files:**
- Modify: `game-bridge.js` (새 함수 추가, `ENGINE_SAVE_KEY` 변경, 기존 함수 유지)
- Modify: `model.js` — `LEGACY_KEYS`는 그대로 둔다(`dugout-active-game-v1`을 지우는 것이 이제 의도와 맞음)
- Test: `tests/game-bridge.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: `restPlan`, `energyPenalty` (Task 2); `teamPlayers`, `teamSetup`, `teams` (model.js); `createGame` (game/engine.js)
- Produces:
  - `createLeagueGame(state, g, {autoMine=false}={}) → {plans: {home: Plan, away: Plan}, engine: GameState}`
    - `Plan = {team: number, starterId: string, nextTurn: number, starters: {[선수id]: 위치}}`
    - `g`는 일정 경기 `{id, home, away}`. 내 팀(0)은 `state.order/field/rotation/bullpen/roles`와 `state.strategy.next`를, AI 팀은 `teamSetup(players)`와 `state.season.rotationTurn[i]`를 쓴다. AI 팀은 항상 `auto:true`, 내 팀은 `autoMine`.
    - 엔진 시드는 `seedOf(g.id)`(문자열 해시).
  - `ACTIVE_KEY = 'dugout-active-game-v2'`, `saveActive(active)`, `loadActive() → {gameId, plans, game}|null`, `clearActive()`

- [ ] **Step 1: 실패하는 테스트 추가** (`tests/game-bridge.test.mjs` 끝에)

```js
import {createLeagueGame} from '../game-bridge.js';

const withSeason=s=>({...s,season:{rotationTurn:{1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0},autoRestMine:true}});

test('시즌 경기: 내 팀이 원정이어도 편성·선발이 들어가고 경기가 끝난다',()=>{
  const state=withSeason(initialState());
  const {plans,engine}=createLeagueGame(state,{id:'2026-001',home:3,away:0});
  assert.equal(engine.teams.away.name,'KT 위즈');
  assert.equal(plans.away.team,0);
  assert.equal(plans.away.starterId,state.strategy.next);
  assert.deepEqual(Object.keys(plans.away.starters).sort(),[...state.order].sort());
  assert.equal(advanceDugoutGame(engine,'game').status,'final');
});

test('시즌 경기: 체력이 낮으면 엔진 능력치가 깎이고, 같은 경기 id 는 같은 결과',()=>{
  const state=withSeason(initialState()),id=state.order[0];
  state.players.find(p=>p.id===id).energy=30;
  const {engine}=createLeagueGame(state,{id:'2026-002',home:0,away:4});
  const p=state.players.find(x=>x.id===id),e=engine.teams.home.lineup.find(x=>x.player.id===id).player;
  assert.equal(e.contact,Math.max(5,Math.round(p.ratings.contact-12)));
  const a=advanceDugoutGame(createLeagueGame(state,{id:'2026-009',home:1,away:2}).engine,'game');
  const b=advanceDugoutGame(createLeagueGame(state,{id:'2026-009',home:1,away:2}).engine,'game');
  assert.deepEqual(a.score,b.score);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/game-bridge.test.mjs`
Expected: FAIL — `createLeagueGame` is not exported

- [ ] **Step 3: 구현** — `game-bridge.js`에 추가/변경

import 줄을 다음으로 바꾼다:

```js
import { createGame, aiPitch, simulateHalfInning, simulateGame, getCurrentBatter, getCurrentPitcher } from './game/engine.js';
import { teams, positions, teamPlayers, teamSetup } from './model.js';
import { restPlan, energyPenalty } from './game/season-fatigue.js';
```

`export const ENGINE_SAVE_KEY='dugout-active-game-v1';` 줄을 다음으로 바꾼다(기존 `saveDugoutGame/loadDugoutGame/clearDugoutGame`은 새 키를 쓰게 되며, app.js가 Task 7에서 새 함수로 옮겨 간다):

```js
export const ENGINE_SAVE_KEY='dugout-active-game-v2',ACTIVE_KEY=ENGINE_SAVE_KEY;
```

`createDugoutGame` 함수 아래에 추가:

```js
export const seedOf=id=>[...String(id)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);

/** 일정의 한 경기를 엔진 경기로 만든다. 체력으로 기용·능력치를 정하고, 결과 반영에 쓸 편성(plans)을 함께 돌려준다. */
export function createLeagueGame(state,g,{autoMine=false}={}){
  const plans={},sides={};
  for(const side of ['home','away']){
    const i=g[side],players=teamPlayers(state,i),mine=i===0;
    const base=mine?{order:state.order,field:state.field,rotation:state.rotation,bullpen:state.bullpen,roles:state.roles}:teamSetup(players);
    const turn=mine?Math.max(0,state.rotation.indexOf(state.strategy.next)):state.season.rotationTurn[i]||0;
    const plan=restPlan(base,players,{auto:mine?autoMine:true,turn});
    const ready=players.filter(p=>!plan.unavailable.has(p.id)).map(p=>({...p,ratings:energyPenalty(p.ratings,p.energy)}));
    sides[side]=makeTeam(teams[i],i,ready,plan.order,plan.field,plan.starterId,base.roles);
    plans[side]={team:i,starterId:plan.starterId,nextTurn:plan.nextTurn,starters:Object.fromEntries(plan.order.map(id=>[id,Object.keys(plan.field).find(pos=>plan.field[pos]===id)]))};
  }
  return {plans,engine:createGame(sides.home,sides.away,seedOf(g.id))};
}
export function saveActive(active){localStorage.setItem(ACTIVE_KEY,JSON.stringify(active));}
export function loadActive(){try{const a=JSON.parse(localStorage.getItem(ACTIVE_KEY));return a?.gameId&&a.game?a:null;}catch{return null;}}
export function clearActive(){localStorage.removeItem(ACTIVE_KEY);}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/game-bridge.test.mjs`
Expected: PASS (기존 4개 + 새 2개)

- [ ] **Step 5: 커밋**

```bash
git add game-bridge.js tests/game-bridge.test.mjs
git commit -m "Build league games from schedule with energy-based rest and rating penalty" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 시즌 코어 — 결과 반영, 순위, 하루 마무리, 틱, 박스스코어, 시즌 전환

**Files:**
- Create: `game/league-season.js`
- Test: `tests/league-season.test.mjs`

**Interfaces:**
- Consumes: `buildSchedule`, `openingDay`, `addDays` (Task 1); `spendEnergy`, `recoverDay` (Task 2); `createLeagueGame` (Task 3); `simulateGame` (game/engine.js); `teams`, `teamPlayers` (model.js)
- Produces:
  - `hooks = {monthlyTick(state){}, offseasonTick(state){}}` — 3단계가 채운다. 테스트는 속성을 바꿔 호출 횟수를 센다.
  - `createSeason(year) → Season` (스펙의 `season` 구조, `phase:'preseason'`, `date=openingDay(year)`)
  - `ensureSeason(state): state` — `season`이 없으면 만들고, 모든 선수에 `energy`(없으면 100)·`stats:{batting:{},pitching:{}}`·`history:{}`·`lastPlayed:null`·`streak:0`을 채운다
  - `allPlayers(state): Player[]`
  - `todayGames(state)`, `myGame(state)`(오늘 내 팀 경기 또는 undefined)
  - `lineupProblem(state): string|null`
  - `applyResult(state, g, finalGame, plans): void`
  - `playLeagueGame(state, g, {autoMine}={}): void` — `autoMine` 기본값 `state.season.autoRestMine`
  - `finishDay(state): void`
  - `standings(state): Array<{team, w, l, t, g, pct, gb, rf, ra, last}>` (순위순)
  - `seasonLine(stats, pitcher): {pa, ab, h, doubles, triples, hr, rbi, sb, attempts, bb, k, avg, obp, slg, ops, babip, iso, bbRate, kRate, g, gs, w, l, sv, hld, outs, ip, ha, er, r, hp, era, whip, k9, bb9, war:null}` — 1단계 기록 필드와 같은 이름
  - `loadBox(year, id)`, `saveBox(year, id, box)`, `flushBoxes(year)`, `dropBoxes(year)`
  - `startNextSeason(state): void`

박스스코어 형태: `{lineScore, hits, errors, bat:{id:기록 줄(0 제외)}, pit:{id:기록 줄(0 제외)}, pos:{id:선발 위치}}`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/league-season.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {hooks,ensureSeason,todayGames,myGame,playLeagueGame,finishDay,standings,seasonLine,allPlayers,loadBox,flushBoxes,startNextSeason,lineupProblem} from '../game/league-season.js';

const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const fresh=()=>ensureSeason(initialState());
const playDay=s=>{for(const g of todayGames(s))if(g.status==='scheduled')playLeagueGame(s,g);finishDay(s);};

test('새 시즌: 개막 전, 전원 체력 100과 빈 성적',()=>{
  const s=fresh();
  assert.equal(s.season.phase,'preseason');
  assert.equal(s.season.date,'2026-03-28');
  assert.equal(s.season.schedule.length,720);
  assert.ok(allPlayers(s).every(p=>p.energy===100&&p.stats&&p.history&&p.lastPlayed===null));
  assert.equal(allPlayers(s).length,410);
  assert.equal(lineupProblem(s),null);
});

test('하루 진행: 5경기 final, 순위·성적·박스스코어가 서로 맞는다',()=>{
  const s=fresh();
  playDay(s);
  const day=s.season.schedule.filter(g=>g.date==='2026-03-28');
  assert.ok(day.every(g=>g.status==='final'&&g.score&&g.innings>=9));
  assert.equal(s.season.phase,'regular');
  assert.equal(s.season.date,'2026-03-29');
  const table=standings(s),w=table.reduce((a,r)=>a+r.w,0),l=table.reduce((a,r)=>a+r.l,0),t=table.reduce((a,r)=>a+r.t,0);
  assert.equal(w,l);assert.equal(t%2,0);assert.equal(w+t/2,5);
  const hits=allPlayers(s).reduce((a,p)=>a+(p.stats.batting.h||0),0);
  const boxHits=day.reduce((a,g)=>{const b=loadBox(2026,g.id);return a+b.hits.home+b.hits.away;},0);
  assert.equal(hits,boxHits);
  assert.ok(allPlayers(s).some(p=>p.energy<100),'체력 소모');
  assert.ok(s.season.news.length===5);
});

test('로테이션: 내 팀 다음 선발이 전진하고 AI 팀 순번이 바뀐다',()=>{
  const s=fresh(),before=s.strategy.next;
  playDay(s);
  if(myGame({...s,season:{...s.season,date:'2026-03-28'}}))assert.notEqual(s.strategy.next,before);
  assert.ok(Object.values(s.season.rotationTurn).some(v=>v>0));
});

test('틱: 3/31→4/1 에 monthlyTick 1회',()=>{
  const s=fresh();let n=0;const orig=hooks.monthlyTick;hooks.monthlyTick=()=>n++;
  try{
    s.season.date='2026-03-31';
    finishDay(s);
    assert.equal(s.season.date,'2026-04-01');assert.equal(n,1);
    finishDay(s);assert.equal(n,1);
  }finally{hooks.monthlyTick=orig;}
});

test('시즌 종료 → 다음 시즌: 기록 보관, 나이 +1, offseasonTick, 새 일정, 박스스코어 삭제',()=>{
  const s=fresh();playDay(s);flushBoxes(2026);
  const p=s.players.find(x=>x.stats.batting.pa),age=p.age,pa=p.stats.batting.pa;
  let n=0;const orig=hooks.offseasonTick;hooks.offseasonTick=()=>n++;
  try{startNextSeason(s);}finally{hooks.offseasonTick=orig;}
  assert.equal(n,1);
  assert.equal(p.history[2026].batting.pa,pa);
  assert.equal(p.age,age+1);
  assert.deepEqual(p.stats,{batting:{},pitching:{}});
  assert.equal(p.energy,100);
  assert.equal(s.season.year,2027);
  assert.equal(s.season.date,'2027-03-27');
  assert.equal(store.has('dugout-boxes-2026'),false);
});

test('seasonLine: 엔진 기록 줄을 기록실 필드로 바꾼다',()=>{
  const b=seasonLine({batting:{pa:10,ab:8,h:3,doubles:1,hr:1,bb:2,so:2,rbi:3,games:2}},false);
  assert.equal(b.avg,3/8);assert.equal(b.slg,(3+1+3)/8);assert.equal(b.k,2);assert.equal(b.g,2);assert.equal(b.war,null);
  const p=seasonLine({pitching:{outs:27,earnedRuns:3,strikeouts:9,walks:3,hitsAllowed:6,starts:1,games:1,wins:1}},true);
  assert.equal(p.era,3);assert.equal(p.ip,9);assert.equal(p.k,9);assert.equal(p.bb,3);assert.equal(p.whip,1);assert.equal(p.w,1);
});

test('라인업이 9명이 아니면 문제를 알려준다',()=>{
  const s=fresh();s.order=s.order.slice(0,8);
  assert.match(lineupProblem(s),/타자/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/league-season.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: 구현**

```js
// game/league-season.js
/** 시즌 진행: 하루 경기 결과 반영, 순위, 날짜 넘김, 3단계 훅, 박스스코어 저장, 시즌 전환. 상태는 제자리 변경한다. */
import {simulateGame} from './engine.js';
import {buildSchedule,openingDay,addDays} from './league-schedule.js';
import {spendEnergy,recoverDay} from './season-fatigue.js';
import {createLeagueGame} from '../game-bridge.js';
import {teams,teamPlayers,positions} from '../model.js';

/** 3단계 연결점. 2단계에서는 비어 있다. */
export const hooks={monthlyTick(state){},offseasonTick(state){}};

const blankStats=()=>({batting:{},pitching:{}});
export function createSeason(year){
  return {year,date:openingDay(year),phase:'preseason',schedule:buildSchedule(year),
    standings:Object.fromEntries(teams.map((_,i)=>[i,{w:0,l:0,t:0,rf:0,ra:0,last:[]}])),
    rotationTurn:Object.fromEntries(teams.map((_,i)=>[i,0]).filter(([i])=>i>0)),autoRestMine:true,news:[]};
}
export const allPlayers=state=>teams.flatMap((_,i)=>teamPlayers(state,i));
export function ensureSeason(state){
  state.season??=createSeason(2026);
  for(const p of allPlayers(state)){p.energy??=100;p.stats??=blankStats();p.history??={};p.lastPlayed??=null;p.streak??=0;}
  return state;
}
export const todayGames=state=>state.season.schedule.filter(g=>g.date===state.season.date);
export const myGame=state=>todayGames(state).find(g=>g.home===0||g.away===0);
export function lineupProblem(state){
  if(state.order.length!==9)return `선발 타자가 ${state.order.length}명입니다. 9명을 채워주세요.`;
  if(!positions.every(p=>state.field[p]))return '비어 있는 수비 위치가 있습니다.';
  if(!state.rotation.length)return '선발 투수가 없습니다.';
  return null;
}

// 박스스코어: 메모리 캐시 + 하루 끝에 flush. 나중에 IndexedDB 로 옮길 때 이 네 함수만 바꾼다.
const boxKey=y=>`dugout-boxes-${y}`,storage=()=>globalThis.localStorage;
let cache={year:null,data:{}};
function boxes(year){if(cache.year!==year){let data={};try{data=JSON.parse(storage()?.getItem(boxKey(year))??'{}')||{};}catch{}cache={year,data};}return cache.data;}
export const loadBox=(year,id)=>boxes(year)[id]??null;
export function saveBox(year,id,box){boxes(year)[id]=box;}
export function flushBoxes(year){storage()?.setItem(boxKey(year),JSON.stringify(boxes(year)));}
export function dropBoxes(year){storage()?.removeItem(boxKey(year));if(cache.year===year)cache={year:null,data:{}};}

const nonzero=lines=>Object.fromEntries(Object.entries(lines).map(([id,l])=>[id,Object.fromEntries(Object.entries(l).filter(([,v])=>v))]));
const addLine=(target,line)=>{for(const [k,v] of Object.entries(line))if(v)target[k]=(target[k]||0)+v;};
const md=iso=>`${Number(iso.slice(5,7))}/${Number(iso.slice(8,10))}`;

export function applyResult(state,g,game,plans){
  const s=state.season,{home,away}=game.score,innings=Math.max(game.lineScore.home.length,game.lineScore.away.length);
  Object.assign(g,{status:'final',score:{home,away},innings,decisions:{win:game.decisions?.win??null,loss:game.decisions?.loss??null,save:game.decisions?.save??null}});
  for(const [team,rf,ra] of [[g.home,home,away],[g.away,away,home]]){
    const r=s.standings[team];r.rf+=rf;r.ra+=ra;
    const res=rf>ra?'W':rf<ra?'L':'T';if(res==='W')r.w++;else if(res==='L')r.l++;else r.t++;
    r.last=[...r.last,res].slice(-5);
  }
  const who=new Map([...teamPlayers(state,g.home),...teamPlayers(state,g.away)].map(p=>[p.id,p]));
  const starters={...plans.home.starters,...plans.away.starters};
  saveBox(s.year,g.id,{lineScore:game.lineScore,hits:game.hits,errors:game.errors,bat:nonzero(game.battingStats),pit:nonzero(game.pitchingStats),pos:starters});
  for(const [id,p] of who){
    const bat=game.battingStats[id],pit=game.pitchingStats[id];
    if(bat)addLine(p.stats.batting,bat);
    if(pit)addLine(p.stats.pitching,pit);
    spendEnergy(p,{bat,pit,startPos:starters[id],innings,date:g.date});
  }
  for(const plan of [plans.home,plans.away]){
    if(plan.team===0)state.strategy.next=state.rotation[plan.nextTurn]??state.rotation[0]??'';
    else s.rotationTurn[plan.team]=plan.nextTurn;
  }
  s.news=[...s.news,`${md(g.date)} ${teams[g.away]} ${away} : ${home} ${teams[g.home]}`].slice(-20);
  s.phase='regular';
}

export function playLeagueGame(state,g,{autoMine=state.season.autoRestMine}={}){
  const {plans,engine}=createLeagueGame(state,g,{autoMine});
  applyResult(state,g,simulateGame(engine),plans);
}

export function finishDay(state){
  const s=state.season;
  recoverDay(allPlayers(state),s.date);
  s.date=addDays(s.date,1);
  if(s.date.endsWith('-01'))hooks.monthlyTick(state);
  if(!s.schedule.some(g=>g.status==='scheduled'))s.phase='ended';
}

export function standings(state){
  const rows=Object.entries(state.season.standings).map(([team,r])=>({team:Number(team),...r,g:r.w+r.l+r.t,pct:r.w/Math.max(1,r.w+r.l)}));
  rows.sort((a,b)=>b.pct-a.pct||(b.rf-b.ra)-(a.rf-a.ra)||a.team-b.team);
  const top=rows[0];
  return rows.map(r=>({...r,gb:((top.w-r.w)+(r.l-top.l))/2}));
}

export function seasonLine(stats=blankStats(),pitcher=false){
  const b=stats.batting||{},q=stats.pitching||{},n=k=>b[k]||0,m=k=>q[k]||0;
  const ab=n('ab'),h=n('h'),hr=n('hr'),d=n('doubles'),t=n('triples'),so=n('so'),bbB=n('bb'),hbp=n('hitByPitch'),sf=n('sacFlies'),pa=n('pa');
  const tb=h+d+2*t+3*hr,obp=(h+bbB+hbp)/Math.max(1,ab+bbB+hbp+sf),slg=tb/Math.max(1,ab),outs=m('outs'),er=m('earnedRuns');
  const per9=v=>outs?v*27/outs:0;
  return {pa,ab,h,doubles:d,triples:t,hr:pitcher?m('homeRunsAllowed'):hr,rbi:n('rbi'),sb:n('stolenBases'),attempts:n('stolenBases')+n('caughtStealing'),
    bb:pitcher?m('walks'):bbB,k:pitcher?m('strikeouts'):so,avg:h/Math.max(1,ab),obp,slg,ops:obp+slg,babip:(h-hr)/Math.max(1,ab-so-hr+sf),iso:slg-h/Math.max(1,ab),
    bbRate:bbB/Math.max(1,pa),kRate:so/Math.max(1,pa),g:pitcher?m('games'):n('games'),gs:m('starts'),w:m('wins'),l:m('losses'),sv:m('saves'),hld:m('holds'),
    outs,ip:Math.floor(outs/3)+(outs%3)/10,ha:m('hitsAllowed'),er,r:m('runsAllowed'),hp:m('hitBatters'),era:per9(er),whip:outs?(m('hitsAllowed')+m('walks'))*3/outs:0,
    k9:per9(m('strikeouts')),bb9:per9(m('walks')),war:null};
}

export function startNextSeason(state){
  const year=state.season.year;
  for(const p of allPlayers(state)){
    if(Object.keys(p.stats.batting).length||Object.keys(p.stats.pitching).length)p.history[year]=p.stats;
    p.stats=blankStats();p.age+=1;p.energy=100;p.lastPlayed=null;p.streak=0;
  }
  hooks.offseasonTick(state);
  dropBoxes(year);
  const autoRestMine=state.season.autoRestMine;
  state.season={...createSeason(year+1),autoRestMine};
  state.strategy.next=state.rotation[0]??'';
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/league-season.test.mjs`
Expected: PASS 7/7 (하루 5경기 시뮬로 약 1초)

- [ ] **Step 5: 커밋**

```bash
git add game/league-season.js tests/league-season.test.mjs
git commit -m "Add league season core: results, standings, day advance, tick hooks, box scores, season rollover" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 저장 v3와 v2 마이그레이션

**Files:**
- Modify: `model.js` (`STATE_KEY` 줄과 `loadState` 함수)
- Test: `tests/league-data.test.mjs`의 저장 테스트가 v2 키를 쓰면 v3로 고치고, `tests/league-season.test.mjs`에 마이그레이션 테스트 추가

**Interfaces:**
- Consumes: `ensureSeason` (Task 4) — `model.js`는 import 하지 않는다(순환 방지). app.js가 `loadState` 결과에 `ensureSeason`을 적용한다.
- Produces: `STATE_KEY='dugout-prototype-v3'`, `PREV_KEY='dugout-prototype-v2'`, `loadState(storage)`가 v3 → v2 순서로 읽고, v2를 읽었으면 v2 키를 지운다(다음 저장은 v3).

- [ ] **Step 1: 실패하는 테스트 추가** (`tests/league-season.test.mjs` 끝에)

```js
import {loadState,STATE_KEY,PREV_KEY} from '../model.js';

test('v2 저장(개막 전)을 편성 그대로 v3 시즌 상태로 옮긴다',()=>{
  const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
  const v2=initialState();v2.order=[...v2.order].reverse();
  mem.set(PREV_KEY,JSON.stringify(v2));
  const {state}=loadState(storage);
  ensureSeason(state);
  assert.equal(STATE_KEY,'dugout-prototype-v3');
  assert.deepEqual(state.order,v2.order);
  assert.equal(state.season.date,'2026-03-28');
  assert.ok(state.players.every(p=>p.energy===100&&p.stats));
  assert.equal(mem.has(PREV_KEY),false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/league-season.test.mjs`
Expected: FAIL — `PREV_KEY` undefined / 편성이 초기값

- [ ] **Step 3: 구현** — `model.js`에서 두 곳만 바꾼다(포맷 유지)

`export const STATE_KEY='dugout-prototype-v2',LEGACY_KEYS=['dugout-prototype-v1','dugout-active-game-v1'];` →

```js
export const STATE_KEY='dugout-prototype-v3',PREV_KEY='dugout-prototype-v2',LEGACY_KEYS=['dugout-prototype-v1','dugout-active-game-v1'];
```

`loadState` 안의 `try{const saved=JSON.parse(storage.getItem(STATE_KEY));if(saved?.league)return {state:saved,reset:false};}catch{}` →

```js
try{const saved=JSON.parse(storage.getItem(STATE_KEY));if(saved?.league)return {state:saved,reset:false};}catch{}try{const prev=JSON.parse(storage.getItem(PREV_KEY));storage.removeItem(PREV_KEY);if(prev?.league)return {state:prev,reset:false};}catch{}
```

(v2는 개막 전 상태라 그대로 쓰고, 시즌 필드는 app.js에서 `ensureSeason`이 채운다.) `tests/league-data.test.mjs`에서 `STATE_KEY`가 `'dugout-prototype-v2'`와 같다고 단언하는 곳이 있으면 `'dugout-prototype-v3'`로 고친다.

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/*.test.mjs`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add model.js tests/league-season.test.mjs tests/league-data.test.mjs
git commit -m "Bump save to v3 and carry v2 pre-season saves forward" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 여러 날 진행 러너

**Files:**
- Create: `game/season-runner.js`
- Test: `tests/season-runner.test.mjs`

**Interfaces:**
- Consumes: `todayGames`, `myGame`, `lineupProblem`, `playLeagueGame`, `finishDay`, `flushBoxes` (Task 4); `addDays` (Task 1)
- Produces:
  - `targetDate(state, unit: 'day'|'week'|'month'|'season'): string` — day=오늘, week=오늘+6, month=그달 말일, season=일정 마지막 날
  - `advance(state, until, {onProgress, shouldStop, save, pause}={}) → Promise<{done, total, stopped?, blocked?}>`
    - 오늘부터 `until`(포함)까지 하루씩: 내 경기가 남아 있고 `lineupProblem`이 있으면 그날 시작 전에 `{blocked:메시지}`로 끝. 남은 경기를 한 경기씩 `playLeagueGame` 후 `onProgress({done,total,date})`, `await pause()`(기본 `setTimeout(0)`). 하루가 끝나면 `finishDay` → `flushBoxes(year)` → `save(state)`. 그 뒤 `shouldStop()`이 참이면 `{stopped:true}`.
    - `phase==='ended'`면 멈춘다. `save`가 던진 예외(저장 용량 초과)는 그대로 전달한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/season-runner.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../model.js';
import {ensureSeason,standings} from '../game/league-season.js';
import {advance,targetDate} from '../game/season-runner.js';

const fast={pause:()=>Promise.resolve()};

test('진행 목표일',()=>{
  const s=ensureSeason(initialState());
  assert.equal(targetDate(s,'day'),'2026-03-28');
  assert.equal(targetDate(s,'week'),'2026-04-03');
  assert.equal(targetDate(s,'month'),'2026-03-31');
  assert.equal(targetDate(s,'season'),'2026-09-16');
});

test('1주 진행: 하루마다 저장, 진행률 보고, 3/31→4/1 월 경계 통과',async()=>{
  const s=ensureSeason(initialState());let saves=0,last;
  const r=await advance(s,targetDate(s,'week'),{...fast,save:()=>saves++,onProgress:p=>last=p});
  assert.equal(s.season.date,'2026-04-04');
  assert.equal(saves,7);
  assert.equal(r.done,r.total);
  assert.equal(last.done,r.done);
  assert.equal(standings(s).reduce((a,x)=>a+x.g,0),r.done*2);
});

test('중단은 그날을 마친 뒤 멈춘다',async()=>{
  const s=ensureSeason(initialState());
  const r=await advance(s,targetDate(s,'season'),{...fast,shouldStop:()=>true});
  assert.equal(r.stopped,true);
  assert.equal(s.season.date,'2026-03-29');
  assert.ok(s.season.schedule.filter(g=>g.date==='2026-03-28').every(g=>g.status==='final'));
});

test('내 라인업이 무효면 그날 시작 전에 멈춘다',async()=>{
  const s=ensureSeason(initialState());s.order=[];
  const r=await advance(s,targetDate(s,'week'),fast);
  assert.ok(r.blocked);
  assert.equal(r.done,0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/season-runner.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: 구현**

```js
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
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/season-runner.test.mjs`
Expected: PASS 4/4 (1주 테스트 약 3–4초)

- [ ] **Step 5: 커밋**

```bash
git add game/season-runner.js tests/season-runner.test.mjs
git commit -m "Add multi-day season runner with progress, stop, per-day save" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: app.js — 시즌 로드, 헤더, 진행 버튼·모달, LIVE GAME 연결

`app.js`는 78줄에 문장이 `;`로 이어진 압축 파일이다. 아래 "찾기" 문자열을 Edit으로 정확히 바꾸고, 그 밖의 부분은 건드리지 않는다. 브라우저 확인은 `npm run dev` 후 http://127.0.0.1:4173.

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `ensureSeason`, `myGame`, `applyResult`, `standings`, `startNextSeason`, `allPlayers`, `seasonLine`, `loadBox`, `lineupProblem` (Task 4); `advance`, `targetDate` (Task 6); `createLeagueGame`, `saveActive`, `loadActive`, `clearActive`, `advanceDugoutGame` (Task 3); `simulateGame` (game/engine.js)
- Produces(Task 8·9에서 사용): 전역 헬퍼 `fmtDate(iso)`, `myRecord()`, `runAdvance(unit)`

- [ ] **Step 1: import와 로드 교체**

찾기: `import {createDugoutGame,advanceDugoutGame,saveDugoutGame,loadDugoutGame,clearDugoutGame} from './game-bridge.js';`
바꾸기:
```js
import {createLeagueGame,advanceDugoutGame,saveActive,loadActive,clearActive} from './game-bridge.js';import {simulateGame} from './game/engine.js';import {ensureSeason,myGame,applyResult,standings as leagueTable,startNextSeason,allPlayers,seasonLine,loadBox,lineupProblem,todayGames} from './game/league-season.js';import {advance,targetDate} from './game/season-runner.js';
```

찾기: `try{({state,reset:resetNotice}=loadState(localStorage));}catch{state=initialState();}`
바꾸기:
```js
try{({state,reset:resetNotice}=loadState(localStorage));}catch{state=initialState();}ensureSeason(state);
```
그리고 `model.js` import 목록에 `initialState`를 추가한다(기존 catch가 import 없이 쓰던 버그): 첫 줄 `import {teams,marks,positions,teamPlayers,loadState,STATE_KEY,` → `import {teams,marks,positions,teamPlayers,loadState,initialState,teamSetup,STATE_KEY,`.

찾기: `activeGame=loadDugoutGame(),engineBusy=false`
바꾸기: `activeGame=loadActive(),engineBusy=false,advancing=false,stopRequested=false,recordYear='now',recordQualified=true`

`activeGame`은 이제 `{gameId, plans, game}`이다. 로드 직후 오늘 내 경기와 맞지 않으면 버린다 — `ensureSeason(state);` 뒤에 이어서 추가:
```js
if(activeGame&&activeGame.gameId!==myGame(state)?.id){clearActive();activeGame=null;}
```

- [ ] **Step 2: save()가 용량 초과를 호출자에게 알리도록**

찾기: `function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('브라우저 저장 공간을 사용할 수 없어 이번 세션에만 반영됩니다.');}}`
바꾸기:
```js
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('브라우저 저장 공간을 사용할 수 없어 이번 세션에만 반영됩니다.');}}function saveStrict(){localStorage.setItem(KEY,JSON.stringify(state));}
const DAYS=['일','월','화','수','목','금','토'],fmtDate=iso=>`${iso.slice(0,4)}. ${iso.slice(5,7)}. ${iso.slice(8,10)} (${DAYS[new Date(iso+'T00:00:00Z').getUTCDay()]})`;
function myRecord(){const r=state.season.standings[0];return `${r.w}승 ${r.l}패 ${r.t}무`;}
```

- [ ] **Step 3: 헤더 날짜와 진행 버튼**

찾기(shell 안): `<div class="date">2026 시즌 <span class="muted">개막 전</span><small>스프링캠프 &nbsp;|&nbsp; ${teams[0]}</small></div><button class="primary" data-action="start">게임 시작 <span>▶</span></button>`
바꾸기:
```js
<div class="date">${fmtDate(state.season.date)} <span class="muted">${({preseason:'개막 전',regular:'정규시즌',ended:'시즌 종료'})[state.season.phase]}</span><small>${state.season.year} · ${leagueTable(state).find(r=>r.team===0).g}경기 ${myRecord()} &nbsp;|&nbsp; ${teams[0]}</small></div><div class="advance"><button class="primary" data-advance="day">다음 날 <span>▶</span></button><button class="secondary" data-advance="week">다음 주</button><button class="secondary" data-advance="month">월말</button><button class="secondary" data-advance="season">시즌 끝</button><label class="muted"><input type="checkbox" data-action="autorest" ${state.season.autoRestMine?'checked':''}> 내 팀 자동 휴식</label></div>
```
(찾기 문자열의 `&nbsp;|&nbsp;`는 원본에서 `&nbsp` `|` `&nbsp` 사이에 `;`가 있는 형태 그대로다. 원본을 Read로 확인하고 정확히 맞춘다.) `styles.css` 끝에 한 줄 추가: `.advance{display:flex;gap:8px;align-items:center;flex-wrap:wrap}`.

- [ ] **Step 4: 진행 함수와 모달**

`function start(){`로 시작해 `showModal('LIVE GAME · 실제 매치엔진',gameMarkup(activeGame));}`로 끝나는 `start` 함수 전체를 다음으로 바꾼다:

```js
function progressMarkup(p){const pct=p.total?Math.round(p.done/p.total*100):100;return `<div class="eyebrow">SIMULATING</div><h2 style="margin:10px 0">${fmtDate(p.date||state.season.date)}</h2><div class="meter" style="height:10px"><i style="width:${pct}%"></i></div><p>${p.done} / ${p.total}경기 · ${teams[0]} ${myRecord()}</p><div class="modalactions"><button class="secondary" data-action="stop">중단</button></div>`;}
function endMarkup(){const rows=leagueTable(state);return `<div class="eyebrow">SEASON FINAL</div><h2 style="margin:10px 0 18px">${state.season.year} 시즌 종료</h2><p>${teams[0]} 최종 ${rows.findIndex(r=>r.team===0)+1}위 · ${myRecord()}</p>${standings()}<div class="modalactions"><button class="primary" data-action="nextseason">다음 시즌으로 →</button></div>`;}
async function runAdvance(unit){
  if(advancing)return;
  if(state.season.phase==='ended'){showModal('시즌 종료',endMarkup());return;}
  const mine=myGame(state);
  if(unit==='day'&&mine?.status==='scheduled'){start();return;}
  if(activeGame){if(!confirm('진행 중인 경기를 자동으로 끝내고 진행할까요?'))return;activeGame.game=simulateGame(activeGame.game);finishMyGame(false);}
  advancing=true;stopRequested=false;
  showModal('시즌 진행',progressMarkup({done:0,total:0}));
  try{
    const r=await advance(state,targetDate(state,unit),{save:saveStrict,shouldStop:()=>stopRequested,onProgress:p=>{const body=modal.querySelector('.modalbody');if(body)body.innerHTML=progressMarkup(p);}});
    if(r.blocked){showModal('경기 준비',`<p>${r.blocked}</p><div class="modalactions"><button class="primary" data-nav="lineup">라인업 확인 →</button></div>`);}
    else if(state.season.phase==='ended')showModal('시즌 종료',endMarkup());
    else{if(modal.open)modal.close();toast(`${fmtDate(state.season.date)}까지 진행 · ${teams[0]} ${myRecord()}`);}
  }catch(error){
    showModal('진행 중단',`<p>${error?.name==='QuotaExceededError'?'저장 공간이 부족해 진행을 멈췄습니다. 마지막으로 끝난 날까지 저장되어 있습니다.':'경기 처리 중 오류가 나 진행을 멈췄습니다: '+esc(error?.message)}</p><div class="modalactions"><button class="secondary" data-close>닫기</button></div>`);
  }finally{advancing=false;render();}
}
function start(){
  const problem=lineupProblem(state);
  if(problem){showModal('경기 준비 · '+teams[0],`<div class="eyebrow">PRE-GAME CHECK</div><h2 style="margin:10px 0 18px">라인업을 먼저 완성해주세요.</h2><p>${problem}</p><div class="modalactions"><button class="secondary" data-close>사무실로 돌아가기</button><button class="primary" data-nav="lineup">라인업 확인 →</button></div>`);return;}
  const g=myGame(state);if(!g)return;
  if(!activeGame){const {plans,engine}=createLeagueGame(state,g,{autoMine:false});activeGame={gameId:g.id,plans,game:engine};saveActive(activeGame);}
  showModal('LIVE GAME · 실제 매치엔진',gameMarkup(activeGame.game));
}
/** 내 경기 결과를 반영한다. restOfDay 면 이어서 그날 나머지 경기를 돌리고 하루를 마친다. */
function finishMyGame(restOfDay=true){
  const g=state.season.schedule.find(x=>x.id===activeGame.gameId);
  applyResult(state,g,activeGame.game,activeGame.plans);
  clearActive();activeGame=null;save();
  if(restOfDay)runAdvance('day');
}
```

`runAdvance('day')`은 내 경기가 이미 final이므로 `start()`로 가지 않고 `advance(state, 오늘)`로 나머지 경기와 `finishDay`를 처리한다.

- [ ] **Step 5: 클릭 핸들러 연결**

찾기: `if(d.action==='start')start();`
바꾸기:
```js
if(d.action==='start')start();if(d.advance)runAdvance(d.advance);if(d.action==='stop'){stopRequested=true;el.disabled=true;el.textContent='오늘 경기까지 마치고 멈춥니다';}if(d.action==='nextseason'){startNextSeason(state);save();modal.close();render();toast(`${state.season.year} 시즌 개막 전으로 넘어왔습니다.`);}
```

`change` 핸들러에 자동 휴식 토글 — 찾기: `document.addEventListener('change',e=>{const d=e.target.dataset,value=e.target.value;`
바꾸기:
```js
document.addEventListener('change',e=>{const d=e.target.dataset,value=e.target.value;if(d.action==='autorest'){state.season.autoRestMine=e.target.checked;save();toast(e.target.checked?'여러 날 진행 때 내 팀도 자동 휴식을 적용합니다.':'여러 날 진행 때 내 팀은 짠 라인업 그대로 나갑니다.');return;}
```

엔진 모달 핸들러 — 찾기: `if(action==='close'){clearDugoutGame();activeGame=null;modal.close();return;}`
바꾸기:
```js
if(action==='close'){modal.close();if(activeGame?.game.status==='final')finishMyGame();return;}
```
같은 핸들러의 `activeGame=advanceDugoutGame(activeGame,action);saveDugoutGame(activeGame);showModal('LIVE GAME · 실제 매치엔진',gameMarkup(activeGame));` →
```js
activeGame.game=advanceDugoutGame(activeGame.game,action);saveActive(activeGame);showModal('LIVE GAME · 실제 매치엔진',gameMarkup(activeGame.game));
```

`createDugoutGame`, `saveDugoutGame`, `loadDugoutGame`, `clearDugoutGame`이 app.js에 더 남아 있지 않은지 `grep -n "DugoutGame" app.js`로 확인한다(`advanceDugoutGame`만 남아야 한다).

- [ ] **Step 6: 수동 확인**

Run: `npm test` → PASS 전부. `npm run dev` 후 브라우저에서:
1. 헤더에 `2026. 03. 28 (토) 개막 전`, 버튼 4개, 토글이 보인다.
2. [다음 날] → LIVE GAME → [경기 끝까지 자동] → [결과 확인 완료] → 진행 모달 → 토스트 `2026. 03. 29 (일)까지 진행`. 헤더 전적이 1경기로 바뀐다.
3. [다음 주] → 진행률이 움직이고 [중단]을 누르면 그날 끝에 멈춘다. 새로고침해도 날짜가 유지된다.
4. LIVE GAME 도중 모달을 닫고 새로고침 → [다음 날]로 같은 경기가 이어진다.

- [ ] **Step 7: 커밋**

```bash
git add app.js styles.css
git commit -m "Wire day advance, progress modal, and live game into the season" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: app.js — 홈(순위·브리핑·소식·알림)과 달력·박스스코어

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: Task 7의 `fmtDate`, `myRecord`; Task 4의 `leagueTable`(import 별칭), `seasonLine`, `loadBox`, `allPlayers`, `todayGames`; `teamSetup` (model.js)

- [ ] **Step 1: 순위표**

`function standings(){return `로 시작해 `<span>6월 13일 경기 종료 기준</span></div>`}`로 끝나는 함수 전체를 바꾼다:

```js
function standings(){const rows=leagueTable(state),played=state.season.schedule.filter(g=>g.status==='final').at(-1);return `<div class="tablewrap" style="max-height:none"><table class="standings"><thead><tr><th>순위</th><th class="name">구단</th><th>경기</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>승차</th><th>최근 5경기</th></tr></thead><tbody>${rows.map((r,i)=>`<tr class="${r.team===0?'own':''}"><td>${i+1}</td><td class="name">${teamButton(r.team)}</td><td>${r.g}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pct.toFixed(3)}</td><td>${r.gb?r.gb.toFixed(1):'—'}</td><td>${r.last.join(' ')||'—'}</td></tr>`).join('')}</tbody></table></div><div class="panelnote"><span>정규시즌 144경기</span><span>${played?fmtDate(played.date)+' 경기 종료 기준':'개막 전'}</span></div>`}
```

- [ ] **Step 2: 다음 경기 브리핑**

`function home(){const next=schedule().find(g=>g.day===14),opp=next.op;` 부터 `oppSp=teamPlayers(state,opp).find(p=>p.group==='first'&&p.role==='SP')` 까지를 다음으로 바꾼다:

```js
function home(){const next=state.season.schedule.find(g=>g.status==='scheduled'&&(g.home===0||g.away===0));if(!next)return `<div class="homegrid">${panel('리그 순위',standings(),'<span class="tag">정규시즌 · 최종</span>','standings-panel')}${panel('리그 소식 · 특이사항 & 팀 메시지',homeUpdates(),'','updates-panel')}</div>`;const opp=next.home===0?next.away:next.home,atHome=next.home===0,theirs=teamSetup(teamPlayers(state,opp))
const line=p=>p?.stats?.pitching?.outs?{...seasonLine(p.stats,true),label:String(state.season.year)}:{...p,label:'2025'},sp=byId(state.strategy.next)||byId(state.rotation[0]),oppSp=teamPlayers(state,opp).find(p=>p.id===theirs.rotation[(state.season.rotationTurn[opp]||0)%Math.max(1,theirs.rotation.length)]),spl=line(sp),opl=line(oppSp),h2h=state.season.schedule.filter(g=>g.status==='final'&&[g.home,g.away].includes(0)&&[g.home,g.away].includes(opp)),h2w=h2h.filter(g=>(g.home===0?g.score.home>g.score.away:g.score.away>g.score.home)).length,h2l=h2h.filter(g=>(g.home===0?g.score.home<g.score.away:g.score.away<g.score.home)).length
```

같은 함수 안 문자열 치환(각각 한 번):
- `REGULAR SEASON · GAME 61` → `REGULAR SEASON · GAME ${leagueTable(state).find(r=>r.team===0).g+1} · ${fmtDate(next.date)}`
- `<small>HOME · 개막 전</small>` → `<small>${atHome?'HOME':'AWAY'}</small>`
- `<small>AWAY · 상대 전력 보기 ↗</small>` → `<small>${atHome?'AWAY':'HOME'} · 상대 전력 보기 ↗</small>`
- `${sp?sp.era.toFixed(2):'—'} ERA &nbsp;/&nbsp; ${sp?.w||0}승 ${sp?.l||0}패 (2025)` → `${sp?Number(spl.era).toFixed(2):'—'} ERA &nbsp;/&nbsp; ${spl.w||0}승 ${spl.l||0}패 (${spl.label}) · 체력 ${sp?.energy??'—'}%`
- `${oppSp.era.toFixed(2)} ERA &nbsp;/&nbsp; ${oppSp.w}승 ${oppSp.l}패 (2025)` → `${Number(opl.era).toFixed(2)} ERA &nbsp;/&nbsp; ${opl.w||0}승 ${opl.l||0}패 (${opl.label}) · 체력 ${oppSp?.energy??'—'}%`
- `${teams[0].split(' ')[0]} 홈구장` → `${teams[atHome?0:opp].split(' ')[0]} 홈구장`
- `<span style="color:var(--mint)">4승 2패</span>` → `<span style="color:var(--mint)">${h2w}승 ${h2l}패</span>`
- `'<span class="tag">오늘 18:30</span>'` → `` `<span class="tag">${next.date===state.season.date?'오늘':fmtDate(next.date)} 18:30</span>` ``

(`&nbsp;/&nbsp;`는 원본의 `&nbsp` `/` `&nbsp` 형태 그대로 맞춘다.)

- [ ] **Step 3: 리그 소식과 체력 알림**

`homeUpdates` 안 `const news=`<div class="newslist">` 부터 `</article></div>`;` (세 번째 article 끝)까지를 바꾼다:

```js
const news=`<div class="newslist">${state.season.news.slice(-6).reverse().map(line=>`<article class="news"><span class="newsicon">◷</span><div><small>경기 결과</small><h3>${esc(line)}</h3></div></article>`).join('')||'<article class="news"><span class="newsicon">◷</span><div><small>리그 일정</small><h3>'+fmtDate(state.season.date)+' 개막</h3><p>정규시즌 144경기</p></div></article>'}</div>`;
```

같은 함수의 `first().filter(p=>p.energy<65)` → `first().filter(p=>p.energy<60)`.

- [ ] **Step 4: 달력**

`function calendar(){` 부터 다음 `function records(){` 직전까지를 바꾼다:

```js
function calendar(){const year=state.season.year,days=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7
const cell=d=>{const iso=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`,day=state.season.schedule.filter(g=>g.date===iso),g=day.find(x=>x.home===0||x.away===0),today=iso===state.season.date
if(!day.length)return `<article class="day ${today?'today':''}"><div class="daynumber"><span>${d}</span><span>${today?'TODAY':''}</span></div><div class="rest">— &nbsp; 휴식일</div></article>`
const opp=g.home===0?g.away:g.home,mine=g.status==='final'?(g.home===0?[g.score.home,g.score.away]:[g.score.away,g.score.home]):null
return `<article class="day ${today?'today':''}"><div class="daynumber"><span>${d}</span><span>${today?'TODAY':g.home===0?'HOME':'AWAY'}</span></div>${teamButton(opp)}${mine?`<button class="matchresult ${mine[0]<mine[1]?'loss':''}" data-box="${g.id}" aria-label="${month}월 ${d}일 박스스코어"><span>${mine[0]>mine[1]?'W':mine[0]===mine[1]?'D':'L'}</span>${mine[0]} : ${mine[1]} <small>↗</small></button>`:'<div class="matchresult"><span style="color:#b6c7d4;background:#2b3b49">18:30</span><small>경기 예정</small></div>'}<button class="smalllink" data-day="${iso}">전체 경기 →</button></article>`}
return `<div class="toolbar"><button class="secondary" data-month="-1" aria-label="이전 달">←</button><h2 style="font-size:20px;margin:0 6px">${year}년 ${month}월</h2><button class="secondary" data-month="1" aria-label="다음 달">→</button><button class="secondary" data-action="thismonth">이번 달</button></div><div class="calendarouter"><div class="calendar">${['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d=>`<div class="weekday">${d}</div>`).join('')}${Array.from({length:offset},()=>'<div class="day blank"></div>').join('')}${Array.from({length:days},(_,i)=>cell(i+1)).join('')}</div></div>`}
function dayGames(iso){const games=state.season.schedule.filter(g=>g.date===iso)
showModal(`${fmtDate(iso)} · 전체 경기`,`<div class="tablewrap"><table><tbody>${games.map(g=>`<tr><td class="name">${teams[g.away]}</td><td>${g.status==='final'?g.score.away+' : '+g.score.home:'18:30'}</td><td class="name">${teams[g.home]}</td><td>${g.status==='final'?`<button class="secondary" data-box="${g.id}">박스스코어</button>`:'예정'}</td></tr>`).join('')}</tbody></table></div><div class="modalactions"><button class="primary" data-close>닫기</button></div>`)}
```

- [ ] **Step 5: 박스스코어**

`function boxScore(day){` 부터 다음 `function start` 또는 `function progressMarkup` 직전까지(모달의 "화면 검토용 경기 기록입니다." 문구 포함)를 바꾼다:

```js
function boxScore(id){const g=state.season.schedule.find(x=>x.id===id),b=g&&loadBox(state.season.year,id);if(!b){toast('박스스코어가 없습니다.');return}currentBox=id
const who=new Map(allPlayers(state).map(p=>[p.id,p])),dec=g.decisions||{}
const side=team=>{const ids=new Set(teamPlayers(state,team).map(p=>p.id)),n=l=>k=>l[k]||0
const bat=Object.entries(b.bat).filter(([i])=>ids.has(i)).map(([i,l])=>{const v=n(l);return {name:who.get(i).name,pos:b.pos[i]||'PH',ab:v('ab'),h:v('h'),rbi:v('rbi'),bb:v('bb'),k:v('so')}})
const pit=Object.entries(b.pit).filter(([i])=>ids.has(i)).map(([i,l])=>{const v=n(l),o=v('outs');return {name:who.get(i).name+(dec.win===i?' (승)':dec.loss===i?' (패)':dec.save===i?' (세)':''),pos:who.get(i).pos,ip:Math.floor(o/3)+(o%3)/10,ha:v('hitsAllowed'),r:v('runsAllowed'),er:v('earnedRuns'),bb:v('walks'),k:v('strikeouts')}})
return {team,bat,pit}}
const sides=[side(g.away),side(g.home)],inn=Math.max(b.lineScore.away.length,b.lineScore.home.length)
showModal(`${fmtDate(g.date)} · 박스스코어`,`<div class="modalscore"><span>${teams[g.away]} &nbsp; vs &nbsp; ${teams[g.home]}</span><strong>${g.score.away} : ${g.score.home}</strong><span class="tag">경기 종료${g.innings>9?' · '+g.innings+'회':''}</span></div><div class="tablewrap"><table><thead><tr><th class="name">TEAM</th>${Array.from({length:inn},(_,i)=>`<th>${i+1}</th>`).join('')}<th>R</th><th>H</th><th>E</th></tr></thead><tbody>${[['away',g.away],['home',g.home]].map(([s,t])=>`<tr><td class="name">${teams[t]}</td>${Array.from({length:inn},(_,i)=>`<td>${b.lineScore[s][i]??'—'}</td>`).join('')}<td class="ratingpill">${g.score[s]}</td><td>${b.hits[s]}</td><td>${b.errors[s]}</td></tr>`).join('')}</tbody></table></div>${sides.map((x,i)=>`<h3 style="margin:20px 0 12px;font-size:14px">${teams[x.team]} · 타자 기록</h3>${table('boxbat'+i,x.bat,['pos','name','ab','h','rbi','bb','k'])}<h3 style="margin:20px 0 12px;font-size:14px">${teams[x.team]} · 투수 기록</h3>${table('boxpit'+i,x.pit,['pos','name','ip','ha','r','er','bb','k'])}`).join('')}<div class="modalactions"><button class="secondary" data-team="${g.home===0?g.away:g.home}">상대팀 로스터</button><button class="primary" data-close>닫기</button></div>`)}
```

- [ ] **Step 6: 핸들러와 import 정리**

- 찾기: `if(d.box){boxScore(Number(d.box));return;}` → 바꾸기: `if(d.box){boxScore(d.box);return;}if(d.day){dayGames(d.day);return;}`
- 찾기: `if(d.action==='thismonth'){month=6;render();}` → 바꾸기: `if(d.action==='thismonth'){month=Number(state.season.date.slice(5,7));render();}`
- 찾기: `let view='home',lineupTab='batters',recordTab='batters',recordGroup='basic',recordScope='all',recordPos='all',query='',month=3,` → `month=3,`을 `month=Number(state.season.date.slice(5,7)),`로 바꾼다.
- 첫 줄 model import에서 `schedule`을 뺀다(`grep -n "schedule(" app.js`가 비어야 한다). `model.js`의 `schedule` 함수는 공유 파일 최소 수정 원칙상 남겨 둔다.

- [ ] **Step 7: 확인**

Run: `npm test` → PASS. `npm run dev`에서 [다음 주] 진행 후:
1. 홈 순위표 경기 수 합이 진행한 경기의 2배, 최근 5경기가 W/L로 보인다.
2. 브리핑 상대·홈/원정이 달력의 다음 경기와 같다.
3. 달력 3월·4월에 월요일 휴식일, 결과 칸 → 박스스코어의 이닝 합이 점수와 같다. [전체 경기 →] → 5경기 목록 → 다른 팀 박스스코어.
4. 로스터에서 체력이 100보다 낮은 선수가 보인다.

- [ ] **Step 8: 커밋**

```bash
git add app.js
git commit -m "Show real standings, briefing, news, calendar, and box scores" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: app.js — 기록실 연도·규정 필터

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `seasonLine`, `leagueTable` (Task 4); 전역 `recordYear`('now' | '2025' | 과거 연도 문자열), `recordQualified` (Task 7 Step 1에서 선언)

- [ ] **Step 1: 기록 보기 변환과 규정 필터**

`function records(){const isBat=recordTab==='batters',isTeam=recordTab==='teams';` 바로 뒤의 `let players=(recordScope==='mine'?state.players:teams.flatMap((_,i)=>teamPlayers(state,i))).filter(p=>p.pitcher!==isBat&&p.name.includes(query)&&(recordPos==='all'||p.pos===recordPos));` 를 바꾼다:

```js
const table0=leagueTable(state),teamGames=i=>recordYear==='now'?table0.find(r=>r.team===i).g:144,view=p=>recordYear==='2025'?p:{...p,...seasonLine(recordYear==='now'?p.stats:p.history?.[recordYear],p.pitcher)},qualified=p=>!recordQualified||recordYear==='2025'||(p.pitcher?p.outs/3>=teamGames(p.teamIndex):p.pa>=teamGames(p.teamIndex)*3.1)
let players=(recordScope==='mine'?state.players:teams.flatMap((_,i)=>teamPlayers(state,i))).filter(p=>p.pitcher!==isBat&&p.name.includes(query)&&(recordPos==='all'||p.pos===recordPos)).map(view).filter(qualified)
```

- [ ] **Step 2: 팀 기록을 올해 순위와 누적으로**

`const teamRows=teams.map((t,i)=>{const ps=teamPlayers(state,i),bs=ps.filter(p=>!p.pitcher),sum=k=>bs.reduce((s,p)=>s+p[k],0),` 로 시작해 `r:sum('rbi')+15}});` 로 끝나는 부분을 바꾼다:

```js
const teamRows=teams.map((t,i)=>{const st=table0.find(r=>r.team===i),bs=teamPlayers(state,i).filter(p=>!p.pitcher).map(p=>({...p,...seasonLine(p.stats,false)})),sum=k=>bs.reduce((s,p)=>s+(p[k]||0),0),ab=sum('ab'),h=sum('h'),bb=sum('bb'),pa=sum('pa'),tb=h+sum('doubles')+2*sum('triples')+3*sum('hr');return {name:t,rank:table0.indexOf(st)+1,g:st.g,w:st.w,l:st.l,avg:h/Math.max(1,ab),obp:(h+bb)/Math.max(1,pa),slg:tb/Math.max(1,ab),ops:(h+bb)/Math.max(1,pa)+tb/Math.max(1,ab),pa,ab,h,hr:sum('hr'),rbi:sum('rbi'),k:sum('k'),bb,sb:sum('sb'),r:st.rf}}).sort((a,b)=>a.rank-b.rank);
```

- [ ] **Step 3: 필터 UI**

- 찾기: `<span class="right muted">2025 기록 (원문)</span>` → 바꾸기: `<span class="right muted">${isTeam?state.season.year+' 시즌':recordYear==='2025'?'2025 기록 (원문)':(recordYear==='now'?state.season.year:recordYear)+' 시즌 누적'}</span>`
- 찾기: `.replace('>mine<','>내 팀 보기<')}</select>` → 뒤에 이어 붙인다:
```js
${!isTeam?`<select aria-label="기록 연도" data-filter="year">${['now',...new Set(allPlayers(state).flatMap(p=>Object.keys(p.history||{})))].sort().reverse().concat('2025').map(y=>`<option value="${y}" ${recordYear===y?'selected':''}>${y==='now'?state.season.year:y}${y==='2025'?' (원문)':''}</option>`).join('')}</select><select aria-label="규정 필터" data-filter="qualified"><option value="1" ${recordQualified?'selected':''}>규정 이상</option><option value="0" ${recordQualified?'':'selected'}>전체</option></select>`:''}
```
  (`'now'`는 정렬 후 맨 앞이 되도록: `['now',...history].sort().reverse()`는 숫자 문자열보다 `'now'`가 크므로 맨 앞에 온다.)
- change 핸들러 — 찾기: `if(d.filter==='pos')recordPos=value;` → 뒤에 추가: `if(d.filter==='year')recordYear=value;if(d.filter==='qualified')recordQualified=value==='1';`

- [ ] **Step 4: WAR 표시**

`val` 함수의 `if(['k9','bb9','ip','war'].includes(k))return Number(p[k]).toFixed(1);` 앞에 추가: `if(k==='war'&&p.war==null)return '—';`

- [ ] **Step 5: 확인**

Run: `npm test` → PASS. `npm run dev`에서 한 달 진행 후 기록실:
1. 기본 연도 2026 + "규정 이상" — 타자 타석이 팀 경기 수 × 3.1 이상인 선수만 나온다. "전체"로 바꾸면 늘어난다.
2. 연도 2025 선택 시 1단계 원문 기록이 그대로 나온다.
3. 투수 탭 ERA·이닝·삼진이 박스스코어 합과 맞는다(한 선수 표본 확인).
4. 팀 탭 경기·승·패가 홈 순위표와 같다.

- [ ] **Step 6: 커밋**

```bash
git add app.js
git commit -m "Records: current-season stats by default, year selector, qualified filter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 시즌 스모크, 스펙 보정, 빌드

**Files:**
- Create: `scripts/season-smoke.mjs`
- Modify: `package.json` (스크립트 추가), `docs/superpowers/specs/2026-09-29-season-progression-design.md`, `README.md`(한 줄), `dist/`(빌드 산출)

- [ ] **Step 1: 스모크 스크립트**

```js
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
```

`package.json` `scripts`에 `"test:season":"node scripts/season-smoke.mjs"`를 추가한다(한 줄 JSON 포맷 유지).

- [ ] **Step 2: 스모크 실행**

Run: `npm run test:season`
Expected: `경기 720/720 · N초`(목표 ≤ 90초). 계획 작성 시 이 계획의 Task 1–6 코드로 실측: 53초, KT 주전 평균 체력 50.1(최저 37.2), 불펜 투수 선발 15회(1단계 `teamSetup`이 선발 5명을 불펜으로 채운 경우 포함). 출력(주전 평균 체력, 불펜 데이 횟수)을 PR 설명에 붙인다. 주전 평균 체력이 30 미만이거나 불펜 데이가 구단당 20회를 넘으면 `FATIGUE`를 조정하지 말고 결과를 보고한다(튜닝은 사용자 확인 후).

- [ ] **Step 3: 스펙 보정 반영**

`docs/superpowers/specs/2026-09-29-season-progression-design.md` 끝에 추가:

```md
## 구현 시 보정 (2026-09-29, 구현 계획)

- 선수 필드 `lastPitched` → `lastPlayed`(모든 선수, 회복 +50% 판정) + `streak`(연속 등판일, 연투 가산).
- 쉬는 날 회복 +50%는 야수만. 투수는 1.0 — 투수까지 적용하면 100구 선발이 이틀 만에 70을 넘어 "5일 뒤 약 95", "4인 로테이션은 지침"과 어긋난다.
- 2026 일정: 3/28 개막, 올스타 휴식 7/9–7/12, 9/16 종료. 개막 주말 2연전, 이후 25주(3연전 주 18, 2연전 3개 주 5, 올스타 주·마지막 주 2연전 1개).
- 시즌 전체 스모크는 `npm run test:season`(1분 이상)으로 분리, `npm test`에는 1주 진행 테스트.
- 진행 중 경기 키 `dugout-active-game-v2`(`{gameId, plans, game}`). v1은 레거시로 삭제.
- 박스스코어 함수는 연도를 받는다: `loadBox(year,id)`, `saveBox(year,id,box)`, `flushBoxes(year)`, `dropBoxes(year)`. 경기마다 메모리에 쌓고 하루 끝에 한 번 쓴다.
- 3단계 훅은 `hooks.monthlyTick(state)` / `hooks.offseasonTick(state)`(`game/league-season.js`).
- 기록실 팀 탭은 연도 선택과 무관하게 올해 시즌을 보여준다.
```

`README.md`의 기능 설명에 한 줄: `- 시즌 진행: 144경기 일정, 날짜 진행(다음 날/주/월말/시즌 끝), 리그 전 경기 시뮬레이션, 체력 관리`.

- [ ] **Step 4: 빌드와 전체 테스트**

Run: `npm run build && npm test`
Expected: 빌드 성공(`dist/game/league-*.js`, `dist/game/season-*.js` 생성), 테스트 전부 PASS. `npm run build`가 `typescript` 없음으로 실패하면 `npm install` 후 재실행.

- [ ] **Step 5: 커밋**

```bash
git add scripts/season-smoke.mjs package.json docs/superpowers/specs/2026-09-29-season-progression-design.md README.md dist
git commit -m "Add full-season smoke script, record implementation adjustments, rebuild dist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: PR 준비 메모**

PR 설명에 포함: 공유 파일 변경(`model.js`: `STATE_KEY` v3·`PREV_KEY`·`loadState`; `app.js`: 헤더·홈·달력·박스스코어·기록실·진행; `game-bridge.js`: `createLeagueGame`·진행 중 경기 키 v2), 저장 버전 v2→v3, 스모크 출력, 범위 밖(AI 1·2군 이동, 부상, 포스트시즌, WAR). 1단계 PR(`feat/league-data`) 머지 후 `git fetch github && git rebase github/main`.
