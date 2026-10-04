(() => {
'use strict';
    const APP_ID = "harry-vocabulary-to-learn-200-2";
    const STORAGE_KEY = "harry-vocabulary-to-learn-200-2-v1";
    const IS_LOCAL = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) || location.protocol === 'file:';
    const SESSION_SIZE = 10;
    const ORIGINAL_SESSION_COUNT = 20;
    const SESSION_COUNT = 23;
    // Original Round 1 misses, frozen October 4, 2026 in course order.
    const REVIEW_SESSION_IDS = [[515, 519, 520, 521, 526, 527, 531, 536, 539, 541, 545, 549, 550, 566, 567, 569, 570, 572, 575, 578, 579, 582, 583, 595, 602], [604, 605, 606, 607, 611, 612, 613, 618, 619, 621, 624, 628, 630, 632, 633, 635, 637, 639, 642, 647, 665, 670, 672, 676, 681], [683, 684, 686, 687, 688, 696, 704, 710, 716, 721, 723, 724, 726, 727, 728, 729, 730, 732, 734, 735, 736, 744, 745, 748]];
    const PROGRESS_VERSION = 4;
    let WORDS = [];
    let WORD_BY_ID = new Map();
    let onlineSync = null;

    const state = {
      phase: "loading",
      session: 1,
      round: 1,
      mastered: new Set(),
      questions: [],
      questionIndex: 0,
      answer: {},
      roundStartCount: 0,
      progress: { version: PROGRESS_VERSION, grouping: "10-words-per-day", activeSession: 1, sessions: {}, activity: [] }
    };

    const card = document.querySelector("#card");
    const sessionsEl = document.querySelector("#sessions");
    const roundsEl = document.querySelector("#rounds");
    const progressBar = document.querySelector("#progress-bar");
    const progressLabel = document.querySelector("#progress-label");
    const progressNumber = document.querySelector("#progress-number");
    const startTest = document.querySelector("#start-test");
    const recordContent = document.querySelector("#record-content");
    const toast = document.querySelector("#toast");

    function escapeHtml(value) {
      return String(value).replace(/[&<>'"]/g, function(character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
      });
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
    }

    function illustrationStyle(art) {
      if (!art) return "";
      if (art.file) {
        return "--picture-sheet:url('./illustrations/" + art.file +
          ".webp?v=1');--picture-x:50%;--picture-y:50%;--picture-size:cover;";
      }
      return "--picture-sheet:url('./illustrations/session-" + art.sheet +
        ".webp?v=1');--picture-x:" + art.x + "%;--picture-y:" + art.y + "%";
    }

    function shuffle(items) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temporary = copy[i];
        copy[i] = copy[j];
        copy[j] = temporary;
      }
      return copy;
    }

    function wordsForSession(number) {
      if (number > ORIGINAL_SESSION_COUNT) {
        return (REVIEW_SESSION_IDS[number - ORIGINAL_SESSION_COUNT - 1] || []).map(function(id) {
          return WORD_BY_ID.get(id);
        }).filter(Boolean);
      }
      const start = (number - 1) * SESSION_SIZE;
      return WORDS.slice(start, start + SESSION_SIZE);
    }

    function sessionLabel(number) {
      return number > ORIGINAL_SESSION_COUNT
        ? "Review " + (number - ORIGINAL_SESSION_COUNT) : "Day " + number;
    }

    function currentWords() {
      return wordsForSession(state.session);
    }

    function validMastered(number, ids) {
      const valid = new Set(wordsForSession(number).map(function(item) { return item.id; }));
      return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(function(id) { return valid.has(id); })));
    }

    function validSavedProgress(value) {
      return Boolean(value && value.version === PROGRESS_VERSION &&
        value.sessions && typeof value.sessions === "object" &&
        (value.activity == null || Array.isArray(value.activity)));
    }

    function earliestDate(values) {
      return values.filter(Boolean).sort(function(a, b) {
        return new Date(a).getTime() - new Date(b).getTime();
      })[0] || null;
    }

    function latestDate(values) {
      return values.filter(Boolean).sort(function(a, b) {
        return new Date(b).getTime() - new Date(a).getTime();
      })[0] || null;
    }

    function normalizeProgress(progress) {
      if (!validSavedProgress(progress)) {
        return { version: PROGRESS_VERSION, grouping: "10-words-per-day", activeSession: 1, sessions: {}, activity: [] };
      }
      return {
        version: PROGRESS_VERSION,
        grouping: "10-words-per-day",
        activeSession: Math.min(SESSION_COUNT, Math.max(1, Number(progress.activeSession) || 1)),
        sessions: progress.sessions,
        activity: Array.isArray(progress.activity) ? progress.activity : []
      };
    }

    function mergeProgress(local, remote) {
      const left = normalizeProgress(local), right = normalizeProgress(remote);
      const result = {version:PROGRESS_VERSION, grouping:'10-words-per-day', activeSession:left.activeSession, sessions:{}, activity:[]};
      const answers = new Map();
      [...left.activity, ...right.activity].sort((a,b) => String(a.answeredAt).localeCompare(String(b.answeredAt)) || String(a.id).localeCompare(String(b.id))).forEach(entry => {
        const key = entry.session + ':' + entry.round + ':' + entry.wordId;
        if (!answers.has(key)) answers.set(key, entry);
      });
      result.activity = [...answers.values()];
      for (const key of new Set([...Object.keys(left.sessions), ...Object.keys(right.sessions)])) {
        const a = left.sessions[key] || {}, b = right.sessions[key] || {};
        const newer = String(a.lastStudiedAt || '') >= String(b.lastStudiedAt || '') ? a : b;
        const stored = JSON.parse(JSON.stringify(newer));
        stored.rounds = {};
        for (const number of new Set([...Object.keys(a.rounds || {}), ...Object.keys(b.rounds || {})])) {
          const x = a.rounds?.[number], y = b.rounds?.[number];
          const first = !x ? y : !y ? x : x.startedAt <= y.startedAt ? x : y;
          const record = JSON.parse(JSON.stringify(first));
          record.answers = {};
          record.questions.forEach((question,index) => {
            const answer = answers.get(key + ':' + number + ':' + question.wordId);
            if (answer) {
              if (!question.options.includes(answer.selectedWordId)) {
                const other = question.options.findIndex(id => id !== question.wordId);
                question.options[other] = answer.selectedWordId;
              }
              record.answers[index] = answer.selectedWordId;
            }
          });
          record.finishedAt = Object.keys(record.answers).length === record.questions.length
            ? earliestDate([x?.finishedAt, y?.finishedAt]) : null;
          stored.rounds[number] = record;
        }
        stored.mastered = validMastered(Number(key), result.activity.filter(entry => String(entry.session) === key && entry.correct).map(entry => entry.wordId));
        stored.round = Math.max(1, ...Object.keys(stored.rounds).map(Number));
        const active = stored.rounds[stored.round];
        stored.startedAt = earliestDate([a.startedAt,b.startedAt]);
        stored.completed = stored.mastered.length === wordsForSession(Number(key)).length;
        stored.completedAt = stored.completed ? earliestDate([a.completedAt,b.completedAt]) : null;
        if (active) {
          stored.questions = active.finishedAt ? [] : active.questions;
          stored.answer = active.finishedAt ? {} : active.answers;
          stored.roundStartCount = wordsForSession(Number(key)).length - active.questions.length;
          stored.phase = stored.completed && active.finishedAt ? 'complete' : active.finishedAt ? 'round-summary' : 'test';
        }
        result.sessions[key] = stored;
      }
      return result;
    }

    function writeProgress() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress)); }
      catch (_) { toast.hidden = false; toast.textContent = 'This device could not save. Keep the page open until your answers are saved online.'; }
    }

    function save() {
      if (!WORDS.length) return;
      const savedAt = new Date().toISOString();
      const sessionKey = String(state.session);
      const previous = state.progress.sessions[sessionKey] || {};
      const completed = state.mastered.size === currentWords().length;
      state.progress.version = PROGRESS_VERSION;
      state.progress.grouping = "10-words-per-day";
      state.progress.activeSession = state.session;
      const rounds = Object.assign({}, previous.rounds || {});
      if (state.questions.length) {
        rounds[state.round] = {
          number:state.round,
          questions:state.questions,
          answers:Object.assign({}, state.answer),
          startedAt:rounds[state.round]?.startedAt || savedAt,
          finishedAt:rounds[state.round]?.finishedAt || null
        };
      }
      if (['round-summary','complete'].includes(state.phase) && rounds[state.round]) {
        rounds[state.round].finishedAt ||= savedAt;
      }
      state.progress.sessions[sessionKey] = {
        rounds: rounds,
        mastered: Array.from(state.mastered),
        round: state.round,
        phase: state.phase,
        questions: ["test", "review"].includes(state.phase) ? state.questions : [],
        answer: ["test", "review"].includes(state.phase) ? state.answer : {},
        roundStartCount: state.roundStartCount,
        completed: completed,
        startedAt: previous.startedAt || savedAt,
        lastStudiedAt: savedAt,
        completedAt: completed ? (previous.completedAt || savedAt) : null
      };
      try {
        const latest = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (validSavedProgress(latest)) {
          state.progress = mergeProgress(state.progress, latest);
          state.progress.activeSession = state.session;
          loadSession(state.session);
        }
      } catch (_) {}
      writeProgress();
      onlineSync?.push(state.progress);
    }

    function loadSession(number) {
      state.session = Math.min(SESSION_COUNT, Math.max(1, Number(number) || 1));
      const stored = state.progress.sessions[String(state.session)] || {};
      state.mastered = new Set(validMastered(state.session, stored.mastered));
      state.round = Math.max(1, Number(stored.round) || 1);
      state.phase = state.mastered.size === currentWords().length && (stored.phase === 'complete' || stored.rounds?.[state.round]?.finishedAt)
        ? "complete"
        : stored.phase === "round-summary"
          ? "round-summary"
          : "review";
      const sessionIds = new Set(currentWords().map(function(item) { return item.id; }));
      const savedQuestions = Array.isArray(stored.questions) ? stored.questions : [];
      state.questions = savedQuestions.length && savedQuestions.every(function(question) {
        return question && sessionIds.has(question.wordId) && Array.isArray(question.options) &&
          question.options.length === 4 && new Set(question.options).size === 4 &&
          question.options.includes(question.wordId) && question.options.every(function(id) { return sessionIds.has(id); });
      }) && new Set(savedQuestions.map(function(question) { return question.wordId; })).size === savedQuestions.length
        ? savedQuestions : [];
      state.questionIndex = 0;
      state.answer = {};
      state.questions.forEach(function(question, index) {
        if (stored.answer && Object.prototype.hasOwnProperty.call(stored.answer, String(index)) &&
            question.options.includes(stored.answer[index])) state.answer[index] = stored.answer[index];
      });
      if (stored.phase === "test" && state.questions.length) state.phase = "test";
      state.roundStartCount = (state.questions.length || state.phase === "round-summary")
        ? Math.min(state.mastered.size, Math.max(0, Number(stored.roundStartCount) || 0))
        : state.mastered.size;
    }

    function restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (validSavedProgress(saved)) {
          state.progress = normalizeProgress(saved);
          writeProgress();
        }
      } catch (_) {}
      loadSession(state.progress.activeSession || 1);
    }

    function sessionMasteredCount(number) {
      if (number === state.session) return state.mastered.size;
      const stored = state.progress.sessions[String(number)] || {};
      return validMastered(number, stored.mastered).length;
    }

    function totalMasteredCount() {
      let total = 0;
      for (let number = 1; number <= SESSION_COUNT; number += 1) total += sessionMasteredCount(number);
      return total;
    }

    function formatDateTime(value) {
      if (!value) return "No dated answers yet";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Date unavailable";
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }

    function wordIsMastered(wordId, sessionNumber) {
      if (sessionNumber === state.session) return state.mastered.has(wordId);
      const stored = state.progress.sessions[String(sessionNumber)] || {};
      return validMastered(sessionNumber, stored.mastered).includes(wordId);
    }

    function renderHistory() {
      const activity = Array.isArray(state.progress.activity) ? state.progress.activity : [];
      const correctCount = activity.filter(function(entry) { return entry.correct; }).length;
      const missedCount = activity.length - correctCount;
      const lastEntry = activity.length ? activity[activity.length - 1] : null;

      const stats =
        '<div class="record-stats">' +
        '<div class="record-stat"><span>Total answers</span><strong>' + activity.length + '</strong></div>' +
        '<div class="record-stat"><span>Correct</span><strong>' + correctCount + '</strong></div>' +
        '<div class="record-stat"><span>Missed</span><strong>' + missedCount + '</strong></div>' +
        '<div class="record-stat"><span>Last answer</span><strong><time>' +
        escapeHtml(lastEntry ? formatDateTime(lastEntry.answeredAt) : "Not started") +
        '</time></strong></div></div>';

      const sessionRows = [];
      for (let number = 1; number <= SESSION_COUNT; number += 1) {
        const stored = state.progress.sessions[String(number)] || {};
        const mastered = sessionMasteredCount(number);
        const sessionAnswers = activity.filter(function(entry) { return entry.session === number; });
        const latestAnswer = sessionAnswers.length ? sessionAnswers[sessionAnswers.length - 1].answeredAt : null;
        const datedStatus = mastered === wordsForSession(number).length && stored.completedAt
          ? "Completed " + formatDateTime(stored.completedAt)
          : latestAnswer
            ? "Last answer " + formatDateTime(latestAnswer)
            : "No test answers yet";
        sessionRows.push(
          '<div class="session-record"><strong>' + number + '</strong><p>' + sessionLabel(number) +
          '<small>' + escapeHtml(datedStatus) + '</small></p><span class="session-score">' +
          mastered + ' / ' + wordsForSession(number).length + '</span></div>'
        );
      }

      const roundGroups = new Map();
      activity.forEach(function(entry) {
        const session = Math.min(SESSION_COUNT, Math.max(1, Number(entry.session || entry.day) || 1));
        const round = Math.max(1, Number(entry.round) || 1);
        const key = session + ":" + round;
        const group = roundGroups.get(key) || {
          session: session,
          round: round,
          entries: [],
          lastAt: entry.answeredAt
        };
        group.entries.push(entry);
        group.lastAt = entry.answeredAt || group.lastAt;
        roundGroups.set(key, group);
      });

      const roundRows = Array.from(roundGroups.values()).sort(function(a, b) {
        return a.session - b.session || a.round - b.round;
      }).map(function(group) {
        const answeredWordIds = new Set();
        const missedWords = new Map();
        group.entries.forEach(function(entry) {
          answeredWordIds.add(entry.wordId);
          if (!entry.correct && !missedWords.has(entry.wordId)) {
            missedWords.set(entry.wordId, entry.word || "Saved missed word");
          }
        });
        const missCount = missedWords.size;
        const correctFirstTry = Math.max(0, answeredWordIds.size - missCount);
        const recordedRound = state.progress.sessions[group.session]?.rounds?.[group.round];
        const total = recordedRound?.questions?.length || answeredWordIds.size;
        const status = recordedRound?.finishedAt ? 'Finished' : 'In progress';
        const resultCopy = answeredWordIds.size + '/' + total + ' answered · ' + correctFirstTry + ' correct · ' + missCount + ' missed · ' + status;
        const misses = Array.from(missedWords.entries()).map(function(pair) {
          const masteredLabel = wordIsMastered(pair[0], group.session) ? " — mastered later" : " — still learning";
          return '<span class="round-miss-word">' + escapeHtml(pair[1]) + escapeHtml(masteredLabel) + '</span>';
        }).join("");
        return '<div class="round-record"><div class="round-record-head"><span class="round-record-number">' +
          group.round + '</span><div class="round-record-title"><strong>' + sessionLabel(group.session) + ' · Round ' +
          group.round + '</strong><small><time datetime="' + escapeHtml(group.lastAt || "") + '">' +
          escapeHtml(formatDateTime(group.lastAt)) + '</time></small></div><span class="round-record-score ' +
          (missCount ? "has-misses" : "") + '">' + resultCopy + '</span></div>' +
          (missCount
            ? '<div class="round-misses" aria-label="Words missed in Day ' + group.session + ', Round ' + group.round + '">' + misses + '</div>'
            : '<p class="round-perfect">No words missed in this round.</p>') + '</div>';
      }).join("");

      recordContent.innerHTML = stats +
        '<div class="record-section"><h3>Daily progress and dates</h3><div class="session-records">' +
        sessionRows.join("") + '</div></div>' +
        '<div class="record-section"><h3>Progress by day and round</h3><div class="round-history">' +
        (roundRows || '<p class="empty-record">Every answer saves immediately. Round 1, Round 2, and later rounds will appear separately here.</p>') +
        '</div></div>';
    }

    function renderSessionTabs() {
      const buttons = [];
      for (let number = 1; number <= SESSION_COUNT; number += 1) {
        const count = sessionMasteredCount(number);
        const classes = ["session-button"];
        if (count === wordsForSession(number).length) classes.push("complete");
        if (number === state.session) classes.push("active");
        buttons.push(
          '<button class="' + classes.join(" ") + '" data-session="' + number + '" type="button">' +
          '<span>' + sessionLabel(number) + '</span>' + (number > ORIGINAL_SESSION_COUNT ? '<small>Round 1 misses</small>' : '') + '<small>' + count + ' / ' + wordsForSession(number).length + '</small></button>'
        );
      }
      sessionsEl.innerHTML = buttons.join("");
    }

    function updateChrome() {
      const mastered = state.mastered.size;
      const total = currentWords().length;
      progressBar.style.width = ((mastered / total) * 100) + "%";
      progressNumber.textContent = mastered + " / " + total + " mastered";
      progressLabel.textContent = sessionLabel(state.session) + " progress";
      startTest.hidden = state.phase !== "review" || mastered === total;
      startTest.textContent = (state.questions.length ? "Continue round " : "Start round ") + state.round + " test";

      const steps = [{ label: "Review", status: state.phase === "review" ? "active" : "done" }];
      const visibleRounds = Math.max(state.round, state.phase === "review" ? 1 : 0);
      for (let number = 1; number <= visibleRounds; number += 1) {
        let status = "";
        if (state.phase === "complete" || number < state.round) status = "done";
        if ((state.phase === "test" || state.phase === "round-summary") && number === state.round) status = "active";
        steps.push({ label: "Round " + number, status: status });
      }
      roundsEl.innerHTML = steps.map(function(step) {
        return '<span class="step ' + step.status + '">' + step.label + '</span>';
      }).join("");
      renderSessionTabs();
    }

    function showToast(message) {
      toast.textContent = message;
      toast.hidden = false;
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(function() { toast.hidden = true; }, 2600);
    }

    function speak(word) {
      if (!("speechSynthesis" in window)) {
        showToast("Pronunciation is not available in this browser.");
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = "en-US";
      utterance.rate = .82;
      window.speechSynthesis.speak(utterance);
    }

    function renderReview() {
      const items = currentWords();
      const reviewItems = items.map(function(item, itemIndex) {
        return '<article class="review-item">' +
          '<div class="picture" role="img" aria-label="Picture clue for ' + escapeHtml(item.word) + '">' +
          '<span class="picture-art" aria-hidden="true" style="' + illustrationStyle(item.art) + '"></span></div>' +
          '<div class="review-item-copy"><div class="word-line">' +
          '<span class="review-number" aria-label="Word ' + (itemIndex + 1) + '">' + (itemIndex + 1) + '</span>' +
          '<h2>' + escapeHtml(item.word) + '</h2>' +
          '<button class="speak-button" data-speak="' + item.id + '" type="button" aria-label="Hear ' +
          escapeHtml(item.word) + ' pronounced" title="Hear pronunciation">🔊</button></div>' +
          '<p class="meaning"><strong>Meaning (' + escapeHtml(item.partOfSpeech) + '):</strong> ' +
          escapeHtml(item.meaning) + '</p>' +
          '<p class="example">“' + escapeHtml(item.example) + '”</p></div></article>';
      }).join("");
      card.innerHTML =
        '<div class="card-head"><p>' + sessionLabel(state.session) + ' · review all ' + items.length + ' words before the test</p>' +
        '<span class="counter">All ' + items.length + ' words</span></div>' +
        '<div class="review-all-body"><div class="review-grid">' + reviewItems + '</div></div>' +
        '<div class="card-actions review-actions"><button class="button" id="start-review-test" type="button">' +
        'Start round ' + state.round + '</button></div>';

      document.querySelectorAll("[data-speak]").forEach(function(button) {
        button.addEventListener("click", function() {
          const item = WORD_BY_ID.get(Number(button.dataset.speak));
          if (item) speak(item.word);
        });
      });
      document.querySelector("#start-review-test").addEventListener("click", beginRound);
    }

    function makeQuestion(wordId) {
      const distractors = shuffle(currentWords().map(function(item) { return item.id; }).filter(function(id) {
        return id !== wordId;
      })).slice(0, 3);
      return { wordId: wordId, options: shuffle([wordId].concat(distractors)) };
    }

    function beginRound() {
      if (state.questions.length && ["review", "test"].includes(state.phase)) {
        state.phase = "test";
        save();
        render();
        return;
      }
      const remaining = currentWords().filter(function(item) {
        return !state.mastered.has(item.id);
      }).map(function(item) { return item.id; });

      if (!remaining.length) {
        state.phase = "complete";
        save();
        render();
        return;
      }

      state.phase = "test";
      state.questions = shuffle(remaining).map(makeQuestion);
      state.questionIndex = 0;
      state.answer = {};
      state.roundStartCount = state.mastered.size;
      save();
      render();
    }

    function blankSentence(item) {
      return item.cloze.split('_____').map(escapeHtml).join('<span class="blank">_____</span>');
    }

    function choose(questionIndex, optionId) {
      const answerKey = String(questionIndex);
      if (Object.prototype.hasOwnProperty.call(state.answer, answerKey)) return;
      const question = state.questions[questionIndex];
      const answerWord = WORD_BY_ID.get(question.wordId);
      const selectedWord = WORD_BY_ID.get(optionId);
      const correct = optionId === question.wordId;
      state.answer[answerKey] = optionId;
      state.progress.activity.push({
        id: window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : Date.now() + "-" + Math.random().toString(16).slice(2),
        session: state.session,
        day: state.session,
        round: state.round,
        wordId: question.wordId,
        word: answerWord.word,
        selectedWordId: optionId,
        selectedWord: selectedWord.word,
        correct: correct,
        answeredAt: new Date().toISOString()
      });
      if (correct) state.mastered.add(question.wordId);
      save();
      const scrollTop = window.scrollY;
      render();
      window.scrollTo(0, scrollTop);
    }

    function finishTest() {
      if (Object.keys(state.answer).length !== state.questions.length) return;
      state.phase = state.mastered.size === currentWords().length ? "complete" : "round-summary";
      state.questions = [];
      state.answer = {};
      save();
      render();
    }

    function renderTest() {
      const answeredCount = Object.keys(state.answer).length;
      const questions = state.questions.map(function(question, questionIndex) {
        const item = WORD_BY_ID.get(question.wordId);
        const answerKey = String(questionIndex);
        const answered = Object.prototype.hasOwnProperty.call(state.answer, answerKey);
        const selectedId = state.answer[answerKey];
        const correct = selectedId === question.wordId;
        const choices = question.options.map(function(optionId, optionIndex) {
          const option = WORD_BY_ID.get(optionId);
          const isCorrect = answered && optionId === question.wordId;
          const isWrong = answered && optionId === selectedId && !correct;
          return '<button class="choice ' + (isCorrect ? "correct" : "") + ' ' + (isWrong ? "wrong" : "") +
            '" data-question="' + questionIndex + '" data-option="' + optionId + '" type="button"' +
            (answered ? " disabled" : "") + '><small>' + (optionIndex + 1) + '</small>' +
            escapeHtml(option.word) + '</button>';
        }).join("");
        return '<section class="test-question ' + (answered ? "answered" : "") + '" id="question-' + questionIndex + '">' +
          '<div class="test-question-head"><div><p class="prompt-label">Simple meaning</p><p class="test-meaning">' +
          escapeHtml(item.meaning) + '</p></div><span class="test-question-number">' + (questionIndex + 1) + '</span></div>' +
          '<p class="sentence">' + blankSentence(item) + '</p><div class="choices">' + choices + '</div>' +
          '<div class="feedback ' + (answered ? (correct ? "good" : "try") : "") + '" role="status">' +
          (answered ? (correct ? '✓ Correct — <strong>' + escapeHtml(item.word) + '</strong> is mastered.' :
            'Not yet. The answer is <strong>' + escapeHtml(item.word) + '</strong>. It will return next round.') : "") +
          '</div></section>';
      }).join("");

      card.innerHTML =
        '<div class="card-head"><p>' + sessionLabel(state.session) + ' · round ' + state.round + ' · all questions</p><span class="counter">' +
        answeredCount + ' of ' + state.questions.length + ' answered</span></div>' +
        '<div class="test-all-body"><div class="test-list">' + questions + '</div></div><div class="card-actions test-all-actions">' +
        '<button class="button secondary" id="review-again" type="button">Review words</button>' +
        '<button class="button" id="finish-test" type="button"' +
        (answeredCount === state.questions.length ? "" : " disabled") + '>Finish round</button></div>';

      document.querySelectorAll("[data-option]").forEach(function(button) {
        button.addEventListener("click", function() {
          choose(Number(button.dataset.question), Number(button.dataset.option));
        });
      });
      document.querySelector("#review-again").addEventListener("click", function() {
        state.phase = "review";
        render();
      });
      document.querySelector("#finish-test").addEventListener("click", finishTest);
    }

    function renderRoundSummary() {
      const newlyMastered = state.mastered.size - state.roundStartCount;
      const remaining = currentWords().length - state.mastered.size;
      card.innerHTML =
        '<div class="center-body"><div><div class="seal" aria-hidden="true">' + state.round + '</div>' +
        '<h2>Round ' + state.round + ' complete.</h2>' +
        '<div class="score-row"><span>' + newlyMastered + ' learned this round</span><span>' +
        state.mastered.size + ' of ' + currentWords().length + ' mastered</span></div>' +
        '<p>' + remaining + (remaining === 1 ? " word needs" : " words need") +
        ' another try. The next round includes only those words.</p>' +
        '<button class="button" id="next-round" type="button">Start round ' + (state.round + 1) +
        '</button></div></div>';
      document.querySelector("#next-round").addEventListener("click", function() {
        state.round += 1;
        state.questions = [];
        state.answer = {};
        beginRound();
      });
    }

    function renderComplete() {
      const allDone = Array.from({ length: SESSION_COUNT }, function(_, index) {
        return sessionMasteredCount(index + 1) === wordsForSession(index + 1).length;
      }).every(Boolean);
      const nextButton = state.session < SESSION_COUNT
        ? '<button class="button" id="next-session" type="button">Go to ' + sessionLabel(state.session + 1) + '</button>'
        : "";
      card.innerHTML =
        '<div class="center-body"><div><div class="seal" aria-hidden="true">✓</div>' +
        '<h2>' + (allDone ? "All 200 words mastered!" : sessionLabel(state.session) + " mastered!") + '</h2>' +
        '<p>You answered all ' + currentWords().length + ' words in this session correctly. ' +
        (allDone ? "All 20 learning days and 3 review sessions are finished." : "Choose another day or continue to the next one.") +
        '</p><div class="card-actions" style="border:0;justify-content:center;padding:0;">' +
        '<button class="button secondary" id="review-session" type="button">Review this session</button>' +
        nextButton + '</div></div></div>';

      document.querySelector("#review-session").addEventListener("click", function() {
        state.phase = "review";
        render();
      });
      const next = document.querySelector("#next-session");
      if (next) next.addEventListener("click", function() { changeSession(state.session + 1); });
    }

    function changeSession(number) {
      save();
      loadSession(number);
      save();
      render();
      window.scrollTo({ top: document.querySelector("#sessions").offsetTop - 16, behavior: "smooth" });
    }

    function render() {
      if (!WORDS.length) return;
      updateChrome();
      renderHistory();
      if (state.phase === "review") renderReview();
      else if (state.phase === "test") renderTest();
      else if (state.phase === "round-summary") renderRoundSummary();
      else renderComplete();
    }

    startTest.addEventListener("click", beginRound);

    sessionsEl.addEventListener("click", function(event) {
      const button = event.target.closest("[data-session]");
      if (button) changeSession(Number(button.dataset.session));
    });

    function validOnlineProgress(value) {
      return validSavedProgress(value);
    }

    function adoptOnlineProgress(remote) {
      const selected = Object.keys(state.progress.sessions).length ? state.session : remote.activeSession || state.session;
      state.progress = mergeProgress(state.progress, remote);
      state.progress.activeSession = selected;
      const comparable = Object.assign({}, remote, {activeSession:selected});
      const differs = JSON.stringify(state.progress) !== JSON.stringify(comparable);
      writeProgress();
      loadSession(selected);
      render();
      if (differs) onlineSync?.push(state.progress);
    }

    function connectOnlineSync() {
      if (IS_LOCAL || !window.MarcoOnlineSync) return;
      onlineSync = window.MarcoOnlineSync.create({
        appId: APP_ID,
        studentName: "Harry",
        validate: validOnlineProgress,
        score: function(progress) {
          const normalized = normalizeProgress(progress);
          return normalized.activity.length + Object.values(normalized.sessions).reduce((sum,session) => sum + Object.values(session.rounds || {}).filter(round => round.finishedAt).length, 0);
        },
        onRemote: adoptOnlineProgress
      });
      void onlineSync.start(state.progress);
    }

    async function initialize() {
      const response = await fetch("./words.json?v=1");
      if (!response.ok) throw new Error("The word list could not be loaded.");
      WORDS = (await response.json()).map(function(item) {
        return Object.assign({}, item, {art: {sheet:item.art.sheet, x:(item.art.index % 5)*25, y:Math.floor(item.art.index/5)*25}});
      });
      if (WORDS.length !== 200 || new Set(WORDS.map(item=>item.id)).size !== 200 || WORDS.some(item=>!item.partOfSpeech || !item.cloze.includes('_____'))) {
        throw new Error("The new word set is incomplete.");
      }
      WORD_BY_ID = new Map(WORDS.map(item=>[item.id,item]));
      if (IS_LOCAL) document.querySelector('.save-note').textContent = 'Preview · progress saves on this device';
      restore();
      render();
      connectOnlineSync();
      if (!IS_LOCAL) {
        const tracker = document.createElement('script');
        tracker.src = 'https://shangguanyun08.github.io/marco-learning-hub/shared-activity-tracker.js?v=1';
        tracker.dataset.appId = APP_ID;
        tracker.dataset.course = 'Daily Vocabulary 2';
        document.body.append(tracker);
      }
    }

    initialize().catch(function(error) {
      console.error(error);
      startTest.hidden = true;
      sessionsEl.hidden = true;
      roundsEl.hidden = true;
      card.innerHTML = '<div class="center-body"><div><div class="seal" aria-hidden="true">!</div>' +
        '<h2>Words could not load</h2><p>Please refresh the page and try again.</p>' +
        '</div></div>';
    });

})();
