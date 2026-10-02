import { mkdirSync, copyFileSync, cpSync } from 'node:fs';
mkdirSync('dist',{recursive:true});
for(const name of ['index.html','styles.css','app.js','model.js','game-bridge.js','game-ui.js','offseason-ui.js','draft-ui.js'])copyFileSync(name,`dist/${name}`);
cpSync('game','dist/game',{recursive:true});
