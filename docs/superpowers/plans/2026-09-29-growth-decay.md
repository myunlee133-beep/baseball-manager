# 성장·퇴화 (3단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2단계의 빈 훅 `monthlyTick`·`offseasonTick`을 채워 410명 전원의 능력치를 나이 곡선대로 성장·하락시키고, 결과를 공용 받은편지함의 스카우트 리포트로 보여준다.

**Architecture:** 성장 로직은 새 파일 `game/growth.js` 하나(순수 함수 + 두 틱 함수), 받은편지함은 새 파일 `game/inbox.js`. 기존 파일은 연결부만 바꾼다(`league-season.js` 훅·기본값, `season-runner.js` 멈춤, `model.js` 저장 v4, `player-ratings.js` export 하나). 화면은 `app.js`에 메시지 탭·팝업·▲▼를 최소 수정으로 붙인다. 모든 난수는 `선수id:연도:월:용도` 문자열 해시라 재실행해도 결과가 같다.

**Tech Stack:** 브라우저용 순수 JS(ES 모듈), 테스트는 `node --test`(`tests/*.test.mjs`), 패키지 설치 없이 실행. `dist/`는 `npm run build`로만 갱신.

**Spec:** [`docs/superpowers/specs/2026-09-29-growth-decay-design.md`](../specs/2026-09-29-growth-decay-design.md)

## Global Constraints

- 사용자에게 보이는 문구와 커밋 메시지·주석은 한국어. 커밋 메시지는 무엇을 왜 바꿨는지 한 줄(AGENTS.md), 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `app.js`, `model.js`는 한 줄 압축 파일이다. 필요한 부분만 정확한 문자열 치환으로 고치고 포맷을 바꾸지 않는다.
- `vendor/`, `game/ratings.js`, `game/engine.js` 등 엔진 이식 원본은 수정하지 않는다.
- 능력치는 20–80 정수, OVR·POT는 `game/player-ratings.js`의 `ovr()`·`potCap()`으로만 계산한다.
- 저장 키: `dugout-prototype-v4`. v3·v2 저장을 이어받는다.
- 보낸 사람 이름은 `스카우트 팀장`.
- 테스트 명령: `node --test tests/<파일>.test.mjs`, 전체는 `npm test`. PR 전 전체 통과 필수.
- 브랜치 `feat/growth-decay`(이미 생성됨, 설계 문서 커밋 `1026cb7` 포함).

## File Structure

| 파일 | 책임 |
|---|---|
| `game/inbox.js` (신규) | 받은편지함 상태 조작: `pushMessage`, `pendingPopup`, `unreadCount`, `markShown`, `markRead`, `markAllRead`, `removeMessage` |
| `game/growth.js` (신규) | 곡선·숨은 특성·해시 난수·적정 리그·성적 상위·능력치 분배·각성/급락·POT, 선수 단위 `rollMonth`/`rollOffseason`, 리그 단위 `monthlyGrowth`/`offseasonGrowth`(메시지·소식 포함) |
| `game/player-ratings.js` | `weightsFor` export |
| `game/league-season.js` | 훅 연결, `ensureSeason`에 `dev`·`inbox` 기본값 |
| `game/season-runner.js` | 중요 메시지가 오면 그날 뒤 멈춤 |
| `model.js` | `STATE_KEY` v4, `PREV_KEYS` |
| `app.js`, `styles.css` | 메시지 탭·배지·화면, 팝업, 홈 메시지 상자, ▲▼ |
| `tests/inbox.test.mjs`, `tests/growth.test.mjs` (신규) | 단위·통합 테스트 |
| `tests/league-season.test.mjs`, `tests/season-runner.test.mjs` | 마이그레이션·history·멈춤 보강 |
| `scripts/growth-smoke.mjs` (신규), `package.json` | 10시즌 튜닝 출력, `npm run test:growth` |

---

### Task 1: 공용 받은편지함 `game/inbox.js`

**Files:**
- Create: `game/inbox.js`
- Test: `tests/inbox.test.mjs`

**Interfaces:**
- Produces:
  - `INBOX_LIMIT = 200`
  - `pushMessage(state, {from, subject, body = [], importance = 'normal', date = state.season?.date ?? ''}) → msg` — `state.inbox` 맨 앞에 `{id, date, from, subject, body, importance, read:false, shown:false}`. `id`는 기존 최대 id + 1. 200개 초과분은 뒤에서 버림.
  - `pendingPopup(state) → msg[]` (importance `'high'` && `!shown`)
  - `unreadCount(state) → number`
  - `markShown(state)` (pendingPopup 전부 shown), `markRead(state, id) → msg|undefined`, `markAllRead(state)`, `removeMessage(state, id)`
  - `body` 형식: `[{p: '문단'} | {table: {head: string[], rows: (string|number)[][]}}]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/inbox.test.mjs`:

```js
// tests/inbox.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {INBOX_LIMIT,pushMessage,pendingPopup,unreadCount,markShown,markRead,markAllRead,removeMessage} from '../game/inbox.js';

const blank=()=>({season:{date:'2026-04-01'},inbox:[]});

test('pushMessage: 최신이 맨 앞, 기본값, id 증가',()=>{
  const s=blank();
  const a=pushMessage(s,{from:'스카우트 팀장',subject:'A'});
  const b=pushMessage(s,{from:'스카우트 팀장',subject:'B',importance:'high',body:[{p:'x'}]});
  assert.deepEqual(s.inbox.map(m=>m.subject),['B','A']);
  assert.equal(a.date,'2026-04-01');assert.equal(a.importance,'normal');assert.deepEqual(a.body,[]);
  assert.equal(a.read,false);assert.equal(a.shown,false);
  assert.equal(b.id,a.id+1);
});

test('inbox 가 없으면 만들고, 200개를 넘으면 오래된 것부터 버린다',()=>{
  const s={season:{date:'2026-04-01'}};
  for(let i=0;i<INBOX_LIMIT+5;i++)pushMessage(s,{from:'x',subject:String(i)});
  assert.equal(s.inbox.length,INBOX_LIMIT);
  assert.equal(s.inbox[0].subject,String(INBOX_LIMIT+4));
  assert.equal(s.inbox.at(-1).subject,'5');
});

test('팝업 대기·읽음·삭제',()=>{
  const s=blank();
  const n=pushMessage(s,{from:'x',subject:'일반'});
  const h=pushMessage(s,{from:'x',subject:'중요',importance:'high'});
  assert.deepEqual(pendingPopup(s).map(m=>m.id),[h.id]);
  markShown(s);assert.equal(pendingPopup(s).length,0);
  assert.equal(unreadCount(s),2);
  markRead(s,n.id);assert.equal(unreadCount(s),1);
  markAllRead(s);assert.equal(unreadCount(s),0);
  removeMessage(s,h.id);assert.deepEqual(s.inbox.map(m=>m.id),[n.id]);
  assert.equal(pushMessage(s,{from:'x',subject:'다음'}).id,n.id+1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/inbox.test.mjs`
Expected: FAIL — `Cannot find module '.../game/inbox.js'`

- [ ] **Step 3: 구현**

`game/inbox.js`:

```js
// game/inbox.js
/** 공용 받은편지함. 어느 시스템이든 pushMessage 로 메시지를 보낸다. 상태는 제자리 변경한다.
 *  body: [{p:'문단'} | {table:{head:[...], rows:[[...]]}}] — HTML 문자열을 저장하지 않고 화면에서 이스케이프해 그린다. */
export const INBOX_LIMIT=200;
const list=state=>state.inbox??[];

export function pushMessage(state,{from,subject,body=[],importance='normal',date=state.season?.date??''}){
  const inbox=state.inbox??=[];
  const msg={id:1+Math.max(0,...inbox.map(m=>m.id)),date,from,subject,body,importance,read:false,shown:false};
  inbox.unshift(msg);
  if(inbox.length>INBOX_LIMIT)inbox.length=INBOX_LIMIT;
  return msg;
}
export const pendingPopup=state=>list(state).filter(m=>m.importance==='high'&&!m.shown);
export const unreadCount=state=>list(state).filter(m=>!m.read).length;
export function markShown(state){for(const m of pendingPopup(state))m.shown=true;}
export function markRead(state,id){const m=list(state).find(x=>x.id===id);if(m)m.read=true;return m;}
export function markAllRead(state){for(const m of list(state))m.read=true;}
export function removeMessage(state,id){state.inbox=list(state).filter(m=>m.id!==id);}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/inbox.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add game/inbox.js tests/inbox.test.mjs
git commit -m "공용 받은편지함 추가: 성장 리포트와 이후 계약 알림이 같은 pushMessage를 쓴다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 저장 v4와 기본값

**Files:**
- Modify: `model.js` (`STATE_KEY` 선언, `loadState`)
- Modify: `game/league-season.js` (`ensureSeason`)
- Modify: `game/player-ratings.js` (`weightsFor` export)
- Create: `game/growth.js` (이 태스크에서는 `ensureDev`만)
- Test: `tests/league-season.test.mjs` (기존 v2 테스트 수정 + v3 테스트 추가)

**Interfaces:**
- Produces:
  - `model.js`: `STATE_KEY = 'dugout-prototype-v4'`, `PREV_KEYS = ['dugout-prototype-v3','dugout-prototype-v2']` (`PREV_KEY`는 없어짐)
  - `game/growth.js`: `blankDev() → {fit:{sum:0,n:0,bsum:0}, mark:{pa:0,outs:0}, pending:0, eventYear:null}`, `ensureDev(p) → p.dev`
  - `ensureSeason(state)`가 모든 선수에 `p.dev`, 상태에 `state.inbox = []`를 채운다
  - `game/player-ratings.js`: `export function weightsFor(p)`

- [ ] **Step 1: 테스트 수정·추가**

`tests/league-season.test.mjs` 맨 아래의 기존 블록

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

를 다음으로 바꾼다:

```js
import {loadState,STATE_KEY,PREV_KEYS} from '../model.js';

const memStorage=()=>{const mem=new Map();return {mem,storage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)}};};

test('v2 저장(개막 전)을 편성 그대로 시즌 상태로 옮긴다',()=>{
  const {mem,storage}=memStorage();
  const v2=initialState();v2.order=[...v2.order].reverse();
  mem.set(PREV_KEYS[1],JSON.stringify(v2));
  const {state}=loadState(storage);
  ensureSeason(state);
  assert.equal(STATE_KEY,'dugout-prototype-v4');
  assert.deepEqual(state.order,v2.order);
  assert.equal(state.season.date,'2026-03-28');
  assert.ok(state.players.every(p=>p.energy===100&&p.stats));
  assert.equal(mem.has(PREV_KEYS[1]),false);
});

test('v3 저장(시즌 진행 중)을 진행 상태 그대로 v4로 옮기고 성장 기본값을 채운다',()=>{
  const {mem,storage}=memStorage();
  const v3=fresh();v3.season.date='2026-05-02';v3.order=[...v3.order].reverse();
  for(const p of allPlayers(v3))delete p.dev;delete v3.inbox;
  mem.set(PREV_KEYS[0],JSON.stringify(v3));
  const {state}=loadState(storage);
  ensureSeason(state);
  assert.equal(state.season.date,'2026-05-02');
  assert.deepEqual(state.order,v3.order);
  assert.deepEqual(state.inbox,[]);
  assert.ok(allPlayers(state).every(p=>p.dev&&p.dev.fit.n===0&&p.dev.pending===0&&p.dev.eventYear===null));
  assert.equal(mem.has(PREV_KEYS[0]),false);
});
```

그리고 파일 위쪽 첫 테스트 `'새 시즌: 개막 전, 전원 체력 100과 빈 성적'` 안의

```js
  assert.ok(allPlayers(s).every(p=>p.energy===100&&p.stats&&p.history&&p.lastPlayed===null));
```

바로 아래에 추가:

```js
  assert.ok(allPlayers(s).every(p=>p.dev&&p.dev.mark.pa===0));
  assert.deepEqual(s.inbox,[]);
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/league-season.test.mjs`
Expected: FAIL — `PREV_KEYS` import가 undefined라 `PREV_KEYS[1]`에서 TypeError, `p.dev` 없음

- [ ] **Step 3: 구현**

`game/player-ratings.js`에서

```js
function weightsFor(p){
```

를

```js
export function weightsFor(p){
```

로 바꾼다.

`game/growth.js` 신규(이 태스크에서는 이 내용만):

```js
// game/growth.js
/** 3단계 성장·퇴화. 월간·오프시즌 틱에서 저장 능력치(20–80)를 나이 곡선대로 움직이고 OVR·POT를 다시 계산한다. 상태는 제자리 변경한다.
 *  규칙과 숫자는 docs/superpowers/specs/2026-09-29-growth-decay-design.md. */

export const blankDev=()=>({fit:{sum:0,n:0,bsum:0},mark:{pa:0,outs:0},pending:0,eventYear:null});
export const ensureDev=p=>p.dev??=blankDev();
```

`model.js`에서

```js
export const STATE_KEY='dugout-prototype-v3',PREV_KEY='dugout-prototype-v2',LEGACY_KEYS=['dugout-prototype-v1','dugout-active-game-v1'];
```

를

```js
export const STATE_KEY='dugout-prototype-v4',PREV_KEYS=['dugout-prototype-v3','dugout-prototype-v2'],LEGACY_KEYS=['dugout-prototype-v1','dugout-active-game-v1'];
```

로, `loadState` 안의

```js
try{const prev=JSON.parse(storage.getItem(PREV_KEY));storage.removeItem(PREV_KEY);if(prev?.league)return {state:prev,reset:false};}catch{}
```

를

```js
for(const key of PREV_KEYS){try{const prev=JSON.parse(storage.getItem(key));storage.removeItem(key);if(prev?.league)return {state:prev,reset:false};}catch{}}
```

로 바꾼다. (이전 버전 상태는 그대로 돌려주고, 빠진 필드는 `ensureSeason`이 채운다.)

`game/league-season.js`에서 import 줄 끝(`import {teams,teamPlayers,positions} from '../model.js';` 다음)에 추가:

```js
import {ensureDev} from './growth.js';
```

`ensureSeason`을 다음으로 바꾼다:

```js
export function ensureSeason(state){
  state.season??=createSeason(2026);
  state.inbox??=[];
  for(const p of allPlayers(state)){p.energy??=100;p.stats??=blankStats();p.history??={};p.lastPlayed??=null;p.streak??=0;ensureDev(p);}
  return state;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/league-season.test.mjs tests/league-data.test.mjs tests/model.test.mjs`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add model.js game/league-season.js game/player-ratings.js game/growth.js tests/league-season.test.mjs
git commit -m "저장 v4: 선수 dev·받은편지함 필드를 추가하고 v3·v2 저장을 이어받는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 성장 기초 — 곡선·해시 난수·특성·적정 리그·성적 상위·능력치 분배

**Files:**
- Modify: `game/growth.js`
- Test: `tests/growth.test.mjs`

**Interfaces:**
- Consumes: `weightsFor`, `ovr`, `isReliever`, `OVR_BASE`, `OVR_SPREAD` (`game/player-ratings.js`)
- Produces (모두 `game/growth.js` export):
  - 상수 `OFFSEASON_SHARE=.7`, `MONTH_SHARE=.05`, `MONTH_TICKS=6`, `NOISE_SD=2`, `FIRST_MIN_OVR=42`, `SECOND_MAX_OVR=48`, `MONTH_PLAY={pa:50,spOuts:39,rpOuts:21}`, `MULT={grow:{...},fall:{...}}`, `LABEL`(능력치 한국어 이름)
  - `curve(age) → number` 연간 평균 OVR 변화
  - `rand(key) → [0,1)`, `normal(key) → 표준정규`, `between(key, lo, hi) → lo..hi 정수(양 끝 포함)`
  - `traits(id) → {effort, bloom:'early'|'normal'|'late', adapt, aging}`, `bloomFactor(bloom, age)`
  - `judgeFit(p, {mine, played}) → {tag, grow, burst} | null` — tag: `'ai'|'firstOk'|'secondOk'|'over'|'bench'|'under'`, 부상이면 null
  - `playedEnough(p, {pa, outs}) → boolean`
  - `ops(battingLine)`, `era(pitchingLine)`, `topPerformers(players, frac, lineOf) → Set<id>`
  - `applyDelta(p, dOvr, key) → {능력치: 변화}` — 능력치 변경 + `p.ovr` 갱신
  - `grow(p, dOvr, key, capped) → {능력치: 변화}` — capped면 양수 변화가 POT를 넘지 않게

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/growth.test.mjs`:

```js
// tests/growth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {ovr,weightedRating,OVR_BASE,OVR_SPREAD} from '../game/player-ratings.js';
import {curve,rand,normal,between,traits,bloomFactor,judgeFit,playedEnough,ops,era,topPerformers,applyDelta,grow,ensureDev} from '../game/growth.js';

const hitter=(id,age,r=50,pos='2B')=>{const p={id,name:id,team:'KT 위즈',pitcher:false,pos,age,group:'first',ratings:{contact:r,eye:r,power:r,speed:r,defense:r},stats:{batting:{},pitching:{}},history:{}};p.ovr=ovr(p);p.pot=80;ensureDev(p);return p;};
const pitcher=(id,age,r=50,stamina=55)=>{const p={id,name:id,team:'KT 위즈',pitcher:true,pos:'SP',age,group:'first',ratings:{velocity:r,stuff:r,control:r,stamina},stats:{batting:{},pitching:{}},history:{}};p.ovr=ovr(p);p.pot=80;ensureDev(p);return p;};
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
// OVR의 연속값(반올림 전). 정수 OVR 차이는 시작값의 반올림 오차(최대 ±0.5)가 평균에 그대로 남아 평균 비교에 쓰지 않는다.
const score=p=>weightedRating(p)*OVR_SPREAD/OVR_BASE.sd;

test('곡선: 설계 표 값',()=>{
  const want={19:4.5,21:4.5,22:3.5,23:3.5,24:2.5,25:2.5,26:1.5,27:0,31:0,32:-1,33:-1,34:-2,35:-2,36:-3,37:-3,38:-4.5,43:-4.5};
  for(const [age,v] of Object.entries(want))assert.equal(curve(Number(age)),v,`${age}세`);
});

test('해시 난수: 재현되고, 균등·정규 분포 모양',()=>{
  assert.equal(rand('a:1'),rand('a:1'));
  const u=Array.from({length:20000},(_,i)=>rand(`u:${i}`));
  assert.ok(Math.abs(avg(u)-.5)<.01);
  assert.ok(u.every(x=>x>=0&&x<1));
  const z=Array.from({length:20000},(_,i)=>normal(`z:${i}`));
  const m=avg(z),sd=Math.sqrt(avg(z.map(x=>(x-m)**2)));
  assert.ok(Math.abs(m)<.03,`평균 ${m}`);assert.ok(Math.abs(sd-1)<.03,`표준편차 ${sd}`);
  const b=Array.from({length:5000},(_,i)=>between(`b:${i}`,8,15));
  assert.equal(Math.min(...b),8);assert.equal(Math.max(...b),15);
});

test('숨은 특성: id마다 고정, 범위와 비율',()=>{
  assert.deepEqual(traits('0-1'),traits('0-1'));
  const t=Array.from({length:4000},(_,i)=>traits(`t-${i}`));
  assert.ok(t.every(x=>x.effort>=.85&&x.effort<=1.15&&x.adapt>=0&&x.adapt<=1&&x.aging>=.6&&x.aging<=1.4));
  const share=k=>t.filter(x=>x.bloom===k).length/t.length;
  assert.ok(Math.abs(share('early')-.25)<.03&&Math.abs(share('late')-.25)<.03);
  assert.equal(bloomFactor('normal',20),1);
  assert.equal(bloomFactor('early',23),1.5);assert.equal(bloomFactor('early',24),.5);
  assert.equal(bloomFactor('late',23),.5);assert.equal(bloomFactor('late',28),1.5);
});

test('적정 리그 판정: 다섯 경우 + AI + 부상',()=>{
  const p=hitter('f1',21);
  p.ratings={contact:60,eye:60,power:60,speed:60,defense:60};p.ovr=ovr(p);
  assert.deepEqual(judgeFit(p,{mine:true,played:true}),{tag:'firstOk',grow:1.2,burst:2});
  assert.deepEqual(judgeFit(p,{mine:true,played:false}),{tag:'bench',grow:.7,burst:.5});
  p.group='second';
  assert.deepEqual(judgeFit(p,{mine:true,played:false}),{tag:'under',grow:.7,burst:.5});
  const low=hitter('f2',21,35);
  assert.ok(low.ovr<42);
  const over=judgeFit(low,{mine:true,played:true});
  assert.equal(over.tag,'over');assert.equal(over.burst,1);
  assert.ok(Math.abs(over.grow-(.8+.2*traits('f2').adapt))<1e-9);
  low.group='second';
  assert.deepEqual(judgeFit(low,{mine:true,played:false}),{tag:'secondOk',grow:1.2,burst:2});
  assert.deepEqual(judgeFit(low,{mine:false}),{tag:'ai',grow:1.2,burst:2});
  low.group='injured';
  assert.equal(judgeFit(low,{mine:true,played:true}),null);
});

test('그달 출전 충분 기준: 타자 50타석, 선발 39아웃, 불펜 21아웃',()=>{
  const h=hitter('p1',22),sp=pitcher('p2',22,50,55),rp=pitcher('p3',22,50,30);
  assert.equal(playedEnough(h,{pa:50,outs:0}),true);assert.equal(playedEnough(h,{pa:49,outs:0}),false);
  assert.equal(playedEnough(sp,{pa:0,outs:39}),true);assert.equal(playedEnough(sp,{pa:0,outs:38}),false);
  assert.equal(playedEnough(rp,{pa:0,outs:21}),true);assert.equal(playedEnough(rp,{pa:0,outs:20}),false);
});

test('성적 상위 25%: 출전 기준을 채운 선수 중 OPS·평균자책',()=>{
  const bats=Array.from({length:8},(_,i)=>({...hitter(`b${i}`,25),line:{batting:{pa:200,ab:180,h:40+i*5,bb:20}}}));
  const arms=Array.from({length:4},(_,i)=>({...pitcher(`a${i}`,25),line:{pitching:{outs:150,earnedRuns:10+i*5}}}));
  const short={...hitter('short',25),line:{batting:{pa:199,ab:100,h:90}}};
  const top=topPerformers([...bats,...arms,short],1,p=>p.line);
  assert.deepEqual([...top].sort(),['a0','b6','b7']);
  assert.ok(Math.abs(ops({ab:4,h:2,bb:1,doubles:1})-(3/5+3/4))<1e-9);
  assert.equal(era({outs:27,earnedRuns:3}),3);
  assert.ok(topPerformers([short],.5,p=>p.line).has('short'));
});

test('분배: OVR 변화량을 지키고, 베테랑은 스피드·구속이 선구안·제구보다 많이 떨어진다',()=>{
  const drops=[];
  for(let i=0;i<300;i++){
    const h=hitter(`v${i}`,38),before={...h.ratings},o=score(h);
    const c=applyDelta(h,-4.5,`k${i}`);
    drops.push(score(h)-o);
    assert.ok((c.speed??0)<(c.eye??0),`${i}: 스피드 ${c.speed} 선구안 ${c.eye}`);
    assert.ok(Object.values(h.ratings).every(v=>Number.isInteger(v)&&v>=20&&v<=80));
    assert.equal(h.ovr,ovr(h));
    for(const k of Object.keys(before))assert.equal(h.ratings[k]-before[k],c[k]??0);
  }
  assert.ok(Math.abs(avg(drops)+4.5)<.2,`평균 ${avg(drops)}`);
  for(let i=0;i<100;i++){const p=pitcher(`w${i}`,38);const c=applyDelta(p,-4.5,`k${i}`);assert.ok((c.velocity??0)<(c.control??0));}
  const young=[];
  for(let i=0;i<300;i++){const h=hitter(`y${i}`,21,40),o=score(h);applyDelta(h,3,`g${i}`);young.push(score(h)-o);}
  assert.ok(Math.abs(avg(young)-3)<.2,`평균 ${avg(young)}`);
  const edge=hitter('edge',40,79);applyDelta(edge,10,'e');assert.ok(Object.values(edge.ratings).every(v=>v<=80));
});

test('grow: 성장기(capped)는 POT를 넘지 않는다, 하락은 제한 없음',()=>{
  for(let i=0;i<200;i++){
    const h=hitter(`c${i}`,21,45);h.pot=h.ovr+1;
    grow(h,5,`c${i}`,true);
    assert.ok(h.ovr<=h.pot,`${i}: ${h.ovr} > ${h.pot}`);
  }
  const old=hitter('old',30,50);old.pot=old.ovr;
  grow(old,3,'old',false);assert.ok(old.ovr>old.pot);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/growth.test.mjs`
Expected: FAIL — `does not provide an export named 'curve'`

- [ ] **Step 3: 구현**

`game/growth.js`를 다음으로 바꾼다(Task 2의 `blankDev`·`ensureDev` 유지):

```js
// game/growth.js
/** 3단계 성장·퇴화. 월간·오프시즌 틱에서 저장 능력치(20–80)를 나이 곡선대로 움직이고 OVR·POT를 다시 계산한다. 상태는 제자리 변경한다.
 *  규칙과 숫자는 docs/superpowers/specs/2026-09-29-growth-decay-design.md. 튜닝은 scripts/growth-smoke.mjs 결과로 한다. */
import {ovr,isReliever,weightsFor,OVR_BASE,OVR_SPREAD} from './player-ratings.js';

export const OFFSEASON_SHARE=.7,MONTH_SHARE=.05,MONTH_TICKS=6,NOISE_SD=2;
export const FIRST_MIN_OVR=42,SECOND_MAX_OVR=48;
export const MONTH_PLAY={pa:50,spOuts:39,rpOuts:21};
// 성장기·하락기 능력치별 배율. OVR 가중치로 정규화하므로 OVR 변화량은 곡선 그대로다.
export const MULT={
  grow:{contact:1,eye:.8,power:1.2,speed:.8,defense:1,velocity:1.2,stuff:1,control:1,stamina:1},
  fall:{contact:1,eye:.5,power:1,speed:1.5,defense:1.2,velocity:1.5,stuff:1,control:.5,stamina:1.2},
};
export const LABEL={contact:'컨택',eye:'선구안',power:'파워',speed:'스피드',defense:'수비',velocity:'구속',stuff:'구위',control:'제구',stamina:'체력'};
const KEYS={hitter:['contact','eye','power','speed','defense'],pitcher:['velocity','stuff','control','stamina']};

export const blankDev=()=>({fit:{sum:0,n:0,bsum:0},mark:{pa:0,outs:0},pending:0,eventYear:null});
export const ensureDev=p=>p.dev??=blankDev();

/** 새 나이(오프시즌) 또는 현재 나이(월간)의 연간 평균 OVR 변화. */
export function curve(age){
  if(age<=21)return 4.5;if(age<=23)return 3.5;if(age<=25)return 2.5;if(age===26)return 1.5;
  if(age<=31)return 0;if(age<=33)return -1;if(age<=35)return -2;if(age<=37)return -3;return -4.5;
}

// 문자열 키 해시 난수. 같은 키는 언제나 같은 값이라 같은 저장에서 다시 돌리면 결과가 같다.
// game/ratings.js 의 spread 는 끝 글자만 다른 키끼리 값이 붙어 나와(최종 섞기 없음) 여기서는 FNV-1a + murmur3 finalizer 를 쓴다.
export function rand(key){
  let h=2166136261;
  for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
  return (h>>>0)/4294967296;
}
export function normal(key){const u=Math.max(1e-9,rand(key+':u')),v=rand(key+':v');return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
export const between=(key,lo,hi)=>lo+Math.floor(rand(key)*(hi-lo+1));

/** 선수마다 고정된 숨은 특성. 저장하지 않는다. */
export function traits(id){
  const r=k=>rand(`${id}:trait:${k}`),b=r('bloom');
  return {effort:.85+.3*r('effort'),bloom:b<.25?'early':b<.75?'normal':'late',adapt:r('adapt'),aging:.6+.8*r('aging')};
}
export function bloomFactor(bloom,age){if(bloom==='normal')return 1;return (bloom==='early')===(age<=23)?1.5:.5;}

/** 26세 이하 적정 리그 판정. 내 팀만 판정하고 AI 구단은 항상 적정(AI 1·2군 이동이 생길 때까지의 임시 규칙). 부상자는 null. */
export function judgeFit(p,{mine,played}){
  if(!mine)return {tag:'ai',grow:1.2,burst:2};
  if(p.group==='first'){
    if(p.ovr<FIRST_MIN_OVR)return {tag:'over',grow:.8+.2*traits(p.id).adapt,burst:1};
    if(!played)return {tag:'bench',grow:.7,burst:.5};
    return {tag:'firstOk',grow:1.2,burst:2};
  }
  if(p.group==='second')return p.ovr<SECOND_MAX_OVR?{tag:'secondOk',grow:1.2,burst:2}:{tag:'under',grow:.7,burst:.5};
  return null;
}
/** d = 그달 증가분 {pa, outs}. */
export function playedEnough(p,d){
  if(!p.pitcher)return d.pa>=MONTH_PLAY.pa;
  return d.outs>=(isReliever(p)?MONTH_PLAY.rpOuts:MONTH_PLAY.spOuts);
}

const n=(o,k)=>o?.[k]||0;
export function ops(b){
  const ab=n(b,'ab'),h=n(b,'h'),bb=n(b,'bb'),hbp=n(b,'hitByPitch'),tb=h+n(b,'doubles')+2*n(b,'triples')+3*n(b,'hr');
  return (h+bb+hbp)/Math.max(1,ab+bb+hbp+n(b,'sacFlies'))+tb/Math.max(1,ab);
}
export const era=q=>n(q,'earnedRuns')*27/Math.max(1,n(q,'outs'));
/** 출전 기준(시즌 200타석·선발 50이닝·불펜 25이닝 × frac)을 채운 선수 중 타자 OPS, 투수 평균자책 상위 25%의 id. lineOf(p) = {batting, pitching}. */
export function topPerformers(players,frac,lineOf){
  const rows=players.map(p=>({p,l:lineOf(p)||{}}));
  const top=(list,score)=>list.sort((a,b)=>score(b)-score(a)).slice(0,Math.ceil(list.length/4)).map(x=>x.p.id);
  const bat=rows.filter(({p,l})=>!p.pitcher&&n(l.batting,'pa')>=200*frac);
  const arm=rows.filter(({p,l})=>p.pitcher&&n(l.pitching,'outs')>=(isReliever(p)?75:150)*frac);
  return new Set([...top(bat,x=>ops(x.l.batting)),...top(arm,x=>-era(x.l.pitching))]);
}

/** OVR 변화량 dOvr 를 능력치에 나눈다. 소수는 key 해시로 확률 반올림하고 20–80으로 자른다. 바뀐 능력치 {키: 변화}. */
export function applyDelta(p,dOvr,key){
  const out={};
  if(!dOvr)return out;
  const m=MULT[dOvr>0?'grow':'fall'],w=weightsFor(p),d=dOvr*OVR_BASE.sd/OVR_SPREAD;
  const k=Object.entries(w).reduce((s,[x,wx])=>s+wx*m[x],0);
  for(const x of KEYS[p.pitcher?'pitcher':'hitter']){
    const c=d*m[x]/(x in w?k:1),base=Math.floor(c),step=base+(rand(`${key}:${x}`)<c-base?1:0);
    const next=Math.max(20,Math.min(80,p.ratings[x]+step));
    if(next!==p.ratings[x]){out[x]=next-p.ratings[x];p.ratings[x]=next;}
  }
  p.ovr=ovr(p);
  return out;
}
/** capped(26세 이하 성장기)면 양수 변화가 POT를 넘지 않게 줄이고, 반올림으로 넘치면 가중치 큰 능력치부터 1씩 되돌린다. */
export function grow(p,dOvr,key,capped){
  if(capped&&dOvr>0)dOvr=Math.min(dOvr,Math.max(0,p.pot-p.ovr));
  const changed=applyDelta(p,dOvr,key);
  if(capped&&p.ovr>p.pot){
    const w=weightsFor(p),order=Object.keys(w).sort((a,b)=>w[b]-w[a]);
    for(let i=0;i<20&&ovr(p)>p.pot;i++){
      const x=order.find(k=>(changed[k]||0)>0)??order.find(k=>p.ratings[k]>20);
      p.ratings[x]--;changed[x]=(changed[x]||0)-1;if(!changed[x])delete changed[x];
    }
    p.ovr=ovr(p);
  }
  return changed;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/growth.test.mjs`
Expected: PASS (8 tests). 분배 평균 테스트가 ±0.2를 벗어나면 `applyDelta`의 정규화(`k`)와 `d` 식을 설계 문서 "능력치에 나누기" 1–3과 대조한다.

- [ ] **Step 5: 커밋**

```bash
git add game/growth.js tests/growth.test.mjs
git commit -m "성장 기초: 나이 곡선·해시 난수·숨은 특성·적정 리그 판정·능력치 분배

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 선수 단위 틱 — `rollMonth`·`rollOffseason`(각성·급락·POT)

**Files:**
- Modify: `game/growth.js`
- Test: `tests/growth.test.mjs`

**Interfaces:**
- Consumes: Task 3 전부, `potCap` (`game/player-ratings.js`)
- Produces:
  - 상수 `BREAKOUT={young:.05,prime:.02,potMin:8,potMax:15,primeMin:3,primeMax:5}`, `COLLAPSE={age:34,chance:.05,ovr:-5,now:-3}`, `EVENT_OFFSEASON=.6`
  - `rollMonth(p, {year, month, mine, top, fit?}) → {changed, before:{ovr,pot}, event:null|{type:'breakout'|'collapse'}}` — `fit`을 주면 판정 대신 그 값을 쓴다(테스트용)
  - `rollOffseason(p, {year, mine, top, fit?}) → 같은 형태`. `p.age`는 이미 +1 된 새 나이.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/growth.test.mjs`의 import 줄을

```js
import {curve,rand,normal,between,traits,bloomFactor,judgeFit,playedEnough,ops,era,topPerformers,applyDelta,grow,ensureDev,rollMonth,rollOffseason} from '../game/growth.js';
```

로 바꾸고 파일 끝에 추가:

```js
const none=new Set(),flat={grow:1,burst:0};

test('오프시즌 평균 변화 = 곡선 × 70% (+ 34세 이상 급락 기대값)',()=>{
  for(const age of [21,23,25,26,30,33,35,37,39]){
    const d=[];
    for(let i=0;i<1000;i++){const h=hitter(`o${age}-${i}`,age),o=score(h);rollOffseason(h,{year:2026,mine:false,top:none,fit:flat});d.push(score(h)-o);}
    const want=curve(age)*.7+(age>=34?.05*.6*-5:0);
    assert.ok(Math.abs(avg(d)-want)<.3,`${age}세: 평균 ${avg(d).toFixed(2)} 기대 ${want}`);
  }
});

test('월간: 곡선 × 5% × 계수, 적정 리그 누적과 출전량 기준점',()=>{
  const d=[];
  for(let i=0;i<1000;i++){const h=hitter(`m${i}`,21),o=score(h);rollMonth(h,{year:2026,month:5,mine:false,top:none,fit:flat});d.push(score(h)-o);}
  assert.ok(Math.abs(avg(d)-4.5*.05)<.1,`평균 ${avg(d)}`);
  const p=hitter('acc',20,35);p.group='second';p.stats.batting.pa=12;
  rollMonth(p,{year:2026,month:5,mine:true,top:none});
  assert.deepEqual(p.dev.fit,{sum:1.2,n:1,bsum:2});
  assert.deepEqual(p.dev.mark,{pa:12,outs:0});
  const vet=hitter('vet',30);vet.stats.batting.pa=80;
  rollMonth(vet,{year:2026,month:5,mine:true,top:none});
  assert.equal(vet.dev.fit.n,0);
});

test('1군 적정 + 성적 상위면 각성 배율 3',()=>{
  const p=hitter('star',22,60);p.stats.batting.pa=60;
  rollMonth(p,{year:2026,month:5,mine:true,top:new Set(['star'])});
  assert.equal(p.dev.fit.bsum,3);
});

test('범위: 성장기 POT 상한, 능력치 정수 20–80, 27세 이상 POT = OVR, pot ≥ ovr',()=>{
  for(let i=0;i<300;i++){
    const y=hitter(`r${i}`,22,45);y.pot=y.ovr+1;const cap=y.pot;
    rollOffseason(y,{year:2026,mine:false,top:none,fit:{grow:1.2,burst:0}});
    assert.ok(y.ovr<=cap);assert.ok(y.pot>=y.ovr);
    assert.ok(Object.values(y.ratings).every(v=>Number.isInteger(v)&&v>=20&&v<=80));
    const v=hitter(`s${i}`,28+(i%12),55);v.pot=70;
    rollOffseason(v,{year:2026,mine:false,top:none});
    assert.equal(v.pot,v.ovr);
  }
});

test('POT: 23세 이하는 각성 없이 그대로, 24–26세는 예상 도달치로 25% 이동',()=>{
  const y=hitter('p22',22,45);y.pot=70;
  rollOffseason(y,{year:2026,mine:false,top:none,fit:flat});
  assert.equal(y.pot,70);
  const m=hitter('p25',25,45);m.pot=75;
  rollOffseason(m,{year:2026,mine:false,top:none,fit:flat});
  const want=Math.max(m.ovr,Math.round(75+(m.ovr+curve(26)-75)*.25));
  assert.equal(m.pot,want);
});

test('각성·급락 확률(오프시즌 60%)과 한 해 한 번',()=>{
  let b=0,c=0;
  for(let i=0;i<10000;i++){
    const y=hitter(`e${i}`,22,40);if(rollOffseason(y,{year:2026,mine:false,top:none}).event?.type==='breakout')b++;
    const o=hitter(`f${i}`,36,55);if(rollOffseason(o,{year:2026,mine:false,top:none}).event?.type==='collapse')c++;
  }
  assert.ok(Math.abs(b/10000-.05*2*.6)<.012,`각성 ${b}`);
  assert.ok(Math.abs(c/10000-.05*.6)<.008,`급락 ${c}`);
  let blocked=0;
  for(let i=0;i<2000;i++){const y=hitter(`g${i}`,22,40);y.dev.eventYear=2026;if(rollOffseason(y,{year:2026,mine:false,top:none}).event)blocked++;}
  assert.equal(blocked,0);
});

test('시즌 중 각성: POT 즉시 상승, 추가 성장 절반은 pending, 오프시즌에 정산',()=>{
  let p,r;
  for(let i=0;!r?.event;i++){p=hitter(`sb${i}`,22,40);p.pot=60;r=rollMonth(p,{year:2026,month:6,mine:false,top:none});}
  assert.equal(r.event.type,'breakout');
  assert.ok(p.pot-60>=8&&p.pot-60<=15,`POT +${p.pot-60}`);
  assert.ok(p.dev.pending>0);
  assert.equal(p.dev.eventYear,2026);
  p.age++;
  const off=rollOffseason(p,{year:2026,mine:false,top:none});
  assert.equal(off.event,null);
  assert.equal(p.dev.pending,0);
  assert.deepEqual(p.dev.fit,{sum:0,n:0,bsum:0});
});

test('시즌 중 급락: 즉시 약 −3, pending −2',()=>{
  let p,r,o;
  for(let i=0;!r?.event;i++){p=hitter(`sc${i}`,36,55);o=score(p);r=rollMonth(p,{year:2026,month:6,mine:false,top:none});}
  assert.equal(r.event.type,'collapse');
  assert.ok(o-score(p)>=2&&o-score(p)<=4.5,`즉시 ${score(p)-o}`);
  assert.equal(p.dev.pending,-2);
});

test('27–29세 각성: 오프시즌 뒤 POT가 OVR을 따라간다, 평균 +4 가산',()=>{
  const gain=[];
  for(let i=0;gain.length<40;i++){const p=hitter(`pr${i}`,28,50);p.pot=p.ovr;const o=score(p),r=rollOffseason(p,{year:2026,mine:false,top:none});if(r.event){assert.equal(r.event.type,'breakout');assert.equal(p.pot,p.ovr);gain.push(score(p)-o);}}
  assert.ok(Math.abs(avg(gain)-4)<1,`평균 ${avg(gain)}`); // +3~5 균등(평균 4) + 개인차(평균 0)
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/growth.test.mjs`
Expected: FAIL — `does not provide an export named 'rollMonth'`

- [ ] **Step 3: 구현**

`game/growth.js`의 import 줄을

```js
import {ovr,potCap,isReliever,weightsFor,OVR_BASE,OVR_SPREAD} from './player-ratings.js';
```

로 바꾸고, `MONTH_PLAY` 선언 아래에 추가:

```js
export const BREAKOUT={young:.05,prime:.02,potMin:8,potMax:15,primeMin:3,primeMax:5};
export const COLLAPSE={age:34,chance:.05,ovr:-5,now:-3};
export const EVENT_OFFSEASON=.6; // 연간 확률 중 오프시즌 몫. 나머지는 시즌 중 월간 틱마다 ÷ MONTH_TICKS
```

파일 끝에 추가:

```js
/** 각성·급락 판정. 일어나면 eventYear·POT·pending 을 고치고 {type, now}(지금 더할 OVR)를 돌려준다. */
function rollEvent(p,{year,key,share,fit,t,inSeason}){
  const dev=p.dev,age=p.age;
  if(dev.eventYear===year)return null;
  const chance=age<=26?BREAKOUT.young*(fit?.burst??1)*bloomFactor(t.bloom,age):age<=29?BREAKOUT.prime*bloomFactor(t.bloom,age):0;
  if(chance&&rand(key+':breakout')<chance*share){
    dev.eventYear=year;
    let extra;
    if(age<=26){p.pot=Math.min(80,p.pot+between(key+':potup',BREAKOUT.potMin,BREAKOUT.potMax));extra=curve(age)*(fit?.grow??1)*t.effort;}
    else extra=between(key+':primeup',BREAKOUT.primeMin,BREAKOUT.primeMax);
    const now=inSeason?extra/2:extra;
    dev.pending+=extra-now;
    return {type:'breakout',now};
  }
  if(age>=COLLAPSE.age&&rand(key+':collapse')<COLLAPSE.chance*share){
    dev.eventYear=year;
    const now=inSeason?COLLAPSE.now:COLLAPSE.ovr;
    dev.pending+=COLLAPSE.ovr-now;
    return {type:'collapse',now};
  }
  return null;
}
const merge=(a,b)=>{for(const [k,v] of Object.entries(b)){a[k]=(a[k]||0)+v;if(!a[k])delete a[k];}return a;};
const baseChange=(age,fit,t)=>{const c=curve(age);return c>0?c*(fit?.grow??1)*t.effort:c*t.aging;};

/** 월간 틱(현재 나이). 그달 출전량으로 적정 리그를 판정·누적하고, 연간 변화의 5%와 시즌 중 각성·급락을 반영한다. */
export function rollMonth(p,{year,month,mine,top,fit}){
  const dev=ensureDev(p),t=traits(p.id),key=`${p.id}:${year}:${month}`,before={ovr:p.ovr,pot:p.pot};
  const cur={pa:n(p.stats?.batting,'pa'),outs:n(p.stats?.pitching,'outs')};
  if(!fit){
    fit=judgeFit(p,{mine,played:playedEnough(p,{pa:cur.pa-dev.mark.pa,outs:cur.outs-dev.mark.outs})});
    if(fit?.tag==='firstOk'&&top.has(p.id))fit={...fit,burst:3};
    if(mine&&fit&&p.age<=26){dev.fit.sum+=fit.grow;dev.fit.n++;dev.fit.bsum+=fit.burst;}
  }
  dev.mark=cur;
  const event=rollEvent(p,{year,key,share:(1-EVENT_OFFSEASON)/MONTH_TICKS,fit,t,inSeason:true});
  const changed=grow(p,baseChange(p.age,fit,t)*MONTH_SHARE,key+':m',p.age<=26);
  if(event)merge(changed,grow(p,event.now,key+':e',p.age<=26));
  p.pot=potCap(p.pot,p.ovr);
  return {changed,before,event};
}

/** 오프시즌 틱(나이 +1 뒤 새 나이). 시즌 평균 적정 계수로 연간 변화의 70% + 개인차 + pending, 각성·급락, POT 규칙. */
export function rollOffseason(p,{year,mine,top,fit}){
  const dev=ensureDev(p),t=traits(p.id),key=`${p.id}:${year}:0`,before={ovr:p.ovr,pot:p.pot},age=p.age;
  if(!fit){
    if(mine&&dev.fit.n)fit={tag:'season',grow:dev.fit.sum/dev.fit.n,burst:dev.fit.bsum/dev.fit.n};
    else{fit=judgeFit(p,{mine,played:true});if(fit?.tag==='firstOk'&&top.has(p.id))fit={...fit,burst:3};}
  }
  const pending=dev.pending;dev.pending=0;
  const event=rollEvent(p,{year,key,share:EVENT_OFFSEASON,fit,t,inSeason:false});
  const dOvr=baseChange(age,fit,t)*OFFSEASON_SHARE+NOISE_SD*normal(key+':noise')+pending+(event?.now||0);
  const changed=grow(p,dOvr,key,age<=26);
  if(age>=27)p.pot=p.ovr;
  else if(age>=24){let rest=0;for(let a=age+1;a<=26;a++)rest+=curve(a);p.pot=Math.round(p.pot+(p.ovr+rest-p.pot)*.25);}
  p.pot=potCap(p.pot,p.ovr);
  dev.fit={sum:0,n:0,bsum:0};dev.mark={pa:0,outs:0};
  return {changed,before,event};
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/growth.test.mjs`
Expected: PASS (17 tests). 오프시즌 평균 테스트가 특정 나이에서만 벗어나면 `baseChange`의 곡선·특성 곱과 `grow`의 capped 조건(26세 이하만)을 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add game/growth.js tests/growth.test.mjs
git commit -m "선수 단위 월간·오프시즌 틱: 적정 리그 누적, 각성·급락, POT 재평가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 리그 단위 틱과 스카우트 리포트 — `monthlyGrowth`·`offseasonGrowth`

**Files:**
- Modify: `game/growth.js`
- Test: `tests/growth.test.mjs`

**Interfaces:**
- Consumes: `pushMessage` (`game/inbox.js`), `teams`·`teamPlayers` (`model.js`), Task 4
- Produces:
  - `SCOUT = '스카우트 팀장'`
  - `monthlyGrowth(state) → {events: [{p, mine, type, before}]}` — `state.season.date`가 새 달 1일인 시점에 호출(2단계 `finishDay`). 내 팀 변화가 있으면 일반 메시지 `${월-1}월 스카우트 리포트`, 내 팀 이벤트는 중요 메시지, 다른 팀 이벤트는 `season.news` 한 줄.
  - `offseasonGrowth(state) → {events}` — `startNextSeason` 안에서 나이 +1 뒤, `state.season.year`는 아직 끝난 시즌. 전원 `history[year].ovr/pot` 기록(변화 전), 내 팀 이벤트 중요 메시지, 중요 메시지 `${year} 오프시즌 스카우트 리포트`. 오프시즌 이벤트는 소식에 넣지 않는다(새 시즌 생성 때 지워지므로).

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/growth.test.mjs` import 영역에 추가:

```js
import {monthlyGrowth,offseasonGrowth,SCOUT} from '../game/growth.js';
import {initialState} from '../model.js';
import {ensureSeason,allPlayers} from '../game/league-season.js';
```

파일 끝에 추가:

```js
const league=()=>{const s=ensureSeason(initialState());s.season.date='2026-04-01';return s;};

test('월간 리포트: 내 팀 변화가 없으면 보내지 않는다',()=>{
  const s=league();
  for(const p of s.players)p.age=30; // 곡선 0, 각성(≤29)·급락(≥34) 대상 아님
  monthlyGrowth(s);
  assert.equal(s.inbox.filter(m=>m.from===SCOUT).length,0);
});

test('월간 리포트: 변화가 있으면 일반 메시지 한 통, 표에 바뀐 선수',()=>{
  const s=league();
  for(const p of s.players)p.age=20;
  const {events}=monthlyGrowth(s);
  const report=s.inbox.find(m=>m.subject==='3월 스카우트 리포트');
  assert.ok(report);assert.equal(report.importance,'normal');
  const rows=report.body.find(b=>b.table).table.rows;
  assert.ok(rows.length>0);
  assert.ok(rows.every(r=>s.players.some(p=>p.name===r[0])));
  const mineEvents=events.filter(e=>e.mine).length;
  assert.equal(s.inbox.filter(m=>m.importance==='high').length,mineEvents);
  const others=events.filter(e=>!e.mine).length;
  assert.equal(s.season.news.filter(l=>l.includes('기량 급')).length,Math.min(others,20));
});

test('오프시즌: history 에 변화 전 OVR·POT, 리포트는 중요 메시지, 재현성',()=>{
  const a=league(),b=league();
  const before=new Map(allPlayers(a).map(p=>[p.id,{ovr:p.ovr,pot:p.pot}]));
  for(const s of [a,b])for(const p of allPlayers(s))p.age++;
  const {events}=offseasonGrowth(a);offseasonGrowth(b);
  assert.deepEqual(a.players,b.players);assert.deepEqual(a.league,b.league);
  for(const p of allPlayers(a))assert.deepEqual({ovr:p.history[2026].ovr,pot:p.history[2026].pot},before.get(p.id));
  const report=a.inbox.find(m=>m.subject==='2026 오프시즌 스카우트 리포트');
  assert.ok(report);assert.equal(report.importance,'high');
  assert.equal(report.body.find(b=>b.table).table.rows.length,a.players.length);
  assert.equal(a.inbox.filter(m=>m.importance==='high').length,1+events.filter(e=>e.mine).length);
  assert.ok(allPlayers(a).every(p=>p.pot>=p.ovr&&(p.age<27||p.pot===p.ovr)));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/growth.test.mjs`
Expected: FAIL — `does not provide an export named 'monthlyGrowth'`

- [ ] **Step 3: 구현**

`game/growth.js` import 영역에 추가:

```js
import {teams,teamPlayers} from '../model.js';
import {pushMessage} from './inbox.js';
```

파일 끝에 추가:

```js
export const SCOUT='스카우트 팀장';
const everyone=state=>teams.flatMap((_,i)=>teamPlayers(state,i).map(p=>({p,mine:i===0})));
const sign=v=>v>0?`+${v}`:v<0?`−${-v}`:'0';
const fmtChanges=c=>Object.entries(c).map(([k,v])=>`${LABEL[k]} ${sign(v)}`).join(' · ');

function eventMessage({p,type,before}){
  if(type==='breakout')return {subject:`긴급 스카우트 리포트: ${p.name}, ${p.pitcher?'투구':'타격'}에 눈을 떴습니다`,
    body:[{p:`${p.name}(${p.age}세)의 기량이 한 단계 올라섰습니다. 평가를 올립니다.`},{table:{head:['','이전','이후'],rows:[['OVR',before.ovr,p.ovr],['POT',before.pot,p.pot]]}}]};
  return {subject:`긴급 스카우트 리포트: ${p.name}의 기량이 눈에 띄게 떨어졌습니다`,
    body:[{p:`${p.name}(${p.age}세)에게서 하락 조짐이 뚜렷합니다.`},{table:{head:['','이전','이후'],rows:[['OVR',before.ovr,p.ovr]]}}]};
}
/** 내 팀 이벤트는 중요 메시지, 다른 팀 이벤트는 시즌 중에만 리그 소식 한 줄. */
function announce(state,events,inSeason){
  for(const e of events){
    if(e.mine)pushMessage(state,{from:SCOUT,importance:'high',...eventMessage(e)});
    else if(inSeason)state.season.news=[...state.season.news,`${e.p.team} ${e.p.name}, ${e.type==='breakout'?'기량 급성장':'기량 급락'}`].slice(-20);
  }
}

/** hooks.monthlyTick. 새 달 1일에 호출된다. */
export function monthlyGrowth(state){
  const s=state.season,year=s.year,month=Number(s.date.slice(5,7));
  const frac=s.schedule.filter(g=>g.status==='final').length/Math.max(1,s.schedule.length);
  const list=everyone(state),top=topPerformers(list.map(x=>x.p),frac,p=>p.stats);
  const rows=[],events=[];
  for(const {p,mine} of list){
    const r=rollMonth(p,{year,month,mine,top});
    if(r.event)events.push({p,mine,type:r.event.type,before:r.before});
    if(mine&&Object.keys(r.changed).length)rows.push([p.name,fmtChanges(r.changed),`${r.before.ovr} → ${p.ovr}`]);
  }
  if(rows.length)pushMessage(state,{from:SCOUT,subject:`${month-1}월 스카우트 리포트`,
    body:[{p:`지난달 능력치가 바뀐 선수 ${rows.length}명입니다.`},{table:{head:['선수','변화','OVR'],rows}}]});
  announce(state,events,true);
  return {events};
}

/** hooks.offseasonTick. 나이 +1 뒤, 새 시즌 생성 전에 호출된다. state.season.year 는 끝난 시즌. */
export function offseasonGrowth(state){
  const year=state.season.year,list=everyone(state);
  const top=topPerformers(list.map(x=>x.p),1,p=>p.history?.[year]);
  const mineRows=[],events=[];
  for(const {p,mine} of list){
    const h=(p.history??={})[year]??={};h.ovr=p.ovr;h.pot=p.pot;
    const r=rollOffseason(p,{year,mine,top});
    if(r.event)events.push({p,mine,type:r.event.type,before:r.before});
    if(mine)mineRows.push({p,before:r.before});
  }
  mineRows.sort((a,b)=>Math.abs(b.p.ovr-b.before.ovr)-Math.abs(a.p.ovr-a.before.ovr));
  const body=[{p:`${year} 시즌을 마친 뒤의 평가입니다. 나이는 새 시즌 기준입니다.`},
    {table:{head:['선수','나이','OVR','POT'],rows:mineRows.map(({p,before})=>[p.name,p.age,`${before.ovr} → ${p.ovr} (${sign(p.ovr-before.ovr)})`,`${before.pot} → ${p.pot}`])}}];
  if(events.length)body.push({p:'리그 전체 각성·급락'},{table:{head:['구단','선수','나이','구분','OVR'],
    rows:events.map(e=>[e.p.team,e.p.name,e.p.age,e.type==='breakout'?'각성':'급락',`${e.before.ovr} → ${e.p.ovr}`])}});
  announce(state,events,false);
  pushMessage(state,{from:SCOUT,importance:'high',subject:`${year} 오프시즌 스카우트 리포트`,body});
  return {events};
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/growth.test.mjs`
Expected: PASS (20 tests)

- [ ] **Step 5: 커밋**

```bash
git add game/growth.js tests/growth.test.mjs
git commit -m "리그 단위 성장 틱과 스카우트 리포트 메시지

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 시즌 진행에 연결 — 훅, 중요 메시지에서 진행 멈춤

**Files:**
- Modify: `game/league-season.js:9-10` (훅)
- Modify: `game/season-runner.js` (`advance`)
- Test: `tests/league-season.test.mjs`, `tests/season-runner.test.mjs`

**Interfaces:**
- Consumes: `monthlyGrowth`, `offseasonGrowth` (Task 5), `pendingPopup` (Task 1)
- Produces: `advance(...)`가 하루를 마치고 저장한 뒤 `pendingPopup(state).length > 0`이면 `{done, total, stopped:'message'}` 반환. 기존 `shouldStop` 멈춤은 `{stopped:true}` 그대로.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/league-season.test.mjs`의 `'시즌 종료 → 다음 시즌: ...'` 테스트 바로 아래에 추가:

```js
test('다음 시즌으로: 실제 성장 훅이 돌아 history 에 OVR·POT, 오프시즌 리포트',()=>{
  const s=fresh();
  const before=new Map(allPlayers(s).map(p=>[p.id,{ovr:p.ovr,pot:p.pot}]));
  startNextSeason(s);
  for(const p of allPlayers(s))assert.deepEqual({ovr:p.history[2026].ovr,pot:p.history[2026].pot},before.get(p.id));
  assert.ok(s.inbox.some(m=>m.subject==='2026 오프시즌 스카우트 리포트'));
});
```

`tests/season-runner.test.mjs` import에 추가:

```js
import {hooks} from '../game/league-season.js';
import {pushMessage,pendingPopup} from '../game/inbox.js';
```

기존 `'1주 진행: ...'` 테스트의

```js
  const r=await advance(s,targetDate(s,'week'),{...fast,save:()=>saves++,onProgress:p=>last=p});
```

를 (4/1 월간 틱에서 내 팀 각성이 나면 멈추므로, 이 테스트는 팝업을 본 것으로 처리)

```js
  const r=await advance(s,targetDate(s,'week'),{...fast,save:st=>{saves++;for(const m of pendingPopup(st))m.shown=true;},onProgress:p=>last=p});
```

로 바꾸고, 파일 끝에 추가:

```js
test('중요 메시지가 오면 그날을 마치고 멈춘다',async()=>{
  const s=ensureSeason(initialState());s.season.date='2026-03-31';
  const orig=hooks.monthlyTick;hooks.monthlyTick=st=>pushMessage(st,{from:'테스트',subject:'중요',importance:'high'});
  try{
    const r=await advance(s,targetDate(s,'week'),fast);
    assert.equal(r.stopped,'message');
    assert.equal(s.season.date,'2026-04-01');
    assert.ok(s.season.schedule.filter(g=>g.date==='2026-03-31').every(g=>g.status==='final'));
  }finally{hooks.monthlyTick=orig;}
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/league-season.test.mjs tests/season-runner.test.mjs`
Expected: FAIL — history 에 `ovr` 없음(훅이 빈 함수), `r.stopped`가 undefined

- [ ] **Step 3: 구현**

`game/league-season.js`에서

```js
/** 3단계 연결점. 2단계에서는 비어 있다. */
export const hooks={monthlyTick(state){},offseasonTick(state){}};
```

를

```js
/** 3단계 성장·퇴화 연결점. 테스트는 이 객체의 함수를 바꿔 끼운다. */
export const hooks={monthlyTick:monthlyGrowth,offseasonTick:offseasonGrowth};
```

로 바꾸고, Task 2에서 넣은 import 줄을

```js
import {ensureDev,monthlyGrowth,offseasonGrowth} from './growth.js';
```

로 바꾼다.

`game/season-runner.js` import 줄들 아래에 추가:

```js
import {pendingPopup} from './inbox.js';
```

`advance` 안의

```js
    save(state);
    if(shouldStop())return {done,total,stopped:true};
```

를

```js
    save(state);
    if(pendingPopup(state).length)return {done,total,stopped:'message'};
    if(shouldStop())return {done,total,stopped:true};
```

로 바꾼다. 파일 머리 주석 `/** 여러 날 진행. ... */` 끝에 ` 중요 메시지가 오면 그날 뒤 멈춘다.`를 덧붙인다.

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/league-season.test.mjs tests/season-runner.test.mjs tests/growth.test.mjs tests/inbox.test.mjs`
Expected: PASS 전부

- [ ] **Step 5: 전체 테스트**

Run: `npm test`
Expected: 모든 `tests/*.test.mjs` 통과 + upstream 테스트 통과

- [ ] **Step 6: 커밋**

```bash
git add game/league-season.js game/season-runner.js tests/league-season.test.mjs tests/season-runner.test.mjs
git commit -m "성장 훅을 시즌 진행에 연결하고 중요 메시지가 오면 여러 날 진행을 멈춘다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 화면 — 메시지 탭·팝업·홈 메시지 상자·▲▼

**Files:**
- Modify: `app.js` (아래 치환 10곳, 전부 정확한 문자열 치환. 각 old 문자열은 파일에 한 번만 나온다)
- Modify: `styles.css` (끝에 추가)

**Interfaces:**
- Consumes: `pendingPopup`, `markShown`, `markRead`, `markAllRead`, `removeMessage`, `unreadCount` (`game/inbox.js`)
- Produces: 화면 `view==='inbox'`, 버튼 데이터 속성 `data-msg`, `data-inbox="readall|delete"`, `data-open="<id>"`, 선택 `data-inbox-from`

`app.js`는 한 줄이 길어서 Edit 도구의 old_string을 아래 그대로 복사해 쓴다. 치환 뒤 `node --check app.js`로 문법을 확인한다.

- [ ] **Step 1: import·상태 변수**

치환 A — old:

```js
import {advance,targetDate} from './game/season-runner.js';
```

new:

```js
import {advance,targetDate} from './game/season-runner.js';import {pendingPopup,markShown,markRead,markAllRead,removeMessage,unreadCount} from './game/inbox.js';
```

치환 B — old:

```js
const KEY=STATE_KEY;
```

new:

```js
const KEY=STATE_KEY;let inboxSel=null,inboxFrom='all';
```

- [ ] **Step 2: 제목·메뉴·렌더 연결**

치환 C — old:

```js
schedule:'스케줄',team:'상대팀 1군 로스터'};
```

new:

```js
schedule:'스케줄',team:'상대팀 1군 로스터',inbox:'메시지'};
```

치환 D — old:

```js
team:'OPPOSITION REPORT'};
```

new:

```js
team:'OPPOSITION REPORT',inbox:'NEWS & MAIL'};
```

치환 E — old:

```js
${['home','lineup','roster','records','schedule'].map(v=>`<button class="${view===v?'active':''}" data-nav="${v}" ${view===v?'aria-current="page"':''}>${titles[v]}</button>`).join('')}
```

new:

```js
${['home','lineup','roster','records','schedule','inbox'].map(v=>`<button class="${view===v?'active':''}" data-nav="${v}" ${view===v?'aria-current="page"':''}>${titles[v]}${v==='inbox'&&unreadCount(state)?` <span class="badge" aria-label="안 읽은 메시지 ${unreadCount(state)}개">${unreadCount(state)}</span>`:''}</button>`).join('')}
```

치환 F — old:

```js
({home,lineup,roster,records,schedule:calendar,team:teamView})[view]()
```

new:

```js
({home,lineup,roster,records,schedule:calendar,team:teamView,inbox})[view]()
```

- [ ] **Step 3: 메시지 화면·팝업 함수 추가**

치환 G — old:

```js
function showModal(title,html){
```

new (`showModal` 앞에 새 함수 셋을 끼운다):

```js
function msgBody(m){return (m.body||[]).map(b=>b.table?`<div class="tablewrap mailtable"><table><thead><tr>${b.table.head.map(h=>`<th class="name">${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map(r=>`<tr>${r.map(c=>`<td class="name">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<p>${esc(b.p)}</p>`).join('');}
function inbox(){const all=state.inbox||[],senders=[...new Set(all.map(m=>m.from))],list=all.filter(m=>(inboxFrom==='all'||m.from===inboxFrom)&&m.subject.includes(query)),sel=all.find(m=>m.id===inboxSel);const rows=list.map(m=>`<button class="mailrow ${m.read?'':'unread'} ${m.id===inboxSel?'active':''}" data-msg="${m.id}"><span class="mailflag" aria-label="${m.importance==='high'?'중요':''}">${m.importance==='high'?'!':''}</span><span class="mailsubject">${esc(m.subject)}<small>${esc(m.from)}</small></span><span class="maildate">${esc(m.date)}</span></button>`).join('')||'<div class="empty">메시지가 없습니다.</div>';const detail=sel?`<article class="maildetail"><button class="back mailback" data-msg="">← 목록</button><div class="mailhead"><h2>${esc(sel.subject)}</h2><small>${esc(sel.from)} · ${esc(sel.date)}</small></div>${msgBody(sel)}</article>`:'<div class="empty">메시지를 선택하세요.</div>';return `<div class="toolbar"><select aria-label="보낸 사람" data-inbox-from>${['all',...senders].map(v=>`<option value="${esc(v)}" ${v===inboxFrom?'selected':''}>${v==='all'?'보낸 사람: 전체':esc(v)}</option>`).join('')}</select><input aria-label="메시지 검색" placeholder="제목 검색" value="${esc(query)}" data-search="inbox"><span class="right"></span><button class="secondary" data-inbox="readall">모두 읽음</button><button class="secondary" data-inbox="delete" ${sel?'':'disabled'}>메시지 삭제</button></div><div class="mailgrid ${sel?'reading':''}">${panel('받은 메시지',`<div class="maillist">${rows}</div>`,`<span class="tag">${unreadCount(state)}개 안 읽음</span>`)}${panel('내용',detail)}</div>`;}
function showPopup(){const list=pendingPopup(state);if(!list.length)return false;markShown(state);const one=list.length===1?list[0]:null;if(one)markRead(state,one.id);save();showModal(one?esc(one.subject):`중요 메시지 ${list.length}건`,`${one?`<p class="muted">${esc(one.from)} · ${esc(one.date)}</p>${msgBody(one)}`:`<div class="messages">${list.map(m=>`<button class="message" style="width:100%;text-align:left" data-nav="inbox" data-open="${m.id}"><span class="icon">!</span><span><strong>${esc(m.subject)}</strong><small>${esc(m.from)} · ${esc(m.date)}</small></span></button>`).join('')}</div>`}<div class="modalactions"><button class="secondary" data-close>확인</button><button class="primary" data-nav="inbox" ${one?`data-open="${one.id}"`:''}>메시지함으로 →</button></div>`);return true;}
function showModal(title,html){
```

- [ ] **Step 4: 이벤트 처리**

치환 H — old:

```js
if(d.nav){if(modal.open)modal.close();go(d.nav);return;}
```

new:

```js
if('msg'in d){inboxSel=d.msg?Number(d.msg):null;if(inboxSel){markRead(state,inboxSel);save();}render();return;}if(d.inbox){if(d.inbox==='readall')markAllRead(state);if(d.inbox==='delete'&&inboxSel!=null){removeMessage(state,inboxSel);inboxSel=null;}save();render();return;}if(d.open){inboxSel=Number(d.open);markRead(state,inboxSel);save();}if(d.nav){if(modal.open)modal.close();go(d.nav);return;}
```

`go(next)`는 `query=''`로 초기화하지만 `inboxSel`은 건드리지 않으므로 `data-open`으로 고른 메시지가 유지된다.

치환 I — old:

```js
document.addEventListener('change',e=>{const d=e.target.dataset,value=e.target.value;
```

new:

```js
document.addEventListener('change',e=>{const d=e.target.dataset,value=e.target.value;if('inboxFrom'in d){inboxFrom=value;inboxSel=null;render();return;}
```

- [ ] **Step 5: 팝업 호출 지점**

치환 J — old:

```js
else{if(modal.open)modal.close();toast(`${fmtDate(state.season.date)}까지 진행 · ${teams[0]} ${myRecord()}`);}
```

new:

```js
else{if(modal.open)modal.close();toast(`${fmtDate(state.season.date)}까지 진행 · ${teams[0]} ${myRecord()}`);showPopup();}
```

치환 K — old:

```js
nextseason'){startNextSeason(state);save();modal.close();render();toast(`${state.season.year} 시즌 개막 전으로 넘어왔습니다.`);}
```

new:

```js
nextseason'){startNextSeason(state);save();modal.close();render();toast(`${state.season.year} 시즌 개막 전으로 넘어왔습니다.`);showPopup();}
```

(`runAdvance`의 `finally{...render();}`는 모달을 닫지 않으므로 팝업이 유지된다. [다음 날]의 내 경기 뒤에도 `finishMyGame` → `runAdvance('day')`를 거치므로 같은 경로로 팝업이 뜬다.)

- [ ] **Step 6: 홈 메시지 상자와 ▲▼**

치환 L — old:

```js
${state.players.filter(p=>p.group==='injured').slice(0,2).map(p=>`<button class="message" style="width:100%;text-align:left" data-nav="roster"><span class="icon">＋</span><span><strong>${p.name} · ${p.injury}</strong><small>재활 진행 중 · 복귀 후 기용 계획을 확인하세요</small></span><span>D−${p.days}</span></button>`).join('')}
```

new:

```js
${(state.inbox||[]).slice(0,3).map(m=>`<button class="message" style="width:100%;text-align:left" data-nav="inbox" data-open="${m.id}"><span class="icon">${m.importance==='high'?'!':'✉'}</span><span><strong>${esc(m.subject)}</strong><small>${esc(m.from)} · ${m.read?'읽음':'새 메시지'}</small></span><span>${esc(m.date.slice(5))}</span></button>`).join('')}
```

(old 문자열의 `＋`는 전각 더하기, `D−`의 `−`는 유니코드 마이너스다. Edit이 못 찾으면 `node -e "const s=require('fs').readFileSync('app.js','utf8');const i=s.indexOf(\"state.players.filter(p=>p.group==='injured').slice(0,2)\");console.log(JSON.stringify(s.slice(i-2,i+330)))"`로 정확한 원문을 확인한다.)

치환 M — old:

```js
const rating=value=>`<span class="ratingvalue ${ratingClass(value)}">${value}</span>`;
```

new:

```js
const rating=value=>`<span class="ratingvalue ${ratingClass(value)}">${value}</span>`;const delta=(p,k)=>{const b=p.history?.[state.season.year-1]?.[k];if(b==null||b===p[k])return '';const d=p[k]-b;return ` <span class="delta ${d>0?'up':'down'}" aria-label="지난 시즌 대비 ${d>0?'+':''}${d}">${d>0?'▲':'▼'}${Math.abs(d)}</span>`;};
```

치환 N — old:

```js
if(k==='ovr'||k==='pot')return rating(p[k]);
```

new:

```js
if(k==='ovr'||k==='pot')return rating(p[k])+delta(p,k);
```

치환 O — old:

```js
<td>${p.ovr}</td><td>${p.pot}</td><td><button class="secondary" data-assign
```

new:

```js
<td>${p.ovr}${delta(p,'ovr')}</td><td>${p.pot}${delta(p,'pot')}</td><td><button class="secondary" data-assign
```

- [ ] **Step 7: 스타일**

`styles.css` 끝에 추가:

```css
nav .badge{display:inline-block;min-width:18px;padding:1px 5px;margin-left:4px;border-radius:9px;background:var(--red);color:#1a0f10;font-size:11px;font-weight:800;text-align:center}
.delta{font-size:10px;margin-left:3px;font-weight:700}.delta.up{color:var(--mint)}.delta.down{color:var(--red)}
.mailgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:20px}.maillist{max-height:620px;overflow:auto}
.mailrow{display:grid;grid-template-columns:18px 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;padding:12px 18px;border-bottom:1px solid var(--line);color:#b8c7d2}
.mailrow.unread{color:#e7edf2;font-weight:700}.mailrow.active{background:#1c3040}.mailflag{color:var(--red);font-weight:800}
.mailsubject small{display:block;color:var(--muted);font-weight:400;margin-top:3px;font-size:11px}.maildate{color:var(--muted);font-size:11px}
.maildetail{padding:20px 22px;display:grid;gap:14px}.maildetail p{color:#c3d1dc;line-height:1.8}.mailhead h2{font-size:17px}.mailhead small{color:var(--muted)}
.mailtable{max-height:420px}.mailtable td,.mailtable th{text-align:left}.mailback{display:none;justify-self:start}
@media(max-width:760px){.mailgrid{grid-template-columns:1fr}.mailgrid.reading>.panel:first-child,.mailgrid:not(.reading)>.panel:last-child{display:none}.mailback{display:inline-block}}
```

- [ ] **Step 8: 문법 확인과 기존 테스트**

Run: `node --check app.js && npm test`
Expected: 문법 오류 없음, 테스트 전부 통과

- [ ] **Step 9: 브라우저 확인**

`.claude/launch.json`이 없으면 만든다:

```json
{"version":"0.0.1","configurations":[{"name":"dugout","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":4173}]}
```

`preview_start`(name `dugout`)로 열고 확인한다:
1. 주 메뉴에 "메시지" 탭이 있고, 누르면 "받은 메시지가 없습니다" 빈 화면.
2. 홈에서 [월말]을 두 번 눌러 4/1을 넘긴다 → "3월 스카우트 리포트"가 오고 메뉴에 배지. 내 팀 각성이 났으면 진행이 멈추고 팝업.
3. 메시지 화면에서 목록 클릭 → 본문 표가 보이고 굵은 글씨가 풀림, 배지 숫자 감소. [모두 읽음], [메시지 삭제] 동작.
4. `resize_window` mobile(375×812)에서 목록 → 본문 한 칸 전환, [← 목록] 동작. 확인 뒤 preset desktop으로 되돌린다.
5. 홈의 [시즌 끝](90초 안팎) → 종료 모달 [다음 시즌으로] → "2026 오프시즌 스카우트 리포트" 팝업, 로스터 표 OVR·POT 옆 ▲▼ 확인.
6. `read_console_messages`에 오류가 없다.

- [ ] **Step 10: 커밋**

```bash
git add app.js styles.css
git commit -m "메시지 탭·중요 메시지 팝업·홈 메시지 상자·OVR/POT 변화 표시 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`.claude/launch.json`은 커밋하지 않는다.)

---

### Task 8: 10시즌 튜닝 스모크, 설계 보정 기록, 빌드

**Files:**
- Create: `scripts/growth-smoke.mjs`
- Modify: `package.json` (`scripts`에 `test:growth`)
- Modify: `docs/superpowers/specs/2026-09-29-growth-decay-design.md` (끝에 "구현 시 보정")
- Modify: `dist/` (`npm run build` 결과)

**Interfaces:**
- Consumes: `monthlyGrowth`, `offseasonGrowth`(Task 5), `ensureSeason`, `startNextSeason`, `allPlayers`(`game/league-season.js`)

- [ ] **Step 1: 스모크 스크립트 작성**

`scripts/growth-smoke.mjs`:

```js
// scripts/growth-smoke.mjs — 경기 없이 월간 6회 + 오프시즌을 10시즌 돌려 성장 곡선 튜닝 근거를 출력한다.
// 경기를 돌리지 않으므로 내 팀(KT) 1군은 매달 "출전 부족"으로 판정된다. 리그 전체 지표는 AI 369명이 좌우한다.
import {initialState} from '../model.js';
import {ensureSeason,startNextSeason,allPlayers,hooks} from '../game/league-season.js';
import {monthlyGrowth,offseasonGrowth} from '../game/growth.js';

const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const s=ensureSeason(initialState());
let off;hooks.offseasonTick=st=>{off=offseasonGrowth(st);};
const watch=['김도영','최민석','신재인','양의지','최형우'],paths=Object.fromEntries(watch.map(n=>[n,[]]));
const mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
function report(label,events){
  const ps=allPlayers(s),top=[...ps].sort((a,b)=>b.ovr-a.ovr).slice(0,276);
  const band=(lo,hi)=>mean(ps.filter(p=>p.age>=lo&&p.age<=hi).map(p=>p.ovr)).toFixed(1);
  const b=events.filter(e=>e.type==='breakout').length,c=events.length-b;
  console.log(`${label} | 상위276 ${mean(top.map(p=>p.ovr)).toFixed(1)} 하위10% ${top[248].ovr} | ≤22 ${band(0,22)} 23–26 ${band(23,26)} 27–31 ${band(27,31)} 32–35 ${band(32,35)} 36+ ${band(36,99)} | 각성 ${b} 급락 ${c} | POT80 ${ps.filter(p=>p.pot>=80).length} | 평균나이 ${mean(ps.map(p=>p.age)).toFixed(1)}`);
  for(const n of watch){const p=ps.find(x=>x.name===n);if(p)paths[n].push(`${p.age}세 ${p.ovr}/${p.pot}`);}
}
report(`${s.season.year} 개막`,[]);
for(let season=0;season<10;season++){
  const year=s.season.year,events=[];
  for(let m=4;m<=9;m++){s.season.date=`${year}-0${m}-01`;events.push(...monthlyGrowth(s).events);}
  startNextSeason(s);
  events.push(...off.events);
  report(`${year} 종료 후`,events);
}
for(const n of watch)console.log(`${n}: ${paths[n].join(' → ')}`);
```

`package.json`의 `"scripts"`에 `"test:season":"node scripts/season-smoke.mjs"` 뒤로 추가:

```json
"test:growth":"node scripts/growth-smoke.mjs"
```

(결과: `..."test:season":"node scripts/season-smoke.mjs","test:growth":"node scripts/growth-smoke.mjs"}`)

- [ ] **Step 2: 실행하고 기준과 비교**

Run: `npm run test:growth`
Expected: 11줄의 연도별 요약과 5명 궤적(1초 이내). 기준(설계 문서 "인터뷰 때 참고한 추정"):
- 상위 276명 평균 OVR이 2030년 무렵까지 49–52 사이
- 각성은 첫 몇 해 연 10–15건, 급락은 연 2–10건(은퇴가 없어 고령화로 해마다 늘어남)
- 김도영은 25세 무렵까지 80, 양의지는 3년 뒤 50–58

계획 작성 때 이 계획의 코드로 돌린 기준 출력(비교용):

```text
2026 개막 | 상위276 50.4 하위10% 42 | ≤22 39.9 23–26 44.5 27–31 46.4 32–35 46.2 36+ 49.1 | 각성 0 급락 0 | POT80 3 | 평균나이 28.0
2026 종료 후 | 상위276 50.8 하위10% 43 | ≤22 44.0 23–26 47.3 27–31 46.2 32–35 45.5 36+ 44.0 | 각성 10 급락 7 | POT80 4 | 평균나이 29.0
2028 종료 후 | 상위276 51.6 하위10% 42 | ≤22 54.8 23–26 53.9 27–31 46.9 32–35 43.5 36+ 37.1 | 각성 12 급락 2 | POT80 5 | 평균나이 31.0
2031 종료 후 | 상위276 50.7 하위10% 38 | ≤22 0.0 23–26 63.0 27–31 51.8 32–35 43.8 36+ 29.8 | 각성 1 급락 11 | POT80 3 | 평균나이 34.0
2035 종료 후 | 상위276 44.3 하위10% 26 | ≤22 0.0 23–26 0.0 27–31 60.3 32–35 47.4 36+ 27.3 | 각성 0 급락 14 | POT80 2 | 평균나이 38.0
김도영: 23세 77/80 → 24세 78/80 → 25세 80/80 → … → 29세 78/78 → 33세 75/75
최민석: 20세 52/80 → 21세 60/80 → 22세 66/80 → 23세 68/80 → 24세 76/80 → 26세 80/80
신재인: 19세 31/62 → 21세 45/62 → 23세 53/62 → 24세 57/68 → 27세 64/64
양의지: 39세 66/66 → 40세 62/62 → 41세 62/62 → 42세 55/55
```

2031년 이후 하락과 "≤22 0.0"(해당 나이 선수 없음)은 은퇴·신인이 없어서 생기는 알려진 한계다. 조정 대상이 아니다.

벗어나면 `game/growth.js` 상단 상수(`curve`, `NOISE_SD`, `BREAKOUT`, `COLLAPSE`)만 조정하고 Step 2를 다시 돌린다. 조정했으면 `node --test tests/growth.test.mjs`도 다시 돌려 곡선 테스트 기대값을 새 숫자와 맞춘다.

- [ ] **Step 3: 설계 문서에 구현 시 보정 기록**

`docs/superpowers/specs/2026-09-29-growth-decay-design.md` 끝에 추가(Step 2 결과 숫자와 조정 내용을 채워 넣는다):

```markdown
## 구현 시 보정 (2026-09-29)

- 난수: `game/ratings.js`의 `spread`는 끝 글자만 다른 키끼리 값이 붙어 나와(최종 섞기 없음) Box–Muller 두 값이 상관된다. `growth.js`에 FNV-1a + murmur3 finalizer 해시 `rand(key)`를 따로 두었다.
- POT 상한은 26세 이하 성장기에만 적용한다. 27세 이상은 개인차(±)가 그대로 들어가고 오프시즌 끝에 POT = OVR로 맞춘다(상한을 두면 개인차가 음수로만 작동해 하락이 생긴다).
- POT 재평가의 "27세까지 남은 평균 성장"은 새 나이 다음 해부터 26세까지의 곡선 합(`curve(age+1)…curve(26)`)이다.
- 기본값 채우기는 `ensureSeason`이 한다(`dev`, `inbox`). 이전 저장 키는 `PREV_KEYS = [v3, v2]`.
- 메시지 id는 받은편지함의 최대 id + 1(별도 카운터 필드 없음).
- 오프시즌 각성·급락은 리그 소식에 넣지 않는다(새 시즌 생성 때 소식이 비워지므로 오프시즌 리포트 명단에만 둔다).
- `rollMonth`/`rollOffseason`은 `fit`을 받으면 판정 대신 그 값을 쓴다(테스트에서 계수 1.0·각성 0 고정용).
- 튜닝 스모크(`npm run test:growth`) 결과: (Step 2 출력 요약과 조정한 상수)
```

- [ ] **Step 4: 빌드와 전체 테스트**

Run: `npm install && npm run build && npm test`
Expected: `dist/`에 `game/growth.js`, `game/inbox.js`가 생기고 `dist/app.js`·`dist/styles.css`·`dist/model.js` 갱신, 테스트 전부 통과. (`npm install`이 만든 `node_modules/`는 커밋하지 않는다. `package-lock.json`이 바뀌면 되돌린다: `git checkout package-lock.json`.)

- [ ] **Step 5: 커밋**

```bash
git add scripts/growth-smoke.mjs package.json docs/superpowers/specs/2026-09-29-growth-decay-design.md dist
git commit -m "성장 10시즌 튜닝 스모크 추가, 구현 보정 기록, dist 재생성

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: PR 준비 (사용자 확인 후)**

`git fetch github && git rebase github/main` 후 `npm test`. PR 설명에 적을 것(AGENTS.md):
- 공유 파일 변경: `model.js` 저장 키 v4·`PREV_KEYS`, 선수 `dev`·상태 `inbox` 필드, `app.js` 주 메뉴에 "메시지" 탭 추가
- 계약 브랜치 안내: 알림은 `game/inbox.js`의 `pushMessage(state, {from, subject, body, importance})`로 보낸다
- 범위 밖: 은퇴·신인(계약 브랜치), AI 1·2군 이동, 게임성 특성
```
