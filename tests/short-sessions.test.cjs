const {test}=require('node:test'),assert=require('node:assert/strict');
const data=require('../docs/review/data.json'),{create}=require('../docs/review/engine.js'),e=create(data);
function complete(engine,state,n,count=engine.threshold(n)) {const a=engine.start(state,n);a.questions.forEach((q,i)=>engine.answer(state,n,a.id,q.wordId,i<count?q.wordId:q.options.find(id=>id!==q.wordId)));engine.finish(state,n,a.id);return a;}
function ready(){const s=e.empty();for(let n=1;n<=16;n++)complete(e,s,n);return s;}
test('a fresh device resumes the saved later session instead of preferring its empty timestamp',()=>{
 const saved=ready();saved.activeSession=17;saved.updatedAt='2026-10-27T03:35:10.756Z';
 assert.equal(e.merge(e.empty(),saved).activeSession,17);assert.equal(e.merge(saved,e.empty()).activeSession,17);
});
test('all 75 remaining words are covered once in short sets, and again in one complete review',()=>{
 const old=data.previousSessions.flatMap(s=>s.wordIds),short=data.sessions.slice(16,24);
 assert.deepEqual(short.map(s=>s.wordIds.length),[10,10,10,10,10,10,10,5]);
 assert.deepEqual(short.flatMap(s=>s.wordIds),old);assert.equal(new Set(old).size,75);
 assert.deepEqual(data.sessions[24].wordIds,old);assert.equal(data.sessions[24].kind,'combined-review');
 assert.ok(short.every(s=>s.reviewFirst));assert.equal(data.sessions[24].reviewFirst,true);
});
test('short sessions need 9/10, the last five need 5/5, and the review needs 65/75',()=>{
 const s=ready();assert.equal(e.unlocked(s),17);complete(e,s,17,8);assert.equal(e.unlocked(s),17);
 complete(e,s,17,9);assert.equal(e.unlocked(s),18);for(let n=18;n<=23;n++)complete(e,s,n,9);
 complete(e,s,24,4);assert.equal(e.unlocked(s),24);complete(e,s,24,5);assert.equal(e.unlocked(s),25);
 complete(e,s,25,64);assert.equal(e.passed(s,25),false);const a=complete(e,s,25,65);assert.equal(a.questions.length,75);assert.equal(e.passed(s,25),true);
});
test('reshaping saves every original attempt without treating old answers as new test scores',()=>{
 const old=create({...data,layoutId:undefined,previousSessions:[],sessions:[...data.sessions.slice(0,16),...data.previousSessions]});
 const saved=old.empty();for(let n=1;n<=16;n++)complete(old,saved,n);
 const a=old.start(saved,17);a.questions.slice(0,4).forEach(q=>old.answer(saved,17,a.id,q.wordId,q.wordId));
 const migrated=e.normalize(saved);assert.deepEqual(migrated.archivedSessions[17],saved.sessions[17]);
 for(let n=1;n<=16;n++)assert.deepEqual(migrated.sessions[n],saved.sessions[n]);
 assert.equal(e.unlocked(migrated),17);assert.equal(e.attempts(migrated,17).length,0);assert.equal(e.score(migrated),old.score(saved));
 assert.deepEqual(e.normalize(migrated),migrated);
 const newTest=e.start(migrated,17);e.answer(migrated,17,newTest.id,newTest.questions[0].wordId,newTest.questions[0].wordId);
 old.answer(saved,17,a.id,a.questions[4].wordId,a.questions[4].wordId);
 const merged=e.merge(migrated,saved);assert.equal(Object.keys(e.archivedAttempts(merged,17)[0].answers).length,5);
 assert.deepEqual(e.latest(merged,17),newTest);assert.deepEqual(e.merge(merged,saved),merged);
});
