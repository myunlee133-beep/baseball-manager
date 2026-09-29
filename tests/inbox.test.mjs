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
