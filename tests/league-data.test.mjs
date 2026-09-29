import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TEAMS,PLAYERS} from '../game/kbo-2026.js';
import {ovr} from '../game/player-ratings.js';
import {loadState,STATE_KEY,LEGACY_KEYS,initialState} from '../model.js';
import {body} from '../scripts/kbo-2026/emit.mjs';

const first=PLAYERS.filter(p=>p.group==='first');
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};

test('10개 구단 410명, 1군 276명, 구단마다 1군 선발 4명 이상',()=>{
  assert.equal(TEAMS.length,10);
  assert.equal(PLAYERS.length,410);
  assert.equal(first.length,276);
  assert.equal(new Set(PLAYERS.map(p=>p.id)).size,410);
  TEAMS.forEach((t,i)=>{
    const sp=first.filter(p=>p.teamIndex===i&&p.role==='SP').length;
    assert.ok(sp>=4,`${t.name} 선발 ${sp}명`);
  });
});

test('능력치는 20–80 정수이고 POT는 OVR 이상 80 이하',()=>{
  for(const p of PLAYERS){
    const keys=p.pitcher?['velocity','stuff','control','stamina']:['contact','eye','power','speed','defense'];
    assert.deepEqual(Object.keys(p.ratings),keys,p.name);
    for(const k of keys)assert.ok(Number.isInteger(p.ratings[k])&&p.ratings[k]>=20&&p.ratings[k]<=80,`${p.name} ${k}=${p.ratings[k]}`);
    assert.ok(p.pot>=p.ovr&&p.pot<=80,`${p.name} ${p.ovr}/${p.pot}`);
    for(const [k,v] of Object.entries(p))if(typeof v==='number')assert.ok(Number.isFinite(v),`${p.name}.${k}`);
  }
});

test('저장된 OVR은 ovr()로 다시 계산한 값과 같고, 1군 분포는 평균 50·표준편차 8',()=>{
  for(const p of PLAYERS)assert.equal(ovr(p),p.ovr,p.name);
  const v=first.map(p=>p.ovr);
  assert.ok(Math.abs(mean(v)-50)<1,`평균 ${mean(v)}`);
  assert.ok(Math.abs(sd(v)-8)<1,`표준편차 ${sd(v)}`);
});

test('사용자가 지정한 포텐이 그대로 들어간다',()=>{
  const want={'KIA 타이거즈:김도영':80,'KT 위즈:안현민':76,'NC 다이노스:김주원':75,'한화 이글스:문현빈':72,'KT 위즈:박영현':72,'KIA 타이거즈:이의리':70,
    'SSG 랜더스:이로운':68,'한화 이글스:오재원':68,'KIA 타이거즈:윤도현':66,'두산 베어스:안재석':64,'한화 이글스:문동주':77,'한화 이글스:정우주':75,'한화 이글스:김서현':66,
    '두산 베어스:김택연':68,'삼성 라이온즈:배찬승':66,'SSG 랜더스:조병현':68,'삼성 라이온즈:김영웅':66,'삼성 라이온즈:이재현':69,'KT 위즈:소형준':60,'키움 히어로즈:정현우':68,'두산 베어스:박준순':63};
  for(const [key,pot] of Object.entries(want)){
    const [team,name]=key.split(':'),p=PLAYERS.find(x=>x.team===team&&x.name===name);
    assert.equal(p?.pot,pot,key);
  }
});

test('game/kbo-2026.js 는 생성기 출력과 같다 (npm run data:kbo)',()=>{
  assert.equal(readFileSync(new URL('../game/kbo-2026.js',import.meta.url),'utf8'),body);
});

const memory=entries=>{const m=new Map(entries);return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),keys:()=>[...m.keys()]};};

test('v1(가상 선수) 저장이 있으면 지우고 2026 로스터로 새로 시작한다',()=>{
  const store=memory(LEGACY_KEYS.map(k=>[k,'{}']));
  const {state,reset}=loadState(store);
  assert.equal(reset,true);
  assert.deepEqual(store.keys(),[]);
  assert.equal(state.players[0].team,'KT 위즈');
  assert.equal(Object.keys(state.league).length,9);
});

test('v2 저장이 있으면 그대로 불러오고, 저장이 없으면 안내 없이 새로 시작한다',()=>{
  const saved=initialState();saved.order.reverse();
  const store=memory([[STATE_KEY,JSON.stringify(saved)]]);
  assert.deepEqual(loadState(store),{state:saved,reset:false});
  assert.equal(loadState(memory([])).reset,false);
});
