(function (root) {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const uuid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const shuffle = a => {const b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
  function create(data) {
    const byId=new Map(data.words.map(w=>[w.id,w]));
    const sessionIds=n=>data.sessions[n-1]?.wordIds || [];
    const threshold=n=>Math.ceil(sessionIds(n).length*data.passScore/data.size);
    const empty=()=>({version:1,poolId:data.poolId,activeSession:1,sessions:{},updatedAt:null});
    const valid=s=>!!s&&s.version===1&&s.poolId===data.poolId&&s.sessions&&typeof s.sessions==='object'&&!Array.isArray(s.sessions);
    function cleanAttempt(a,n) {
      const ids=sessionIds(n);
      if(!a?.id||typeof a.id!=='string'||!Array.isArray(a.questions)||a.questions.length!==ids.length||new Set(a.questions.map(q=>q.wordId)).size!==ids.length||a.questions.some(q=>!ids.includes(q.wordId)||!Array.isArray(q.options)||q.options.length!==4||new Set(q.options).size!==4||!q.options.includes(q.wordId)||q.options.some(id=>!ids.includes(id)))) return null;
      const result={id:a.id,startedAt:a.startedAt||null,questions:copy(a.questions),answers:{},finishedAt:null};
      for(const q of a.questions){const v=a.answers?.[q.wordId];if(v&&q.options.includes(v.optionId))result.answers[q.wordId]={optionId:v.optionId,answeredAt:v.answeredAt||null};}
      if(Object.keys(result.answers).length===ids.length&&a.finishedAt)result.finishedAt=a.finishedAt;
      return result;
    }
    function normalize(s) {
      const result=empty();if(!valid(s))return result;
      result.activeSession=Math.max(1,Math.min(data.sessions.length,Number(s.activeSession)||1));result.updatedAt=s.updatedAt||null;
      for(const row of data.sessions){const attempts={};for(const a of Object.values(s.sessions[row.number]?.attempts||{})){const v=cleanAttempt(a,row.number);if(v)attempts[v.id]=v;}if(Object.keys(attempts).length)result.sessions[row.number]={attempts};}
      result.activeSession=Math.min(result.activeSession,unlocked(result));return result;
    }
    const attempts=(s,n)=>Object.values(s.sessions[n]?.attempts||{}).sort((a,b)=>String(a.startedAt).localeCompare(String(b.startedAt))||a.id.localeCompare(b.id));
    const correct=a=>a.questions.filter(q=>a.answers[q.wordId]?.optionId===q.wordId).length;
    const passed=(s,n)=>attempts(s,n).some(a=>a.finishedAt&&correct(a)>=threshold(n));
    function unlocked(s){for(const row of data.sessions)if(!passed(s,row.number))return row.number;return data.sessions.length;}
    const latest=(s,n)=>attempts(s,n).at(-1)||null;
    const missed=a=>a.questions.filter(q=>a.answers[q.wordId]&&a.answers[q.wordId].optionId!==q.wordId).map(q=>q.wordId);
    function start(s,n){if(n>unlocked(s))return null;const last=latest(s,n);if(last&&!last.finishedAt)return last;
      const ids=sessionIds(n),a={id:uuid(),startedAt:new Date().toISOString(),questions:shuffle(ids).map(id=>({wordId:id,options:shuffle([id,...shuffle(ids.filter(x=>x!==id)).slice(0,3)])})),answers:{},finishedAt:null};
      s.sessions[n]||={attempts:{}};s.sessions[n].attempts[a.id]=a;s.activeSession=n;return a;
    }
    function answer(s,n,attemptId,wordId,optionId){if(n>unlocked(s))return false;const a=s.sessions[n]?.attempts[attemptId],q=a?.questions.find(q=>q.wordId===wordId);if(!q||a.finishedAt||a.answers[wordId]||!q.options.includes(optionId))return false;a.answers[wordId]={optionId,answeredAt:new Date().toISOString()};return true;}
    function finish(s,n,attemptId){const a=s.sessions[n]?.attempts[attemptId];if(!a||Object.keys(a.answers).length!==a.questions.length)return false;a.finishedAt||=new Date().toISOString();return true;}
    function merge(x,y){const a=normalize(x),b=normalize(y),result=empty();
      for(const row of data.sessions){const n=row.number,out={};const left=a.sessions[n]?.attempts||{},right=b.sessions[n]?.attempts||{};
        for(const id of new Set([...Object.keys(left),...Object.keys(right)])){
          const p=left[id],q=right[id];if(!p||!q){out[id]=copy(p||q);continue;}
          const base=copy(JSON.stringify(p.questions)<=JSON.stringify(q.questions)?p:q);
          base.startedAt=[p.startedAt,q.startedAt].filter(Boolean).sort()[0]||null;base.answers={};
          for(const question of base.questions){const values=[p.answers[question.wordId],q.answers[question.wordId]].filter(v=>v&&question.options.includes(v.optionId)).sort((u,v)=>String(u.answeredAt).localeCompare(String(v.answeredAt))||u.optionId-v.optionId);if(values.length)base.answers[question.wordId]=copy(values[0]);}
          base.finishedAt=Object.keys(base.answers).length===base.questions.length?[p.finishedAt,q.finishedAt].filter(Boolean).sort()[0]||null:null;out[id]=base;
        }
        if(Object.keys(out).length)result.sessions[n]={attempts:out};
      }
      const latestState=String(a.updatedAt)>=String(b.updatedAt)?a:b;result.updatedAt=[a.updatedAt,b.updatedAt].filter(Boolean).sort().at(-1)||null;result.activeSession=Math.min(latestState.activeSession,unlocked(result));return result;
    }
    const score=s=>data.sessions.reduce((sum,row)=>sum+attempts(s,row.number).reduce((t,a)=>t+Object.keys(a.answers).length+(a.finishedAt?1:0),0),0);
    return {data,byId,empty,valid,normalize,attempts,correct,passed,unlocked,latest,missed,start,answer,finish,merge,score,threshold,sessionIds};
  }
  const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HarryReviewEngine=api;
})(globalThis);
