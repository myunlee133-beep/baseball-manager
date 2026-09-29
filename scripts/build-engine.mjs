import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.DUGOUT_TYPESCRIPT || 'typescript');
for(const [input,output] of [['vendor/pro-baseball','game'],['tests/upstream','tests/upstream-runtime']]){
 mkdirSync(output,{recursive:true});
 for(const file of readdirSync(input).filter(n=>n.endsWith('.ts'))){
  let text=ts.transpileModule(readFileSync(`${input}/${file}`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  text=text.replace(/(from\s+['"]\.[^'"]+)(['"])/g,'$1.js$2').replaceAll('../../vendor/pro-baseball/','../../game/');
  writeFileSync(`${output}/${file.replace(/\.ts$/,'.js')}`,text);
 }
}
