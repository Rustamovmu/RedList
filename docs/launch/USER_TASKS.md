# User testing script (PLAN §11)

**Goal:** see whether real people can do the five things R1 promises (PLAN §11): find a species, understand its population estimate, see where it lives, compare it with another species, and open a credible support link.
**Testers:** 3–5 people from the main audience (curious learners and students; PLAN §1). Not people who built the site.
**Length:** about 30 minutes per tester.
**Results:** recorded only from what testers actually did and said. **The coding agent never fills these in,** and no result may be guessed or summarized from fewer sessions than were run.

## Before the sessions (facilitator)
1. **Site:** the real catalogue, running locally (`npm run dev` in both repos) or on a private preview. Write down which one and the commit of each repo.
2. **Precondition for task 5:** at least one reviewed support link must be published. **The local catalogue has none today.** An owner must add a real organization and link through `/admin/support`, after checking the organization against the criteria on `/support`. Until then, skip task 5 and record "not run: no support links".
3. **Geography for task 3:** only one real species, the hawksbill sea turtle, has country rows today (3 countries, from its cited source). The other 42 show no countries. Task 3 therefore uses the hawksbill. If more species get sourced country lists before testing, any of them can be used instead.
4. **Clean browser:** a private window, with nothing in compare (the compare picks are kept in localStorage).
5. **Consent:** read the consent script below and get a yes before starting.
6. **Privacy:**
   - Record no names, emails or screen recordings unless the tester agrees in writing.
   - Use tester codes **T1–T5**.
   - Keep notes about behaviour, not about the person.

### Consent script (read aloud)
> We're testing a website about threatened species, not you. There are no wrong answers. If something is confusing, that's the site's fault and it's exactly what we want to learn. Please think aloud as you go. You can stop at any time. I'll take notes but won't record your name. Is that OK?

### Facilitator rules
- Read each task exactly as written. Do not point, hint or name buttons.
- If the tester asks "is this right?", reply "What would you expect?" and note it.
- Stop a task after **5 minutes**, or when the tester gives up. Record it as "not completed".
- Note where they went (page by page), what they said, and where they hesitated.

## The tasks
Give the tester one task at a time, on a card or read aloud. The species are suggestions from the real catalogue. Swap in another published species with population figures if a tester already knows these.

| # | PLAN §11 outcome | Task as read to the tester | Done when | Follow-up question |
|---|---|---|---|---|
| 1 | Find a species | "You heard about an animal called the **red panda**. Find what this site says about it." | The red panda profile is open | "How did you decide where to look?" |
| 2 | Understand its population estimate | "How many red pandas are thought to be left in the wild? How sure is that number, and what exactly does it count?" | The tester states the figure or range, **and** what it counts (for example mature individuals), **and** the year or the uncertainty, from the page | "Is that the number of all red pandas, or something else?" (Note whether they noticed the basis and the date.) |
| 3 | See where it lives | "Now look up the **hawksbill sea turtle**. Which countries is it found in, according to this site? Can you see that on a map?" | The tester names at least two countries listed on the profile, or finds them on the map, **and** says whether the map shows whole countries or a range | "What does the coloured area on the map mean?" |
| 4 | Compare with another species | "Compare the red panda with the **giant panda** and one more animal of your choice. Which is more threatened? Can you compare their populations?" | Three species are open in Compare, the tester reads both statuses correctly, and says whether the populations can be compared | "Did anything on this page seem not comparable? Why?" |
| 5 | Open a credible support link | "Suppose you wanted to help one of these animals. Find a way to do that, and tell me who you'd be sending your help to before you click." | The tester names the organization and destination website, **then** opens the link | "Why do you trust, or not trust, this link?" |

### After the tasks (2 minutes)
1. "What was the most confusing moment?"
2. "Was anything on the site hard to believe, or missing a source?"
3. "On a scale of 1 (very hard) to 5 (very easy), how easy was the site to use overall?"

## Results template (one copy per tester)
Tester code: ___ · Date: ______ · Device and browser: ______ · Site (local / preview) and commits: ______ · Facilitator: ______

| Task | Completed? (yes / with help / no / not run) | Time (min:s) | Path taken (pages) | What they said or did (quotes and observations) | Problem seen | Severity (blocker / serious / minor) |
|---|---|---|---|---|---|---|
| 1 Find | | | | | | |
| 2 Population | | | | | | |
| 3 Where | | | | | | |
| 4 Compare | | | | | | |
| 5 Support link | | | | | | |

Follow-up answers: most confusing ______ · trust or sources ______ · ease (1–5) ______

## Summary across testers (fill in only after all sessions)
Sessions actually run: ___ (record the real number, even if it is fewer than 3).

| Task | Completed without help (n of N) | Recurring problems (seen by 2 or more testers) | Proposed fix |
|---|---|---|---|
| 1 Find | | | |
| 2 Population | | | |
| 3 Where | | | |
| 4 Compare | | | |
| 5 Support link | | | |

**When done:**
- Log the date and number of sessions in `docs/COMPLETED_TASKS.md`.
- File a fix for each recurring blocker or serious problem.
- Proposed new features go to `docs/BACKLOG.md` unless they are R1 scope.
