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
