# Harry Vocabulary 1500

A focused study list built from Harry's original list and the extracted video vocabulary.

- **Live website:** https://shangguanyun08.github.io/harry-vocabulary-1500/
- **Harry’s Daily Vocabulary 1 (original 200 words and six reviews):** https://shangguanyun08.github.io/harry-vocabulary-1500/learn/
- **Harry’s Daily Vocabulary (current tests):** https://shangguanyun08.github.io/harry-vocabulary-1500/review/
- **Harry’s Daily Vocabulary 2 archive (400 To learn words and three reviews):** https://shangguanyun08.github.io/harry-vocabulary-1500/learn-2/archive.html
- Exactly 1,500 unique study entries
- 481 familiar Grade 2–3 words removed across the full list
- Sorted from easiest to hardest
- Short English meanings and simple sentence examples
- Estimated grade level in the last column

The published static site is stored in `docs/`.

Vocabulary 2 freezes the next 200 unique headwords from the saved To learn list on September 13, 2026, in easy-to-hard order. Known headwords, all Vocabulary 1 headwords, and punctuation-only duplicates were excluded. Original IDs and wording remain traceable through `sourceWord` and `selection.json`; incomplete meanings and sentence forms are corrected in this course only.

The new course keeps 20 days of 10 illustrated words, pronunciation, all questions on one page, and missed-word rounds until mastery. Each partial and finished round retains its question order, answers, timestamps, and original misses. Its separate online identity is `harry-vocabulary-to-learn-200-2`; Vocabulary 1 and the source list keep their existing records. Local previews never sync answers or activity.

Run `node --test tests/*.test.cjs` from this checkout with Node.js. The archive and review tests have no external dependencies.

October 4 extension: after Review 1–3 (25, 25, 24 original first-round misses), Days 24–43 introduce the next 200 unstudied To learn entries, 10 per day. The extension skips currently known entries, both earlier 200-word selections, and repeated own/advantage/best phrases. Each new entry retains its source ID and original headword, has a simple meaning and sentence blank, and uses a panel in illustration sheets 9–16 or the individual dangerous illustration. `selection-next-200.json` records the source snapshot and ordering. Original session IDs, word data, progress version, and online identity are preserved.

October 12 review course: `docs/review/` keeps the Harry’s Daily Vocabulary title and combines 29 original Round 1 misses from tested extension Days 25–31, 74 words from the three Learn 2 reviews, and 87 unique words from the six Learn 1 reviews (83 recorded misses and four challenge words), in that order. The 190 unique words appear once: twelve 15-word sessions and a final 10-word session. Sessions and retries open directly to an illustrated sentence-completion test. Each attempt tests the whole session and locks first answers. At least 13/15 on one finished attempt unlocks the next session; the final session uses 9/10. Scores never accumulate between attempts. Answers, original misses, and timestamps are kept under a separate online identity, `harry-daily-vocabulary-review-2026-10`. Untested extension days are excluded. The Learn 1 and Learn 2 archives only GET their saved records.

The former Learn 2 entry point, `learn-2/`, now redirects to `review/`. Its read-only course is retained at `learn-2/archive.html`, sharing the original assets and progress identity so saved records remain available. The current course links directly to that archive.

Validate the new review course and archive behavior with `node --test tests/*.test.cjs`. The archive tests verify that online records can be read, while answer recording and upload remain disabled.

### October 23 continuation

Archived Learn 2 Days 32–43 (120 previously unstudied words) now continue in `docs/review/` as Sessions 14–21, 15 words each. The original Sessions 1–13, their word IDs, course/pool identity, and saved answer history remain unchanged. The total is 310 unique words across 21 sessions.
