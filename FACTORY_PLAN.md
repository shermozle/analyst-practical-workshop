# Workshop factory plan

## Goal

Create a workshop from a small set of source files, then generate a hub, slides, a reference app, a talk track, and a participant guide as static HTML.

The factory should help the author spend time on the exercise and teaching sequence. It should handle navigation, page structure, shared styling, URL state, cross-references, checks, and publishing.

The existing Experiment Basics workshop is the visual and interaction reference. Its bundled 4.8 MB HTML file is a useful final format, but it should not become the authoring format.

## Start with one real workshop

Build the first version alongside this week's workshop. Make one complete path work before adding a large component library:

1. Capture the audience, duration, outcomes, product features, and exercise level.
2. Write a timed run of show.
3. Build the reference app and hands-on stations.
4. Generate the slides, talk track, guide, and hub from the same workshop metadata.
5. Check the pack and publish it.

Extract reusable parts as they appear in that workshop. This keeps the first release small and tests the factory against a real deadline.

## Authoring model

Each workshop has one manifest for facts shared across the pack. Longer content stays in separate files so the manifest remains readable.

```yaml
id: experiment-planning
title: Plan an experiment
duration_minutes: 120
audience:
  roles: [product managers, engineers]
  technical_level: mixed
outcomes:
  - Choose a useful exposure event
  - Define a primary metric and guardrails
products: [Amplitude Experiment]
features:
  - name: Feature flags
    mode: hands-on
  - name: Sequential testing
    mode: demo
run_of_show:
  - id: opening-demo
    title: See an experiment run
    minutes: 10
  - id: station-1
    title: Choose the exposure event
    minutes: 20
    done_when: The event fires once for each exposure
stations:
  - id: station-1
    minutes: 20
    optional: false
    done_when: The event fires once for each exposure
```

Use stable IDs for slides, blocks, and stations. The build assigns display numbers and times. Talk-track references, slide labels, guide links, and hub counts should never depend on numbers typed by hand.

## Repository shape

```text
workshop-factory/
  src/
    runtime/                 shared navigation and URL-state code
    components/              quizzes, sliders, simulations, event log
    templates/               hub, slides, app, talk track, guide
    styles/                  Amplitude and Statsig themes
  scripts/
    create-workshop.mjs
    build-workshop.mjs
    check-workshop.mjs
  workshops/
    <workshop-id>/
      workshop.yml           shared facts and run of show
      slides/                slide content and diagrams
      app/                   toy app code and state definition
      talk-track.md          presenter detail keyed by slide ID
      guide.md               station instructions keyed by station ID
      assets/
  tests/
  dist/
    <workshop-id>/
      index.html             hub
      slides.html
      app.html
      talk-track.html
      guide.html
```

Keep the first implementation in one repository with plain TypeScript, HTML, and CSS. Use a small Node build script rather than introducing a monorepo or content service. Bundle each generated page into one HTML file for reliable use on GitHub Pages and as a local backup.

## Factory commands

The author workflow should have four commands:

```text
pnpm workshop:new <id>       create a workshop from the starter
pnpm workshop:dev <id>       serve all five pages with live reload
pnpm workshop:check <id>     run content, layout, link, and app checks
pnpm workshop:build <id>     write the self-contained pack to dist
```

`workshop:new` should ask only for the inputs in `AGENTS.md`. It should write a manifest and a useful starter, not a mostly empty directory.

## Generated pages

### Hub

- Show the workshop title, audience, duration, and outcomes.
- Link to the slides, app, talk track, and participant guide.
- Label presenter-only material clearly.
- Include a short setup check and a downloadable offline pack.

### Slides

- Use a fixed 16:9 stage that scales to the screen.
- Limit each slide to three points.
- Include full-screen, previous, next, jump, timer, and print controls.
- Use stable hash links so the talk track can open the matching slide.
- Support diagrams, incremental reveals, quizzes, and live interactive components.
- Put the hub URL on setup, hands-on, and closing slides.

### Reference app

- Open in a working state before the attendee changes anything.
- Show events, assignments, requests, and state changes in an on-screen log.
- Give each station a visible goal, reset control, and "done when" check.
- Accept Amplitude API keys and Statsig client keys at runtime when needed. Never place server keys, secrets, or personal data in the page.
- Store canonical state in query parameters. Derive bulky data from a seed instead of placing full datasets in the URL.
- Update the URL with `history.replaceState` as controls change. A copied URL must restore the same exercise state.
- Offer a one-click copy link and a clean reset link.

### Talk track

- Follow the generated slide order.
- Show elapsed time, target time, speaker notes, demo cues, and cut points.
- Mark notes as a floor for the presenter, not a script to recite.
- Link each block to its slide and any app state needed for the demo.

### Participant guide

- Number the stations and give each a target duration.
- Include a goal, steps, expected result, and "done when" line.
- Make the last station optional so the session can absorb delays.
- Include recovery steps for the common ways an attendee can get stuck.

## Interactive component contract

Start with five reusable components:

1. `workshop-slider` changes one or two values and redraws a result.
2. `workshop-simulation` runs deterministic trials from a seed.
3. `workshop-quiz` reveals feedback and can reset.
4. `workshop-scenario` lets attendees choose a response and compare trade-offs.
5. `workshop-event-log` shows instrumentation and SDK activity.

Every component should:

- read its initial value from the page URL;
- write changes back to the page URL;
- have keyboard controls and visible labels;
- expose a reset action;
- work in slides and in the reference app;
- render without a network connection once the page has loaded.

Add components only when a workshop needs them. The Experiment Basics example provides the first candidates: coin simulation, confidence interval, peeking, rollout, quiz, and prize draw.

## Checks

`workshop:check` is a release gate. It should fail when:

- run-of-show minutes do not equal the session duration;
- slide, station, or block IDs are missing or duplicated;
- a talk-track or guide reference points to an unknown ID;
- a required station lacks minutes or a "done when" line;
- a slide has more than three declared points;
- a generated page has a broken internal link;
- a slide overflows the 16:9 stage;
- an attendee app control cannot round-trip through the URL;
- the app sends an event or assignment that differs from the documented schema;
- a page has a basic keyboard or contrast failure;
- generated output contains old names from a renamed station or feature.

Use browser tests to move through every slide and station. Stub the Amplitude or Statsig SDK in app tests, drive the controls, and assert the exact event names, properties, assignment calls, and initialization order.

## Delivery plan for this week

### 1. Foundation: half a day

- Add the workshop manifest and starter directory.
- Add the four factory commands.
- Build the shared theme, URL-state helper, and static-page bundling.
- Generate a hub and placeholder versions of the other pages.

Exit: one command creates a workshop and one command builds five linked HTML files.

### 2. First workshop path: one day

- Complete the intake for this week's audience and outcomes.
- Write a run of show whose minutes match the session length.
- Build the working reference app first.
- Add the event log, reset, copy-link, and deterministic seed.

Exit: an attendee can complete the core exercise without slides or presenter help.

### 3. Teaching pack: one day

- Build the slides from the run of show.
- Write talk-track blocks against stable slide IDs.
- Write station instructions and recovery steps in the guide.
- Add hub links and workshop URLs to the deck.

Exit: all five pages agree on station names, order, timings, and outcomes.

### 4. Release checks: half a day

- Add timing, reference, link, overflow, and URL round-trip checks.
- Stub the product SDK and test every instrumented action.
- Rehearse once at normal pace and record cuts or confusing steps.
- Build the offline pack and deploy to GitHub Pages.

Exit: `pnpm workshop:check <id>` passes, the published pack works on the venue network, and the presenter has an offline copy.

## Later releases

After this week's workshop, add only what repeated use justifies:

- a component gallery with editable examples;
- Amplitude and Statsig app starters;
- reusable event-plan and experiment-plan exercises;
- visual regression tests for themes and components;
- a migration command when the manifest schema changes;
- a workshop index on the main GitHub Pages site;
- an archive command that preserves a delivered version.

Avoid a browser-based workshop editor until the source format and author workflow have survived several real workshops.

## Definition of done

The first factory release is done when a new workshop can be created, edited, checked, and published without copying an old workshop by hand. A copied app URL restores the exercise, the reference app shows its own instrumentation, all pack timings and references agree, and each generated page works from GitHub Pages and from an offline file.

## Inputs needed for this week's workshop

Before building the first pack, capture:

- audience roles and technical level;
- session length and delivery format;
- two or three outcomes attendees should leave with;
- the Amplitude or Statsig features to cover;
- which features attendees will use and which the presenter will demo;
- the toy application or scenario;
- expected attendee count, device constraints, and venue network limits.
