# Which part of the wrapper, if any, changes how well an LLM reads a bundle?

Pre-registered protocol for `measure-format-eval.ts`. Frozen 2026-09-07, before
any API call was made and before any accuracy figure existed.

This is a **new pre-registration**, not an amendment. It reuses the sampling
frame of `repo-sample-2026-09-07.txt` and nothing else. The specific bundles, the
injected defects and the questions are all fixed by `--dry-run` before a single
paid request, and section 14 records exactly what was known when each constant
was set. A reviewer will ask; the answer is there.

Nothing in this file may be edited after an accuracy figure is seen. If the
design turns out to be wrong, the honest move is a second protocol with a new
date.

---

## 1. The question, and the one the earlier draft could not answer

FileConcat ships three output styles from `assembleOutput` in `@fileconcat/core`.
Every bundle also carries a header, a summary and a generated file tree.

**Measured, ours, 2026-09-07, 60 pre-registered public repositories, 0 failures:**
39,107 files walked, 73,763,190 bundle tokens. Bundle token percentiles: p10
39,088, p25 80,477, median 246,424, p75 1,366,894, p90 3,683,889, max 9,373,193.
The wrapper - tags, header, file tree - is a median 2.4% of the bundle, p75 4.4%,
max 17.8%.

**Measured, ours, 2026-08-31, five codebases, 248 files:** the token spread
between the three styles is 0.24% to 1.13%.

**The first draft of this study compared xml, markdown and plain and would have
been unable to answer the question it stated.** The 2.4% is the cost of having a
wrapper at all, against raw concatenation. All three of those conditions have a
wrapper; what separates them is 0.24% to 1.13%, roughly 590 to 2,800 tokens on a
246,424-token bundle. A three-way style ranking would have licensed a
cost-benefit claim that was never tested. That flaw is why the arms below are
what they are.

**The question this protocol answers.** Does any component of the wrapper - path
markers, delimiter richness, the file tree, the style of the delimiter - change
how well an LLM answers questions about the bundle, and is any measured change
worth its tokens?

## 2. Arms

Seven renderings of one mutated file set. Four are the study; three are controls.

| Arm | Rendering | Role |
| --- | --- | --- |
| `NC` | no bundle at all, question only | contamination control |
| `TR` | the file tree and header, no file contents | filename-leakage screen |
| `A0` | xml with every path stripped, no tree | manipulation check, must collapse |
| `A1` | one bare path line per file, no tree, no header | minimal |
| `A2` | markdown fences and headings, no tree, no header | |
| `A3` | `A2` plus the header and the generated file tree | |
| `A4` | xml tags, same header and tree | the product's default |

**Three contrasts, one factor changing in each:**

- `A2` vs `A1` - delimiter richness
- `A3` vs `A2` - the file tree
- `A4` vs `A3` - the style of the delimiter

`A3` and `A4` are byte-for-byte what `assembleOutput` ships. `A1` and `A2` are
counterfactuals built in the harness, because the product has no un-treed style,
and `A0` is a deliberate mutilation. **Only `A3` and `A4` are claims about the
product**; `A1` and `A2` exist to decompose what the wrapper is made of.

**`plain` is cut.** Its 0.24% token gap against markdown cannot pay for a cell.
The table above already holds seven, so `plain` would be the eighth, and on a
fixed budget an eighth cell widens every minimum detectable effect by about 7%.

## 3. The primary task is bug location on an injected defect

### 3.1 Why not file location

Every repository in the sampling frame is public and in every training corpus. A
question about the unmodified repository - "which file defines `parseConfig`" -
can be answered from memory without reading the context at all. That does not
add noise; it **biases every arm toward the same score**, compressing all effects
toward zero. Since a null is the likely outcome, and contamination is exactly
what invalidates a null, an uncontrolled design here is not worth running.

### 3.2 F-BUG, the primary family

For each bundle the harness injects 12 broken references. One injection:

1. Find an identifier `S` with a **real definition site in exactly one file `D`
   and nowhere else**, recognised by a definition keyword in front of it
   (`function`, `class`, `def`, `const`, `type`, `struct`, `fn`, `public`, and so
   on), referenced from at least one other file.
2. Pick as the reference side `R` the referencing file that mentions `S` least,
   so the rename rewrites as little of the bundle as possible.
3. Rename every occurrence of `S` in `D` **and in every referencing file except
   `R`** to `S_r<4 hex>`, a token that has never existed anywhere.
4. `R` now refers to `S`, and nothing in the bundle defines it.

The definition check is not decoration. Without it, "appears in two files" would
admit an imported library symbol defined in neither, renaming it would not make
it undefined, and the question's premise would be false.

The three distractors must pass the same definition test, or the question would
have two right answers and the graded one would be arbitrary. A bundle qualifies
only if it yields **12 F-BUG questions**, counted on their own: F-LOC backfills
whatever F-BUG does not supply, so a total of 20 can hide a bundle with almost no
injected defects in it, and the contamination fix would quietly evaporate.

The question names four identifiers - `S` plus three that stay both referenced
and defined - and asks:

> Exactly one of these four identifiers is referenced somewhere in this bundle
> but is not defined anywhere in it. The other three are both referenced and
> defined. [four names] Which file contains the reference to the identifier that
> is never defined?

Canonical answer: `R`'s path. Exact match.

**This is what makes memory useless.** In the real repository all four
identifiers are defined, so a model answering from recall has no signal at all.
Only reading the bundle distinguishes them. Contamination now costs the model
instead of flattering it. Naming four candidates rather than asking an open
question keeps the search bounded; asking for the **file** rather than the
identifier keeps the guessing floor near zero rather than at 25%.

### 3.3 F-LOC, the secondary stratum

"Which file in this bundle contains the following line?" over lines unique in the
whole raw file set. Eight per bundle. Kept for comparability with the published
table studies, and reported separately, never pooled with F-BUG.

### 3.4 Grading

Exact match on a path. Two grades are computed and **both are reported**:

- **raw** - the last non-empty line of the response, compared as-is
- **normalised** - after stripping one trailing `.`, then surrounding backticks
  and quotes, then collapsing whitespace

Reporting only exact match would score a formatting habit that an arm itself
taught the model. Reporting only the normalised figure would hide it. A gap
between the two that differs by arm is a finding, not a nuisance.

No LLM judge. The answer space is a file path.

## 4. How the questions are kept from rigging the result

Three ways question generation could hand an arm the win, and what stops each:

1. **Generating from a rendered bundle privileges that arm's vocabulary.** Every
   question here is generated from the **raw file set**. The harness never reads
   a rendered bundle to build a question.
2. **Uniqueness filters computed on rendered text differ per arm** - a path
   appears once in `A1` and three times in `A4`. Every filter runs format-blind,
   on raw files.
3. **Filename leakage** - `useAuth` living in `useAuth.ts` hands `A3` and `A4` a
   win on the tree alone. Two screens. The free one drops any question whose text
   contains the answer path's stem. The paid one is the **`TR` arm**: the same
   question against a tree-only context, run alongside every other arm, and every
   item it answers is dropped before any contrast is computed. Making it an arm
   rather than a separate pass means it is priced, ordered and cached like
   everything else, and the drop happens in the analysis where it is visible.

Also fixed here: **no line numbers appear in any question**, because no arm
carries them and asking would measure newline counting rather than the wrapper.

## 5. Power, on the effective sample size

### 5.1 Clustering, which is what actually sets the sample size

Questions drawn from the same bundle are not independent: one hard repository
makes all twenty of its questions hard. At 20 questions per bundle and an
intra-cluster correlation of 0.05 the design effect is

```
DE = 1 + (m - 1) * ICC = 1 + 19 * 0.05 = 1.95
```

so the effective n is the question count divided by 1.95. **Sizing on the raw
count would overstate precision by sqrt(1.95) = 1.40.** Many bundles with few
questions each is strictly better than the reverse; 20 per bundle is the
compromise the cache TTL in section 10.2 forces.

### 5.2 The numbers

Sizing by McNemar per contrast on the effective n: `psi = 0.15`, `alpha = 0.0167`
(Bonferroni over the three contrasts), power 0.80.

```
questions   effective n   MDE
100         51            17.0 pts
300         154           10.0 pts
600         308            7.1 pts
1000        513            5.5 pts
2000       1026            3.9 pts
```

Re-derive with `pnpm --filter @fileconcat/cli format-eval --power`, which takes
`--n <a,b>` for any other count. No number in this section is arithmetic done by
hand. **Every one of them is conditional on the pilot**, which measures `psi` and
the ICC instead of assuming them.

### 5.3 Equivalence, because a failure to reject is not equivalence

Equivalence is the likely real finding, and a null p-value cannot state it. Every
contrast is therefore tested by **TOST against a pre-registered margin of 5
accuracy points**, reported as a 90% interval that must sit entirely inside
[-5, +5].

**Why 5 points.** Below a 5-point difference the product decision does not
change: at that size you pick the style on readability either way, and the token
difference between the styles (0.24% to 1.13%) is far too small to break the tie.
Resolving 5 points needs about 1,220 questions after clustering; resolving 2
points needs about 7,651. A 2-point margin is not affordable and would not change
what we ship.

### 5.4 One deliberate deviation from the stated analysis

The stated primary analysis is a logistic mixed model,
`correct ~ arm + band + (1|item) + (1|bundle)`. The harness instead uses a
**bundle-level cluster bootstrap**: resample whole bundles with replacement,
recompute the paired difference, take the 5th and 95th percentiles.

It makes the same clustering correction, carries the within-bundle dependence
exactly, assumes no distribution, needs no model-fitting code in TypeScript, and
yields the TOST interval directly. McNemar per contrast is reported alongside it
for comparability with the sizing above, and the **observed ICC is reported per
arm**, so the design effect is measured rather than assumed.

## 6. Position is a control, not a headline

Bands are five equal **character** fractions of the answer's location in content
space, with no wrapper counted. Character rather than token fractions because
tokenizers differ across models; content space rather than bundle space because
the arms wrap differently, so the same answer sits at a different offset in each
rendering and a bundle-space band would be a function of the arm.

"Lost in the Middle" was measured at a few thousand tokens on 2023 models and may
not replicate at 246K. **The band is a covariate and a reported control. The
study's framing does not rest on the position effect reproducing.**

## 7. Bundles

### 7.1 The rule

Drawn from `repo-sample-2026-09-07.txt` in its own file order: each language
keeps a queue of its `small` then `medium` cell (or `large` then `medium` for the
S2 size band), primaries before reserves. Selection round-robins over the ten
languages so every language is drawn once before any is drawn twice.

A bundle qualifies when it clones, its `A4` rendering lands inside the size band,
and it yields at least 20 questions after both leakage screens.

### 7.2 Two context sizes

| Band | `A4` tokens | Models |
| --- | --- | --- |
| S1 | 40,000 - 160,000 | `claude-sonnet-5`, `claude-haiku-4-5-20251001` |
| S2 | 200,000 - 320,000 | `claude-sonnet-5` only |

S2 is frontier-only because it exceeds the small model's 200,000-token window.
Our median bundle is 246,424 tokens and does not fit it at all. That is a fact
about context windows read from `models.json`, not a design choice.

**Write this into every claim, because it is the study's sharpest limitation.**
The largest size both models accept is bounded by 200,000 minus the instruction,
the question and the output allowance, which is why S1 stops at 160,000. The
pilot's five bundles came out at **40,522 to 99,326 A4 tokens, a median of 62,678
- roughly a quarter of the 246,424-token bundle the study is meant to speak
for.** A result measured there does not automatically hold at 246K: if the
wrapper earns its tokens anywhere, the long-context end is where it should, and
that is the end the pilot cannot see. The pilot's job is `psi`, the ICC and the
accuracy band, not the headline. Any claim from the pilot alone is scoped to
"bundles of 40K to 100K tokens on Claude models", and the S2 band exists to reach
past it on the frontier model only.

### 7.3 Delimiter-collision stratification

The one place a causal effect plausibly lives is where a bundle's own content
collides with an arm's delimiter: markdown-heavy repositories against `A2` and
`A3`, JSX and XML-heavy ones against `A4`. The harness records, per bundle, the
share of content characters in `.md`/`.mdx` files and in `.jsx`/`.tsx`/`.html`/
`.xml`/`.vue`/`.svelte` files, and both are pre-registered as a reported subgroup
cut and a covariate.

### 7.4 What this inherits

All three biases named in `repo-sample-2026-09-07.txt` carry over: the 5000-star
ceiling makes every entry a well-known project; the language label is GitHub's
primary language; two entries are documentation collections. Two new filters are
added on top - the size band, and the requirement that a bundle yield 20
questions, which favours repositories with identifiers shared across exactly two
files.

Only files the product decodes as text are bundled; anything needing document
extraction is excluded and counted per bundle.

## 8. Models and prompt

### 8.1 Pinned ids

| Role | Model | Context | Input $/MTok | Output $/MTok |
| --- | --- | ---: | ---: | ---: |
| frontier | `claude-sonnet-5` | 1,000,000 | 2.00 | 10.00 |
| small | `claude-haiku-4-5-20251001` | 200,000 | 1.00 | 5.00 |

**The context limits are read, not assumed.** They come from
`apps/web/src/data/models.json`, the 310-model table this repository regenerates
every build, snapshot 2026-09-07: `anthropic/claude-sonnet-5` at 1,000,000 and
`anthropic/claude-haiku-4-5-20251001` at 200,000. The per-token prices above are
the first-party API rates; models.json carries blended third-party figures and is
used here only for the window check.

Exact ids, pinned. **Every arm for a given bundle runs back to back**, and the
served id from `response.model` is recorded next to every row. A silent model
update landing partway through would hit some arms and not others, and no
analysis removes that afterwards.

### 8.2 Sampling: the requested setting is not available

The brief asks for k=1 at temperature 0. **`temperature` is removed on
`claude-sonnet-5` and returns a 400.** Only the small model can be pinned to 0.
There is no frontier model in this family that accepts it.

So: `claude-haiku-4-5-20251001` runs at `temperature: 0`; `claude-sonnet-5` runs
adaptive thinking at `effort: "low"` with no sampling parameter.

**The pilot therefore runs k=3 on both models**, so per-item variance is measured
rather than assumed away. Whether k=1 is safe afterwards is a pilot output, not a
protocol assumption. Under k=1 the repeat variance is unmeasurable and folds into
the error term; `psi` itself stays measurable either way, because it is counted
from the discordant pairs between arms on the same item, not from repeats.

### 8.3 Prompt shape, fixed across arms

Instruction first, then the bundle as a cached system block, then the question as
the user turn. **Bundle first, question last, in every arm.** The instruction is
one frozen string, byte-identical everywhere, and names no format: an instruction
saying "files are wrapped in `<file>` tags" would hand the result to `A4` before
a single question was asked. Every claim from this study is scoped to that
ordering.

## 9. Controls that decide whether the run counts

### 9.1 `NC`, the contamination control

The question with no bundle at all. Nearly free, because there is no context to
pay for. Any item answered correctly here is answerable from memory; those items
are **dropped and the contrasts recomputed**, and the drop rate is reported.
If the `NC` rate exceeds 15%, the question generator is the problem and the run
is reported as contaminated.

### 9.2 `A0`, the manipulation check, marked must-move

`A4` with every path attribute stripped and the tree removed. "Which file"
questions then have no answer available in the bundle, so **accuracy must
collapse**. Threshold fixed here: `A4` minus `A0` must exceed 20 points.

**If `A0` does not move, the run is void and we say so.** A null from a pipeline
that has never been shown to detect anything is not publishable. `A0` doubles as
a second contamination detector: a model still answering correctly with no paths
present is recalling the repository.

## 10. Cost and run order

### 10.1 Rates

Cache write at the 5-minute TTL is 1.25x the base input rate; cache read is 0.1x.

| Model | input | cache write 5m | cache read | output |
| --- | ---: | ---: | ---: | ---: |
| `claude-sonnet-5` | 2.00 | 2.50 | 0.20 | 10.00 |
| `claude-haiku-4-5-20251001` | 1.00 | 1.25 | 0.10 | 5.00 |

### 10.2 Run order, which is the likeliest budget overrun

**The unit of work is a block: one (model, bundle, arm) triple, all of its calls
bursted back to back.** The run is **bundle-major**: for one bundle, every arm
and every model, then the next bundle.

- One cache write per block. A cache read refreshes the entry's timer for free
  and the lifetime runs from the start of the reading request, so consecutive
  calls seconds apart keep the entry warm without the 1-hour TTL's doubled write.
- The first call of a block runs alone so exactly one write is paid; the rest run
  at concurrency 8 against the entry it created.
- **An arm-major loop would multiply cache writes by the questions per bundle**
  and silently multiply the bill. `--dry-run` prints the implied cache-write
  count for the chosen ordering, not just token totals. That number is the one
  most likely to be wrong, so it is printed rather than assumed.
- The results file is rewritten after every block. A run that dies two hours in
  has still bought everything before that point. A request that fails after the
  SDK's retries records an error row with its reason and grades as wrong.

### 10.3 The three configurations

| Config | Bundles S1 / S2 | k | `A0` on |
| --- | --- | ---: | --- |
| pilot | 5 / 0 | 3 | every bundle |
| interim | 22 / 8 | 1 | 20% of bundles |
| full | 70 / 30 | 1 | 20% of bundles |

**No configuration carries a cost figure of its own here.** `BUDGET_CAP_USD` in
the harness is one approval, 500 USD, applied to all three, and `--live` refuses
to start unless `--approved-usd` reaches the projection that `--dry-run` printed.
The projection is the number to quote; this file does not hold one.

**Those bundle counts are ceilings, not promises, and the `full` one is not
reachable from this frame.** The frozen sample holds 180 URLs and only a fraction
render inside either band and then yield 12 injectable defects. Measured on
2026-09-07 over the S1 walk, **24 bundles qualified out of 78 candidates, a rate
of 31%**. The S1 pool is 120 URLs, so the frame supports roughly 37 S1 bundles
against the 70 the `full` config asks for. The dry run prints the achieved count,
the achieved item count and the MDE that count actually buys; **those are the
numbers reported alongside any result**, never the ceiling.

The consequence is stated here rather than discovered later. At about 37 bundles
and 20 questions each the MDE is near 6.4 points, which is **above the 5-point
equivalence margin**: the study at that size could not declare equivalence even
if the arms were identical. Two levers, and `--power` prints the whole grid:

| bundles | m=20 | m=40 | m=60 | m=100 |
| ---: | --- | --- | --- | --- |
| 38 | 6.3 pts | 5.5 pts | 5.2 pts | 4.9 pts |
| 60 | 5.0 pts | 4.4 pts | 4.1 pts | 3.9 pts |
| 100 | 3.9 pts | 3.4 pts | 3.2 pts | 3.1 pts |

Raising questions per bundle fights itself, because it raises the design effect
at the same time: going from 20 to 100 questions per bundle multiplies the bill
by five and buys 1.4 points. **Extending the sampling frame beyond the frozen 60
repositories is the cheaper lever**, and it needs its own pre-registration
because a second frame is a second sample. That decision is not made here.

**The pilot runs first and nothing else starts without it.** Its job is to
measure `psi` and the ICC for real rather than assume them, and to check that the
task lands in the **40% to 80% accuracy band**. Outside that band the run is not
informative: above it there is no room for a 5-point difference, below it the
task is measuring something other than reading.

`A0` is a full-price cell, so it runs on every bundle in the cheap pilot and on a
fifth of bundles afterwards. `NC` carries no bundle and `TR` carries only a tree,
so both cost almost nothing and run everywhere.

The interim look stops the study early if any contrast clears 10 points.

### 10.4 The published cost figure is the billed one

`--dry-run` tokenizes with `@dqbd/tiktoken` and the product's encoding, which is
**not Claude's tokenizer**. It sizes the budget and is not publishable. The live
run records `usage.input_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens` and `output_tokens` per request, and every published
cost comes from those.

## 11. What gets reported, and what does not

### 11.1 Always

Per arm: raw accuracy, normalised accuracy, ungradable rate, observed ICC, billed
cost. Per contrast: the cluster-bootstrapped difference with its 90% interval,
the McNemar p-value, and the TOST verdict. Plus the `NC`, `TR` and `A0` controls,
the count of items they dropped, the position bands as a control, and the family
split.

### 11.2 Cost per correct answer, only on a significant contrast

Cost per correct answer is a monotone transform of accuracy at a fixed token
cost. **After a null it is reading noise**, so the harness prints it only when at
least one contrast clears significance, and prints why not otherwise.

### 11.3 The honest null, written before it happens

If it lands, the result reads:

> Across the run, no wrapper component moved accuracy by more than 5 points on
> bug-location or file-location tasks for either model. Since the components
> together cost a median 2.4% of bundle tokens, the wrapper is a readability
> choice rather than a performance one at this context length.

That is a publishable result and it is the likely one. It is written down now so
that finding it cannot be reframed later, and so that nobody reaches for cost per
correct answer to manufacture a difference out of a null.

## 12. Stated biases and limitations

- **L1. No result describes the small model at our median bundle size.** Our
  median is 246,424 tokens and the small model's window is 200,000.
- **L2. Two models is two points, not a curve.**
- **L3. The models are not sampling-matched.** One accepts `temperature: 0` and
  one rejects the parameter entirely (section 8.2).
- **L4. Both models come from one provider, and this design cannot remove it.** A
  format's score confounds how much structure the wrapper carries with how
  familiar that structure is to the model reading it. XML-tagged context is
  heavily represented in what these models were trained and prompted on, so an
  `A4` win is partly a measurement of the provider's training distribution.
  FileConcat's users paste bundles into many models. **Nothing in a
  single-provider design licenses a claim about all of them**; every result is
  stated "on Claude models", never "for LLMs". Widening to a second provider is
  the first thing a follow-up should do.
- **L5. The task families are retrieval and defect location, not comprehension.**
  A model that can locate a dangling reference may still reason worse over a
  bundle in one arm than another, and this design would not see it.
- **L6. `A1` and `A2` are not products.** They decompose the wrapper; they are not
  styles anyone ships.
- **L7. The injection is one defect class.** Broken references after a rename.
  Other defect classes may behave differently.
- **L8. Everything in section 7.4 is inherited**, plus the size band and the
  20-question requirement.
- **L9. Prices and model behaviour are dated 2026-09-07.** A rerun against a
  different snapshot is a different experiment.
- **L10. Some constants were set by a feasibility run**, not chosen a priori.
  Section 14 says which, and what was visible when.
- **L11. The frozen sample cannot supply the `full` configuration.** It qualifies
  about 31% of S1 candidates, so roughly 37 bundles against the 70 requested, and
  the study at that size resolves about 6.4 points while its own equivalence
  margin is 5. Section 10.3 has the grid. Any equivalence claim needs either a
  larger frame or five times the questions per bundle, and neither is decided in
  this file. **The pilot is unaffected**: it needs 5 bundles and got them.

## 13. Reproduction

```
# power table, no clones, no network
pnpm --filter @fileconcat/cli format-eval --power

# select bundles, inject defects, generate questions, tokenize every prompt,
# price all three configs. Clones; makes no API call.
pnpm --filter @fileconcat/cli format-eval --dry-run \
  --repos scripts/repo-sample-2026-09-07.txt

# the pilot. Refuses to start without --approved-usd at or above the projection.
pnpm --filter @fileconcat/cli format-eval --live --config pilot \
  --repos scripts/repo-sample-2026-09-07.txt --approved-usd <n>

# every published figure, from the results file
pnpm --filter @fileconcat/cli format-eval --analyze <results.json>
```

Seeded (`SEED = 20260907`), so the same sample file and the same commits produce
the same injections and the same questions on any machine.

## 14. Design history, so the freeze means something

A pre-registration is worth nothing if it was quietly tuned against results. In
order, on 2026-09-07:

1. An earlier three-arm draft (xml / markdown / plain) was written and its dry
   run executed. **It made no API call**, so no accuracy figure existed then and
   none exists now.
2. That dry run showed the three styles sitting within 0.49% of each other on
   cost, which exposed the flaw in section 1: the design could not test the 2.4%
   claim it was built on. An adversarial review reached the same conclusion
   independently and added contamination, positive control, equivalence,
   clustering and ceiling as further defects.
3. The whole design was replaced with the arms in section 2 and the injected-bug
   task in section 3. This is a new pre-registration, not an amendment.
4. Two feasibility facts from the earlier dry run carried over, both properties of
   the corpus and not of any model's answers: repositories cluster far from the
   246,424-token median, and question pools starve if line-eligibility floors are
   set too high.
5. **The injection rule was widened once, on measured yield.** A first version
   required `S` to live in exactly two files. Over 54 repositories that starved
   the primary family: most in-band bundles produced 2 to 7 injectable defects
   against the 12 needed, and only 8 of 54 candidates qualified. Renaming the
   other referencing sites as well keeps the answer unique - which is the only
   property the question needs - and raised the qualification rate from 5 in 26
   to 5 in 12 on the same walk order. **No model was asked anything at any point
   in this**; the measurement is entirely a property of how identifiers are
   distributed across files in the corpus.
6. Three bugs were found and fixed along the way. A symlink pointing at a
   directory threw `EISDIR` and cost the whole repository; it now costs that one
   file. The cost model priced the tree-only screen as a cache hit when its
   prefix falls under a model's minimum cacheable size, where a `cache_control`
   marker is silently ignored. And bundle qualification counted total questions
   rather than F-BUG questions, so a bundle with almost no injected defects could
   pass while the contamination fix quietly evaporated.

On 2026-09-09, still before any API call and with no accuracy figure in
existence, three sentences were corrected for saying something the harness does
not do. Section 2 called `plain` a seventh cell when the arm table already holds
seven, and priced it at 1.75x, a multiplier nothing in the harness reproduces;
the cut now rests only on the MDE widening, which the fixed budget does give.
Section 10.3 carried a per-config cap column of 500 / 1,600 / 5,100 when
`BUDGET_CAP_USD` sets one figure for all three, and against the reachable frame
none of the three reaches it. **No arm, contrast, threshold or sample size
changed**, and section 5.2's power numbers are untouched.

Everything in sections 2 through 11 was written blind and stays blind. After the
pilot reports `psi`, the ICC and the accuracy band, this file does not change;
the pilot's numbers go in a separate results document.
