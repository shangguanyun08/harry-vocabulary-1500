const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const data=require('../docs/review/data.json');
const {create}=require('../docs/review/engine.js');
const e=create(data);
const copy=x=>JSON.parse(JSON.stringify(x));
function finish(s,n,right){const a=e.start(s,n);a.questions.forEach((q,i)=>e.answer(s,n,a.id,q.wordId,i<right?q.wordId:q.options.find(id=>id!==q.wordId)));e.finish(s,n,a.id);return a;}
test('frozen source pool and every 15-word session preserve complete sentence and illustration data',()=>{
  assert.equal(data.words.length,190);assert.equal(data.sessions.length,13);assert.equal(new Set(data.words.map(w=>w.id)).size,190);assert.equal(data.sources.learn3.uniqueWords,29);assert.deepEqual(data.sources.learn3.days,[25,26,27,28,29,30,31]);
  assert.equal(new Set(data.sessions.flatMap(s=>s.wordIds)).size,190);assert.equal(data.sessions.at(-1).extraPracticeIds.length,5);
  for(const s of data.sessions){assert.equal(s.wordIds.length,15);assert.equal(new Set(s.wordIds).size,15);}
  for(const w of data.words){assert.equal(w.cloze.split('_____').length,2,w.word);assert.equal(w.cloze.replace('_____',w.blankForm).toLowerCase(),w.example.toLowerCase(),w.word);assert.ok(w.meaning&&w.partOfSpeech,w.word);assert.ok(fs.existsSync(path.join(__dirname,'../docs/review',w.art.path)),w.art.path);}
});
test('12/15 stays locked; all 15 return for a fresh attempt; 13/15 unlocks the next session',()=>{
  const s=e.empty();const first=finish(s,1,12);assert.equal(e.unlocked(s),1);assert.equal(e.start(s,2),null);const snapshot=copy(first);
  const second=e.start(s,1);assert.equal(second.questions.length,15);assert.notEqual(second.id,first.id);assert.equal(Object.keys(second.answers).length,0);second.questions.forEach((q,i)=>e.answer(s,1,second.id,q.wordId,i<13?q.wordId:q.options.find(id=>id!==q.wordId)));e.finish(s,1,second.id);
  assert.equal(e.unlocked(s),2);assert.ok(e.passed(s,1));assert.deepEqual(first,snapshot);assert.equal(e.missed(first).length,3);assert.equal(e.missed(second).length,2);
});
test('a first answer is locked and later correct guesses do not change the score',()=>{
  const s=e.empty(),a=e.start(s,1),q=a.questions[0];assert.ok(e.answer(s,1,a.id,q.wordId,q.options.find(id=>id!==q.wordId)));const v=copy(a.answers[q.wordId]);assert.equal(e.answer(s,1,a.id,q.wordId,q.wordId),false);assert.deepEqual(a.answers[q.wordId],v);assert.equal(e.correct(a),0);assert.equal(e.finish(s,1,a.id),false);
});
test('scores are never accumulated across failed full tests',()=>{
  const s=e.empty();finish(s,1,10);finish(s,1,12);assert.equal(e.unlocked(s),1);assert.equal(e.passed(s,1),false);assert.equal(e.attempts(s,1).length,2);
});
test('refresh preserves question order, locked answers, and an unfinished fully answered test',()=>{
  const s=e.empty(),a=e.start(s,1);for(const q of a.questions)e.answer(s,1,a.id,q.wordId,q.wordId);const restored=e.normalize(copy(s));assert.deepEqual(e.latest(restored,1),a);assert.equal(e.unlocked(restored),1);assert.equal(e.start(restored,1).id,a.id);assert.ok(e.finish(restored,1,a.id));assert.equal(e.unlocked(restored),2);
});
test('sync preserves independent attempts and never discards answers with stale state',()=>{
  const s=e.empty(),a=e.start(s,1),stale=copy(s);e.answer(s,1,a.id,a.questions[0].wordId,a.questions[0].wordId);const remote=copy(stale);e.answer(remote,1,a.id,a.questions[1].wordId,a.questions[1].wordId);const merged=e.merge(s,remote);assert.equal(Object.keys(e.latest(merged,1).answers).length,2);assert.deepEqual(e.merge(merged,stale).sessions,merged.sessions);
  const independent=e.empty();finish(independent,1,12);assert.equal(e.unlocked(e.merge(merged,independent)),1);assert.equal(e.attempts(e.merge(merged,independent),1).length,2);
});
test('sync keeps the earlier first answer on a conflicting device',()=>{
  const s=e.empty(),a=e.start(s,1),q=a.questions[0];e.answer(s,1,a.id,q.wordId,q.options.find(id=>id!==q.wordId));a.answers[q.wordId].answeredAt='2026-10-12T10:00:00Z';const remote=copy(s);remote.sessions[1].attempts[a.id].answers[q.wordId]={optionId:q.wordId,answeredAt:'2026-10-12T11:00:00Z'};assert.equal(e.correct(e.latest(e.merge(s,remote),1)),0);assert.deepEqual(e.merge(s,remote),e.merge(remote,s));
});
test('a later optional test does not revoke an already passed session',()=>{
  const s=e.empty();finish(s,1,13);finish(s,1,0);assert.ok(e.passed(s,1));assert.equal(e.unlocked(s),2);
});
test('another course identity and malformed attempts cannot unlock a session',()=>{
  const s=e.empty();finish(s,1,15);s.poolId='different';assert.deepEqual(e.normalize(s),e.empty());const t=e.empty(),a=e.start(t,1);a.questions[0].options=[a.questions[0].wordId];assert.equal(e.attempts(e.normalize(t),1).length,0);
});
