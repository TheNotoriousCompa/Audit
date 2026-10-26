# Genre detection — Assessment plan

Status: **plan only** (no rule changes in this document). Mini player work is
explicitly deferred (backlog at the bottom).

## 1. Goal

Decide, with measured evidence, whether the smart-genre cascade is:

1. **Applying the rules it claims** (per-rule fire counts, not just coverage).
2. **Correct** where it applies (precision on a labelled sample).
3. **Useful in the UI** (chips visible, tiles meaningful, cache fresh).

Out of scope for this assessment: audio-feature classification (Level 2) and
mini-player behaviour.

## 2. Baseline (measured on the real library, 1394 tracks)

Post Session A (seed keys normalized, `genre_rule` instrumented):

| Metric | Value |
|---|---|
| Tracks with a genre guess | 1076 (77.2%) |
| Source `artist_seed` | 488 |
| Source `folder` | 373 |
| Source `tag` | 177 (0 unmappable) |
| Source `filename` | 38 |
| Source `artist` (vote) | 0 |
| Tracks still unknown | 318 |

Full report: `docs/genre-audit-2026-10-26.md` (regenerate with
`python scripts/genre-audit.py "<root>" --md docs/genre-audit-<date>.md`).

Immediate red flags from the pre-Session-A baseline:

- ~~**Seed keys are matched raw, not normalized.**~~ **FIXED in Session A**
  (keys + accents folded; +26 tracks, e.g. Notorious B.I.G. and `M|O|O|N` now
  match).
- **`artist` vote never fires** (0 tracks). The vote path is effectively dead:
  either there are not enough tagged siblings or the threshold is wrong.
- **`folder` is the second biggest source** (373), with broad patterns
  (`game`, `score`) — highest false-positive risk, needs precision measurement.
- Untagged remainder is dominated by artists the seed list does not cover
  (plenka, EdgeCrusher420, Super Guitar Bros, DM DOKURO, …).
- **Class skew**: `Soundtrack` alone is 703 of 1076 guesses (65%), mostly big
  OST folders. The "Genres" browser is therefore much coarser than it looks.

### Session A results (rules actually firing)

| Rule | Tracks |
|---|---|
| `folder:Clair Obscur_ Expedition 33 (Original So…` | 174 |
| `tag:Soundtrack` | 119 |
| `folder:Elden Ring OST Full Official Soundtrack` | 67 |
| `tag:Score` | 58 |
| `seed:caparezza` | 55 |
| `folder:NieR_Automata Original Soundtrack【Audio】` | 46 |
| `folder:NieR Gestalt & Replicant Original Soundt…` | 43 |
| `filename` | 38 |
| `folder:Dark Souls 3 (Original Game Soundtrack)` | 32 |
| `seed:motoi sakuraba` | 31 |

Tag-vs-artist-majority conflicts: **0** in this library.

## 3. Hypotheses to test

| # | Hypothesis | How we test |
|---|---|---|
| H1 | Seed lexicon under-fires because keys aren't normalized | Normalize keys, re-run; expect +dozens of hits |
| H2 | Album/artist voting is effectively dead | Audit counts of candidates and why they fail (votes/share) |
| H3 | Folder rules over-assign `Soundtrack` | Precision on 40 random `folder`-sourced tracks |
| H4 | UI shows fewer chips than the data has | Check rendered chips vs guess count; `hidden sm:inline` hides chips on narrow windows |
| H5 | Genres tile looks empty because classes are too coarse | Distribution + expected tile counts |
| H6 | Stale cache hides new fields | Compare `scannedAt` and presence of `genre_guess` in `audit-library.json` |

## 4. Instruments to build (deliverables)

### 4.1 `scripts/genre-audit.js` (or `.py`) — rule audit CLI

Reads a scan (fresh or cached) and prints:

- per-source totals (tag / artist_seed / album / artist / folder / filename)
- per-rule fire counts (needs `genre_rule` field: e.g. `seed:caparezza`,
  `folder:ost`, `path:dnb`)
- confidence histogram
- top 25 unknown artists and unknown folders
- disagreements: tracks where the tag says X but a later rule says Y
- `Soundtrack`/`Hip Hop` share by source (false-positive smoke test)

Required small change: emit `genre_rule` alongside `genre_source`.

### 4.2 `docs/genre-eval.csv` — ground truth sample

- 120 tracks, stratified: 20 per source (tag, seed, folder, filename,
  unknown, and 20 random).
- Blind labelling: listen to ≤20 s or use known metadata; label with the
  canonical taxonomy + `wrong` flag.
- Stored in repo, stable across iterations.

### 4.3 Evaluation script

Given the CSV: per-class precision/recall, overall accuracy, confidence
calibration (accuracy in 0.9+ bucket vs 0.6 bucket), and the list of errors by
rule.

## 5. Procedure

**Session A — instrument (DONE)**
1. ✅ Seed keys + accents normalized (H1 confirmed: 1051 → 1076 guesses).
2. ✅ `genre_rule` emitted (`seed:…`, `folder:<segment>`, `tag:<raw>`, `vote:*`).
3. ✅ `scripts/genre-audit.py` + `docs/genre-audit-2026-10-26.md` generated.

**Session B — ground truth (≈60 min)**
4. Generate stratified sample, label 120 tracks into `docs/genre-eval.csv`.
5. Run evaluation → precision per source, calibration table.

**Session C — decide & tune (≈45 min)**
6. Fix only rules with measured precision < 0.75 (expected: folder `game`,
   folder `score`, `Rap` vs `Hip Hop` split).
7. Extend seed lexicon only with artists measured in the unknown top-25.
8. Re-measure; freeze thresholds.

## 6. Acceptance criteria

| Criterion | Target |
|---|---|
| Coverage | ≥ 85% |
| Precision (labelled sample) | ≥ 0.85 overall |
| Precision of `folder` source | ≥ 0.80 |
| Wrong-genre rate on `tag` source | ≤ 2% |
| Seed keys matching failures | 0 (unit check) |
| UI chips rendered = tracks with guess | 100% at window width ≥ 640px |

If folder precision misses the target, downgrade folder rules to
`genre_confidence ≈ 0.45` and mark them as suggestions in the UI.

## 7. UI checks (same session)

- Verify chip visibility at 800/1000/1280 px (currently `hidden sm:inline`).
- Confirm "Genres" tile count matches distinct `genre_guess` values.
- Confirm a rescan refreshes the cache and the chips (compare `scannedAt`).
- Decide whether `Rap` and `Hip Hop` should merge (the library treats
  Caparezza as Rap only via the seed; the classifier otherwise says Hip Hop).

## 8. Frontend assessment (player + library UI)

Goal: the interface must *show* what the engine knows and never hide state.
Checks are objective, one evening of work.

### 8.1 Checklist

| Check | Expected | How |
|---|---|---|
| Genre chip visible | every track with `genre_guess` shows a chip at ≥ 640 px | screenshot at 800/1000/1280 px |
| Chip tooltip | shows `genre_rule · confidence%` | hover 5 tracks from different sources |
| Genres tile count | equals distinct `genre_guess` in the loaded library | compare tile number with audit JSON |
| Genre grouping | one row per canonical genre, counts sum to guesses | Library → Genres |
| Cache freshness | after "scan", chips appear without restart | compare `scannedAt` + visible chips |
| Queue virtualization | scrolling a 1000+ queue never blanks rows | scroll to bottom, check first/last visible |
| Compact consistency | player nav/rows use the same 2.5 spacing as the rest | visual pass |
| Empty states | no-player, empty queue, empty library all readable | open each view |

### 8.2 Known suspicions

- Chips are `hidden sm:inline`: below 640 px they disappear entirely.
- `Rap` vs `Hip Hop` split makes the genre list look inconsistent (Caparezza
  is Rap only because of the seed).
- Genre tiles count "Unknown" as a genre when no guess exists.

### 8.3 Fixes queued after assessment

1. Chip always visible (smaller on narrow widths instead of hidden).
2. Merge or clearly label `Rap`/`Hip Hop`; map seed `Rap` → `Hip Hop` if the
   evaluation shows no meaningful split.
3. Exclude `Unknown` from the genres tile count, or show it as a separate row.
4. Add a tiny "smart" dot on chips coming from `folder`/`filename`
   (lower-confidence sources).

## 9. Mini player assessment (deferred tonight)

Goal: the mini player must feel like a toggle of the main window, never a
window that can be lost.

### 9.1 Checklist

| Check | Expected | How |
|---|---|---|
| Toggle from title bar | open → close → open, no duplicate windows | click PiP button 4× |
| Close from mini (X) | mini hides, main window returns focused | close mini, verify main |
| Close main window | main hides, mini appears once | click window X |
| State sync | PiP button highlight matches reality after every action | observe accent background |
| Instant reopen | reopening after hide shows previous track/art with no white flash | open, close, reopen |
| Position memory | mini reopens at the last position (multi-monitor safe) | move mini, restart app |
| Audio continuity | playback never stops during show/hide | play a track, toggle 5× |
| Tray interactions | tray "show mini" and "show app" agree with the toggle state | use tray menu |

### 9.2 Known gaps

- Position/size are not persisted across sessions.
- Show/hide uses the same renderer, so a stale `player:state` may be shown for
  up to 1 s after reopening.
- No explicit guard against focusing a hidden window from IPC.

### 9.3 Fixes queued (next session, not tonight)

1. Persist mini bounds in userData (`miniBounds`) and clamp to visible work
   areas on restore.
2. Emit a fresh `player:state` on `show` (main renderer already publishes every
   second; trigger one immediately on demand).
3. Ignore `mini:show` when the main window is visible and the user did not ask
   for the mini (avoid surprise pop-ups).
4. Keep the window hidden-but-alive (already implemented) and destroy only on
   quit.

## 10. Risks

- Labels are one person's taste; use "wrong" only for clear misses.
- Folder heuristics depend on the user's naming habits; re-audit after big
  library reorganisations.
- Seed lexicon is inherently biased to popular English artists; track its
  coverage share and never let it exceed ~50% of total guesses.
