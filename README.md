# Analyst practical workshop

A factory for hands-on Amplitude and Statsig workshops, plus the pack it currently
builds: **From questions to clean events**, a two-hour session for digital analytics
practitioners.

**Published pack: https://shermozle.github.io/analyst-practical-workshop/**

One manifest per workshop generates five self-contained pages: a hub, a slide deck, a
working to-do app the room instruments, a presenter talk track, and a participant
guide. Nothing depends on a server at run time — the app keeps its state in the URL —
so the pack works from GitHub Pages or from a local copy.

## Commands

```bash
npm run workshop:build     # write dist/<workshop-id>/
npm run workshop:check     # release gate: content, contract, and browser checks
npm run workshop:smoke     # browser pass on its own (needs Chrome)
npm run workshop:serve     # serve the built pack at http://localhost:4173
```

Each takes an optional workshop id and defaults to `digital-analytics-practitioners`.

`workshop:check` is the gate. It fails when run-of-show minutes don't sum to the
session length, when start times drift, when IDs collide, when a station has no "done
when" line, when a slide declares more than three points, when the hub URL isn't the
published absolute URL, when a generated page has stale text, and when the manifest
carries fields the renderer ignores. It then runs two test passes:

- **Contract** (`tests/amplitude-contract.mjs`) stubs the SDK and asserts the call
  order `init → setUserId → identify → track` plus every event payload against the
  manifest, so a schema change can't drift from the tracking plan the room is handed.
- **Browser** (`tests/browser-smoke.mjs`) drives the real pages in headless Chrome
  over CDP: that `entry_method` reports `keyboard` for Enter and `button` for a click,
  that an untracked action sends nothing, that `task_position` is the position the
  person saw, that the API key never reaches the URL, that a share link carries the
  list but not the key or the sharer's profile and round-trips it, that the identity
  panel works without advancing the deck, and that no slide overflows the 16:9 stage.

CI has no Chrome, so the browser pass is skipped there (`SKIP_BROWSER_CHECK=1`) and
run locally before delivery.

## Authoring

```text
workshops/<id>/
  workshop.json        audience, outcomes, run of show, tracking plan, slides
  app.template.html    the reference app; __WORKSHOP_DATA__ is replaced at build
scripts/
  build-workshop.mjs   renders the five pages
  check-workshop.mjs   the release gate
  serve-workshop.mjs   local static server
dist/<id>/             the built pack, committed as the offline copy
```

Facts live once, in `workshop.json`, and the build derives the rest. Station numbers,
durations, and "done when" lines come off the run-of-show block, so the deck and the
guide can't disagree about them. Slide order drives the talk track. The app receives
only the tracking plan — never the slides or presenter notes.

## Running the session

Before the day:

1. Send the hub link so attendees do the pre-work. Creating an Amplitude project is
   the thing most likely to strand somebody, and it's the one thing they can sort out
   in advance.
2. Run `npm run workshop:check` and rehearse once at pace.
3. Keep a standby project API key for anyone blocked at Station 3, and `npm run
   workshop:serve` ready as the offline fallback.

During the session, the deck has a timer against each block's target end time, `f` for
full screen, `o` to jump, and `r` to restart the clock. The talk track carries a CUT
line for every demo and a hard gate at 0:38 — the hands-on hour doesn't absorb demo
overrun.

## Safety notes

The app takes a **project API key**, which is a public client-side identifier. It's
kept in tab-scoped storage rather than the URL, so it never travels in a share link or
sits in browser history. Task text is never sent as an event property; length and age
answer the exercise questions without collecting what somebody typed. Don't put a
secret key, an email address, or personal data into any field.
