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
