const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('../../marco-learning-hub/harry-math-practice/node_modules/jsdom');
const root=path.join(__dirname,'../docs/learn-2');
const words=JSON.parse(fs.readFileSync(path.join(root,'words.json'),'utf8'));
const nextWords=JSON.parse(fs.readFileSync(path.join(root,'next-words.json'),'utf8'));
const key='harry-vocabulary-to-learn-200-2-v1';
const copy=value=>JSON.parse(JSON.stringify(value));
async function browser(saved={}, online=false) {
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:online?'https://example.com/learn-2/':'http://localhost/learn-2/',runScripts:'outside-only'});
  const w=dom.window,d=w.document,calls=[];
  for(const [key,value] of Object.entries(saved)) w.localStorage.setItem(key,JSON.stringify(value));
  w.fetch=async url=>({ok:true,json:async()=>copy(url.includes('next-words')?nextWords:words)});
  w.scrollTo=()=>{};
  w.MarcoOnlineSync={create(options){calls.push(options);return{start:value=>calls.push(copy(value)),push:value=>calls.push(copy(value))};}};
  w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
  await new Promise(resolve=>setTimeout(resolve,0));
  return {dom,w,d,calls,progress:()=>JSON.parse(w.localStorage.getItem(key)),snapshot:()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,JSON.parse(w.localStorage.getItem(k))]))};
}
function answer(b, index, correct=true) {
  const session=b.progress().activeSession;
  const question=b.progress().sessions[session].questions[index];
  const choice=correct?question.wordId:question.options.find(id=>id!==question.wordId);
  b.d.querySelector(`[data-question="${index}"][data-option="${choice}"]`).click();
}
test('200 unique source words exclude every Vocabulary 1 headword, with valid sentence blanks',()=>{
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/words.json'),'utf8'));
  const old=fs.readFileSync(path.join(__dirname,'../docs/learn/index.html'),'utf8');
  const previousIds=vm.runInNewContext(old.match(/const ILLUSTRATION_IDS = ([\s\S]*?);/)[1]).flat();
  const normalize=s=>s.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  const previous=new Set(source.filter(w=>previousIds.includes(w.id)).map(w=>normalize(w.word)));
  assert.equal(words.length,200);
  assert.equal(new Set(words.map(w=>normalize(w.sourceWord))).size,200);
  for(const [i,word] of words.entries()) {
    assert.ok(source.some(w=>w.id===word.id&&w.word===word.sourceWord));
    assert.ok(!previous.has(normalize(word.sourceWord)),word.word);
    assert.equal(word.day,Math.floor(i/10)+1);
    assert.equal(word.cloze.split('_____').length,2,word.word);
    assert.ok(word.partOfSpeech&&word.meaning&&word.example);
    assert.ok(!word.meaning.endsWith(' or')&&!word.meaning.endsWith(' has'));
  }
});
test('all 20 days display ten words and ten valid questions with no network tracking in preview',async()=>{
  const b=await browser();
  assert.equal(b.d.querySelectorAll('[data-session]').length,43);
  for(let day=1;day<=20;day++) {
    b.d.querySelector(`[data-session="${day}"]`).click();
    assert.equal(b.d.querySelectorAll('.review-item').length,10);
    assert.deepEqual([...b.d.querySelectorAll('.review-item h2')].map(n=>n.textContent),words.filter(w=>w.day===day).map(w=>w.word));
    b.d.querySelector('#start-review-test').click();
    assert.equal(b.d.querySelectorAll('.test-question').length,10);
    assert.equal(b.d.querySelectorAll('.test-question .blank').length,10);
    assert.equal(b.d.querySelectorAll('[data-option]').length,40);
    assert.equal(b.d.querySelector('#finish-test').disabled,true);
  }
  assert.equal(b.calls.length,0);
  assert.equal(b.d.querySelectorAll('script[src*="tracker"]').length,0);
  b.w.close();
});
test('each unfinished and completed round survives reload; later rounds retain original misses',async()=>{
  const legacy={'harry-vocabulary-to-learn-200-v2':{version:4,sessions:{1:{mastered:[34]}},activity:[{wordId:34,correct:true}]},'harry-combined-vocabulary-known-v2':[1,2,3]};
  let b=await browser(legacy);
  b.d.querySelector('#start-review-test').click();
  answer(b,0,false);answer(b,1,false);
  const originalQuestions=copy(b.progress().sessions[1].questions);
  const firstAnswers=copy(b.progress().activity);
  let snapshot=b.snapshot();b.w.close();b=await browser(snapshot);
  assert.deepEqual(b.progress().sessions[1].questions,originalQuestions);
  assert.deepEqual(b.progress().activity,firstAnswers);
  assert.equal(b.d.querySelectorAll('[data-option]:disabled').length,8);
  for(let i=2;i<10;i++)answer(b,i,true);
  b.d.querySelector('#finish-test').click();
  const round1=copy(b.progress().sessions[1].rounds[1]);
  assert.ok(round1.finishedAt);
  b.d.querySelector('#next-round').click();
  assert.equal(b.d.querySelectorAll('.test-question').length,2);
  answer(b,0,true);
  snapshot=b.snapshot();b.w.close();b=await browser(snapshot);
  assert.equal(b.d.querySelectorAll('.test-question').length,2);
  assert.equal(b.d.querySelectorAll('[data-option]:disabled').length,4);
  assert.deepEqual(b.progress().sessions[1].rounds[1],round1);
  answer(b,1,false);b.d.querySelector('#finish-test').click();b.d.querySelector('#next-round').click();
  assert.equal(b.d.querySelectorAll('.test-question').length,1);
  answer(b,0,true);b.d.querySelector('#finish-test').click();
  snapshot=b.snapshot();b.w.close();b=await browser(snapshot);
  const final=b.progress();
  assert.equal(final.sessions[1].mastered.length,10);
  assert.equal(Object.keys(final.sessions[1].rounds).length,3);
  assert.equal(final.activity.length,13);
  assert.deepEqual(final.sessions[1].rounds[1],round1);
  assert.equal(b.d.querySelectorAll('.round-record').length,3);
  assert.match(b.d.querySelector('.round-record-score').textContent,/8 correct · 2 missed · Finished/);
  for(const [oldKey,value] of Object.entries(legacy))assert.deepEqual(b.snapshot()[oldKey],value);
  b.w.close();
});
test('stale online progress cannot discard local answers or another day’s round',async()=>{
  const b=await browser({},true);
  assert.equal(b.calls[0].appId,'harry-vocabulary-to-learn-200-2');
  b.d.querySelector('#start-review-test').click();
  const stale=copy(b.progress());answer(b,0,false);
  const answer1=copy(b.progress().activity[0]);
  b.d.querySelector('[data-session="2"]').click();b.d.querySelector('#start-review-test').click();answer(b,0,true);
  b.calls[0].onRemote(stale);
  assert.equal(b.progress().activity.length,2);
  assert.deepEqual(b.progress().activity[0],answer1);
  assert.equal(Object.keys(b.progress().sessions[2].rounds[1].answers).length,1);
  assert.equal(b.progress().activeSession,2);
  b.w.close();
});

test('refresh after the last answer still lets Harry finish and date the round',async()=>{
  let b=await browser();b.d.querySelector('#start-review-test').click();
  for(let i=0;i<10;i++)answer(b,i,true);
  const saved=b.snapshot();b.w.close();b=await browser(saved);
  assert.equal(b.d.querySelectorAll('[data-option]:disabled').length,40);
  assert.equal(b.d.querySelector('#finish-test').disabled,false);
  b.d.querySelector('#finish-test').click();
  assert.ok(b.progress().sessions[1].rounds[1].finishedAt);
  b.w.close();
});

test('a new device resumes the saved day and keeps each round’s original answers',async()=>{
  const first=await browser();
  first.d.querySelector('[data-session="3"]').click();first.d.querySelector('#start-review-test').click();answer(first,0,false);
  const remote=copy(first.progress());first.w.close();
  const second=await browser({},true);second.calls[0].onRemote(remote);
  assert.equal(second.progress().activeSession,3);
  assert.equal(second.d.querySelectorAll('[data-option]:disabled').length,4);
  assert.deepEqual(second.progress().activity,remote.activity);
  assert.deepEqual(second.progress().sessions[3].rounds,remote.sessions[3].rounds);
  second.w.close();
});

test('an older open tab merges newly saved local answers before saving its own',async()=>{
  const first=await browser();first.d.querySelector('#start-review-test').click();
  const second=await browser(first.snapshot());
  answer(first,0,false);
  second.w.localStorage.setItem(key,JSON.stringify(first.progress()));
  answer(second,1,true);
  assert.equal(second.progress().activity.length,2);
  assert.equal(second.d.querySelectorAll('[data-option]:disabled').length,8);
  assert.deepEqual(second.progress().activity.find(a=>a.wordId===first.progress().activity[0].wordId),first.progress().activity[0]);
  first.w.close();second.w.close();
});

test('twenty new ten-word sessions follow the three fixed reviews, with distinct source words and complete blanks',async()=>{
  assert.equal(nextWords.length,200);
  const allIds=new Set(words.map(w=>w.id));
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/words.json'),'utf8'));
  const old=fs.readFileSync(path.join(__dirname,'../docs/learn/index.html'),'utf8');
  const firstIds=vm.runInNewContext(old.match(/const ILLUSTRATION_IDS = ([\s\S]*?);/)[1]).flat();
  for(const word of nextWords){
    assert.ok(!allIds.has(word.id));assert.ok(!firstIds.includes(word.id));allIds.add(word.id);
    assert.ok(source.some(s=>s.id===word.id&&s.word===word.sourceWord));
    assert.equal(word.blankForm.toLowerCase(),word.word.toLowerCase());
    assert.equal(word.cloze.split('_____').length,2);
    assert.ok(word.meaning&&word.partOfSpeech&&(word.art.file || word.art.sheet>=9&&word.art.sheet<=16));
  }
  const b=await browser();
  for(let session=21;session<=43;session++){
    b.d.querySelector(`[data-session="${session}"]`).click();
    const count=session===23?24:session<24?25:10;
    assert.equal(b.d.querySelectorAll('.review-item').length,count);
    if(session>=24){
      assert.deepEqual([...b.d.querySelectorAll('.review-item h2')].map(n=>n.textContent),nextWords.filter(w=>w.day===session).map(w=>w.word));
      assert.equal(b.d.querySelectorAll('[data-speak]').length,10);
    }
    b.d.querySelector('#start-review-test').click();
    assert.equal(b.d.querySelectorAll('.test-question').length,count);
    assert.equal(b.d.querySelectorAll('[data-option]').length,count*4);
  }
  b.w.close();
});

test('appended days retain independent progress, original rounds, and saved answers after online sync and reload',async()=>{
  let b=await browser({},true);
  b.d.querySelector('#start-review-test').click();answer(b,0,false);
  const original=copy(b.progress().sessions[1].rounds);
  b.d.querySelector('[data-session="24"]').click();b.d.querySelector('#start-review-test').click();
  for(let i=0;i<10;i++)answer(b,i,i!==0);
  b.d.querySelector('#finish-test').click();
  const saved=copy(b.progress());b.w.close();b=await browser({},true);b.calls[0].onRemote(saved);
  assert.equal(b.progress().activeSession,24);
  assert.deepEqual(b.progress().sessions[1].rounds,original);
  assert.equal(b.progress().sessions[24].mastered.length,9);
  b.d.querySelector('#next-round').click();assert.equal(b.d.querySelectorAll('.test-question').length,1);
  answer(b,0,true);b.d.querySelector('#finish-test').click();
  assert.equal(b.progress().sessions[24].mastered.length,10);
  assert.equal(Object.keys(b.progress().sessions[24].rounds).length,2);
  assert.match(b.d.querySelector('#next-session').textContent,/Day 25/);
  b.w.close();
});
