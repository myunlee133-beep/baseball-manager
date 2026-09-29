import { spawnSync } from 'node:child_process';
for(const file of ['smoke','ratings','pitch','play-script','rules']){
 const run=spawnSync(process.execPath,[`tests/upstream-runtime/${file}-test.js`],{stdio:'inherit'});
 if(run.status!==0){process.exitCode=1;break;}
}
