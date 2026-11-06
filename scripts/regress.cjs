const fs=require('fs'), path=require('path');
const root=require('path').join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'assets/eden-zh.js'),'utf8');
const a=src.indexOf('var reEmail'), b=src.indexOf('function tr(s)'), c=src.indexOf('function inEditable(');
const helpers=src.slice(a,b), body=src.slice(b,c), extra=src.slice(src.indexOf('var KEEP_WORD'), c);
const shim=`var exact={},pats=[],LONG=[];
function esc(s){return s.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&');}
function compile(k,v){if(typeof v!=='string')return;if(k.indexOf('\${')<0){exact[k]=v;return;}
  var out='',i=0;while(i<k.length){var j=k.indexOf('\${',i);if(j<0){out+=esc(k.slice(i));break;}
  out+=esc(k.slice(i,j));var d=1,p=j+2;while(p<k.length&&d>0){var ch=k.charAt(p);if(ch==='{')d++;else if(ch==='}')d--;if(d>0)p++;}
  out+='(.+?)';i=p+1;}
  var literal=k.replace(/\\$\\{[^}]*\\}/g,'');var slots=(out.match(/\\([^)]*\\)/g)||[]).length;
  if(literal.replace(/\\s/g,'').length<3||slots>4)return;
  try{pats.push({re:new RegExp('^'+out+'\$'),zh:v,lit:literal.replace(/\\s/g,'').length});}catch(e){}}
module.exports=function makeTr(D){exact={};pats=[];LONG=[];
  for(var k in D){compile(k,D[k]);if(k.indexOf('\${')<0&&k.length>=20)LONG.push([k,D[k]]);}
  LONG.sort(function(x,y){return y[0].length-x[0].length;});
  pats.sort(function(x,y){return (y.lit||0)-(x.lit||0);});
${helpers}
${extra}
${body}
  return tr;};`;
fs.writeFileSync('/tmp/mkreg.cjs', shim);
const makeTr=require('/tmp/mkreg.cjs');
const D=JSON.parse(fs.readFileSync(path.join(root,'assets/eden-zh.json'),'utf8'));
const tr=makeTr(D);
const cases=[['Chat context','对话上下文'],['Biggest files','最大的文件'],['Search any topic','搜索任何话题'],['3 of 5 files','5 个文件中的 3 个'],['5 of 12 saved items','12 条收藏中的 5 条'],['View skill: skill-creator','查看技能：skill-creator'],['Export humanizer','导出 humanizer'],['Welcome to Eden','欢迎来到 Eden']];
const blocks=['x3136458902@gmail.com','name.substack.com/feed','/rss','#0b1b2b','skill-creator','onboarding/finish'];
let pass=0,fail=0;
for(const [s,e] of cases){const g=tr(s);if(g===e)pass++;else{fail++;console.log('✗',JSON.stringify(s),'→',JSON.stringify(g),'期望',JSON.stringify(e));}}
for(const s of blocks){const g=tr(s);if(g===null)pass++;else{fail++;console.log('✗ 未拦截',JSON.stringify(s),'→',JSON.stringify(g));}}
console.log(fail===0?`ALL PASS (${pass}/${pass+fail})`:`FAIL ${fail}`);
process.exit(fail?1:0);
