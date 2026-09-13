# Harry Vocabulary 1500

A focused study list built from Harry's original list and the extracted video vocabulary.

- **Live website:** https://shangguanyun08.github.io/harry-vocabulary-1500/
- **Harry’s Daily Vocabulary 1 (original 200 words and six reviews):** https://shangguanyun08.github.io/harry-vocabulary-1500/learn/
- **Harry’s Daily Vocabulary 2 (next 200 To learn words):** https://shangguanyun08.github.io/harry-vocabulary-1500/learn-2/
- Exactly 1,500 unique study entries
- 481 familiar Grade 2–3 words removed across the full list
- Sorted from easiest to hardest
- Short English meanings and simple sentence examples
- Estimated grade level in the last column

The published static site is stored in `docs/`.

Vocabulary 2 freezes the next 200 unique headwords from the saved To learn list on September 13, 2026, in easy-to-hard order. Known headwords, all Vocabulary 1 headwords, and punctuation-only duplicates were excluded. Original IDs and wording remain traceable through `sourceWord` and `selection.json`; incomplete meanings and sentence forms are corrected in this course only.

The new course keeps 20 days of 10 illustrated words, pronunciation, all questions on one page, and missed-word rounds until mastery. Each partial and finished round retains its question order, answers, timestamps, and original misses. Its separate online identity is `harry-vocabulary-to-learn-200-2`; Vocabulary 1 and the source list keep their existing records. Local previews never sync answers or activity.

Run `node --test tests/learn-2.test.cjs` from this checkout with the sibling learning hub’s existing Harry math jsdom dependency installed.
