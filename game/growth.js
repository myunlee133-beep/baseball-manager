// game/growth.js
/** 3단계 성장·퇴화. 월간·오프시즌 틱에서 저장 능력치(20–80)를 나이 곡선대로 움직이고 OVR·POT를 다시 계산한다. 상태는 제자리 변경한다.
 *  규칙과 숫자는 docs/superpowers/specs/2026-09-29-growth-decay-design.md. */

export const blankDev=()=>({fit:{sum:0,n:0,bsum:0},mark:{pa:0,outs:0},pending:0,eventYear:null});
export const ensureDev=p=>p.dev??=blankDev();
