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
