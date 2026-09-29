// roster.mjs 결과를 게임 데이터 game/kbo-2026.js 로 쓴다. `npm run data:kbo`
import {writeFileSync} from 'node:fs';
import {players,TEAMS} from './roster.mjs';
import {PIT,RBI,FA} from './extra.mjs';

export const MARKS=['KT','삼','한','SSG','키','NC','LG','롯','두','KIA'];
const r3=v=>Math.round(v*1000)/1000;
const ZERO={pa:0,ab:0,h:0,hr:0,bb:0,k:0,doubles:0,triples:0,sb:0,attempts:0,rbi:0,avg:0,obp:0,slg:0,ops:0,babip:0,iso:0,bbRate:0,kRate:0,
  g:0,gs:0,w:0,l:0,sv:0,hld:0,outs:0,ip:0,ha:0,r:0,er:0,hp:0,era:0,whip:0,k9:0,bb9:0,war:0};

// 원문 성적을 화면이 쓰는 기록 필드로 푼다. 원문에 없는 값(2루타·도루·WAR 등)은 0.
function hitterStats(p,key){
  const s=p.st;if(!s)return {};
  const ab=s.PA-s.BB-Math.round(s.PA*.02),h=Math.round(s.AVG*ab),obp=(h+s.BB)/(ab+s.BB),slg=s.OPS-obp,bip=ab-s.SO-s.HR;
  return {g:s.G,pa:s.PA,ab,h,hr:s.HR,bb:s.BB,k:s.SO,rbi:RBI[key]??0,avg:s.AVG,obp:r3(obp),slg:r3(slg),ops:s.OPS,
    babip:bip>0?r3((h-s.HR)/bip):0,iso:r3(slg-s.AVG),bbRate:r3(s.BB/s.PA),kRate:r3(s.SO/s.PA)};
}
function pitcherStats(p,key){
  const s=p.st;if(!s)return {};
  const [era,w,l,sv,hld]=(PIT[key]||'0,0,0,0,0').split(',').map(Number);
  const outs=Math.round(s.IP*3),er=Math.round(era*s.IP/9);
  return {g:s.G,gs:s.IP/s.G>=3.5?s.G:0,w,l,sv,hld,outs,ip:Math.floor(outs/3)+(outs%3)/10,ha:Math.round(s.WHIP*s.IP-s.BB),bb:s.BB,k:s.SO,
    er,r:er,era,whip:s.WHIP,k9:r3(s.SO*9/s.IP),bb9:r3(s.BB*9/s.IP)};
}

const out=[];
TEAMS.forEach(([code,,name],t)=>{
  players.filter(p=>p.code===code).forEach((p,i)=>{
    const key=`${code}:${p.ko}`,hand=p.hand||null;
    out.push({id:`${t}-${i}`,name:p.ko,team:name,teamIndex:t,group:p.grp==='1군'?'first':'second',pitcher:p.pitcher,
      pos:p.pitcher?(p.role==='SP'||p.role==='2군'&&p.ratings.stamina>=45?'SP':'RP'):p.pos,role:p.role==='2군'?null:p.role,age:p.age,
      ...(p.pitcher?{throws:hand}:{bats:hand}),ratings:p.ratings,ovr:p.ovr,pot:p.pot,faYear:FA[key]??null,
      lastSeason:p.st?{...p.st}:null,energy:100,no:'',injury:'',days:0,
      ...ZERO,...(p.pitcher?pitcherStats(p,key):hitterStats(p,key))});
  });
});

const body=`// 자동 생성 파일. 직접 고치지 말고 scripts/kbo-2026 을 고친 뒤 \`npm run data:kbo\`.
// 2026 KBO 개막 로스터(외국인 제외). 능력치 20–80, 기록 필드는 2025 원문 성적.
export const TEAMS=${JSON.stringify(TEAMS.map(([,,name],i)=>({name,mark:MARKS[i]})))};
export const PLAYERS=${JSON.stringify(out)};
`;
if(import.meta.url===`file://${process.argv[1]}`){writeFileSync(new URL('../../game/kbo-2026.js',import.meta.url),body);console.log(`game/kbo-2026.js: ${out.length}명`);}
export {body};
