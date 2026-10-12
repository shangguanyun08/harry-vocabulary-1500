const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../docs');
function source(course){return fs.readFileSync(path.join(root,course,course==='learn'?'index.html':'app.js'),'utf8');}
function fn(text,name){const match=text.match(new RegExp('    (?:async )?function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}'));assert.ok(match,name);return match[0];}
for(const course of ['learn','learn-2']){
 test(course+' archive loads historical online answers without uploading',async()=>{
  const saved={version:4,grouping:'10-words-per-day',activeSession:7,sessions:{7:{rounds:{1:{answers:{0:65}}}}},activity:[{wordId:65,round:1,correct:false}]};
  const requests=[],selected=[];let renders=0;
  const context={PROGRESS_VERSION:4,SESSION_COUNT:course==='learn'?26:43,location:{hostname:'archive.example',protocol:'https:'},state:{progress:null},fetch:async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>({progress:{state:saved}})};},loadSession:n=>selected.push(n),render:()=>renders++,document:{querySelector:()=>({textContent:''})}};
  const code=source(course);vm.createContext(context);vm.runInContext(fn(code,'validSavedProgress')+'\n'+fn(code,'normalizeProgress')+'\n'+fn(code,'connectOnlineSync'),context);
  await context.connectOnlineSync();assert.equal(requests.length,1);assert.ok(!requests[0].options.method||requests[0].options.method==='GET');assert.match(requests[0].url,/api\/shared\/progress\?appId=harry-vocabulary-to-learn-200/);assert.deepEqual(selected,[7]);assert.equal(renders,1);assert.deepEqual(context.state.progress.activity,saved.activity);assert.deepEqual(context.state.progress.sessions,saved.sessions);
 });
 test(course+' archive cannot record an answer, start or finish a test, or upload in local preview',async()=>{
  const code=source(course),context={ARCHIVED:true,location:{hostname:'localhost',protocol:'http:'},fetch:()=>assert.fail('local archive made an online request')};vm.createContext(context);
  for(const name of ['save','choose','beginRound','finishTest'])vm.runInContext(fn(code,name),context);
  context.save();context.choose(0,65);context.beginRound();context.finishTest();vm.runInContext(fn(code,'connectOnlineSync'),context);await context.connectOnlineSync();
 });
 test(course+' archive handles a failed online read without losing local history',async()=>{
  const local={sessions:{1:{rounds:{1:{answers:{0:65}}}}}},note={textContent:''};const context={location:{hostname:'archive.example',protocol:'https:'},state:{progress:local},fetch:async()=>({ok:false}),document:{querySelector:()=>note}};vm.createContext(context);vm.runInContext(fn(source(course),'connectOnlineSync'),context);await context.connectOnlineSync();assert.equal(context.state.progress,local);assert.match(note.textContent,/showing device records/);
 });
}
