import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedId = process.argv[2] || "digital-analytics-practitioners";
const sourceDir = join(root, "workshops", requestedId);
const outputDir = join(root, "dist", requestedId);
const workshop = JSON.parse(await readFile(join(sourceDir, "workshop.json"), "utf8"));
const errors = [];
const pass = (condition, message) => { if (!condition) errors.push(message); };

const total = workshop.run_of_show.reduce((sum, block) => sum + block.minutes, 0);
pass(total === workshop.duration_minutes, `Timing totals ${total}, expected ${workshop.duration_minutes}.`);

// The hub URL is projected on the cover, divider, and break slides. A relative
// path is useless to a room reading it off a screen.
pass(/^https?:\/\//.test(workshop.hub_url || ""), `hub_url must be the published absolute URL; found "${workshop.hub_url}".`);

// Stations are numbered once, on the block, so the deck and the guide can't drift.
const stations = workshop.run_of_show.filter((block) => ["hands-on", "optional"].includes(block.mode));
stations.forEach((block, index) => {
  pass(block.station === index + 1, `${block.id} should carry station number ${index + 1}; found ${block.station}.`);
});

let cursor = 0;
for (const block of workshop.run_of_show) {
  pass(block.start === cursor, `${block.id} starts at ${block.start}; expected ${cursor}.`);
  cursor += block.minutes;
  if (["hands-on", "optional"].includes(block.mode)) pass(Boolean(block.done_when), `${block.id} needs a done_when line.`);
}

for (const [label, items] of [["block", workshop.run_of_show], ["slide", workshop.slides], ["action", workshop.actions]]) {
  const ids = items.map((item) => item.id);
  pass(new Set(ids).size === ids.length, `${label} IDs aren't unique.`);
}

const blockIds = new Set(workshop.run_of_show.map((block) => block.id));
for (const slide of workshop.slides) {
  pass(blockIds.has(slide.block_id), `${slide.id} points to unknown block ${slide.block_id}.`);
  if (Array.isArray(slide.points) && slide.kind !== "inventory") pass(slide.points.length <= 3, `${slide.id} has more than three points.`);
  // A station's "done when" line is projected and printed. One copy, on the block.
  pass(!("done_when" in slide), `${slide.id} declares its own done_when; it belongs on block ${slide.block_id}.`);
  if (slide.kind === "station") pass(Boolean(blockFor(slide).station), `${slide.id} maps to a block with no station number.`);
  // Anything the slide renderer ignores is drift waiting to be believed.
  if (slide.kind === "identity-lab") pass(!("points" in slide), `${slide.id} declares points that the interactive panel doesn't render.`);
}
function blockFor(slide) { return workshop.run_of_show.find((block) => block.id === slide.block_id); }

const expectedFiles = ["index.html", "slides.html", "app.html", "talk-track.html", "guide.html"];
const files = {};
for (const name of expectedFiles) {
  try {
    await stat(join(outputDir, name));
    files[name] = await readFile(join(outputDir, name), "utf8");
  } catch {
    errors.push(`Missing generated file: ${name}. Run workshop:build first.`);
  }
}

if (files["index.html"]) {
  for (const name of expectedFiles.slice(1)) pass(files["index.html"].includes(`href="${name}"`), `Hub doesn't link to ${name}.`);
  pass(files["index.html"].includes("Do this before you arrive"), "Hub is missing the attendee pre-work section.");
}

if (files["slides.html"]) {
  const slideCount = (files["slides.html"].match(/<section class="slide/g) || []).length;
  pass(slideCount === workshop.slides.length, `Deck has ${slideCount} slides; expected ${workshop.slides.length}.`);
  for (const slide of workshop.slides) pass(files["slides.html"].includes(`data-id="${slide.id}"`), `Deck is missing slide ${slide.id}.`);
  pass(files["slides.html"].includes("requestFullscreen"), "Deck needs a full-screen control.");
  pass(files["slides.html"].includes("@media print"), "Deck needs a print stylesheet.");
  pass(files["slides.html"].includes(workshop.hub_url), "Deck doesn't print the published hub URL.");
  // Click-to-advance must not fire while somebody is driving an interactive panel.
  if (workshop.slides.some((slide) => slide.kind === "identity-lab")) {
    pass(files["slides.html"].includes("data-interactive"), "Deck is missing the interactive identity panel.");
    pass(files["slides.html"].includes("closest('[data-interactive]')"), "Deck advances slides on clicks inside interactive panels.");
  }
  for (const block of stations) {
    pass(files["slides.html"].includes(block.done_when), `Deck has stale done_when text for ${block.id}.`);
  }
}

if (files["talk-track.html"]) {
  for (const slide of workshop.slides) pass(files["talk-track.html"].includes(`slides.html#${slide.id}`), `Talk track doesn't link to slide ${slide.id}.`);
}

if (files["guide.html"]) {
  for (const block of workshop.run_of_show.filter((item) => ["hands-on", "optional"].includes(item.mode))) {
    pass(files["guide.html"].includes(`id="${block.id}"`), `Guide is missing ${block.id}.`);
    pass(files["guide.html"].includes(block.done_when), `Guide has stale done_when text for ${block.id}.`);
  }
  for (const action of workshop.actions) pass(files["guide.html"].includes(action.event_name), `Guide reference plan is missing ${action.event_name}.`);
}

if (files["app.html"]) {
  pass(!files["app.html"].includes("__WORKSHOP_DATA__"), "App still contains the data placeholder.");
  pass(files["app.html"].includes("analytics-browser-2.45.8-min.js.gz"), "App doesn't load the pinned Browser SDK.");
  pass(files["app.html"].includes("defaultTracking:false"), "App must disable default tracking for the exercise.");
  pass(files["app.html"].includes("new sdk.Identify()"), "App doesn't send user properties with Identify.");
  pass(files["app.html"].includes("sdk.init(apiKey,userId||undefined,options).promise"), "App initialization order changed.");
  pass(files["app.html"].includes("sdk.identify(identifyEvent).promise"), "App Identify call is missing.");
  pass(files["app.html"].includes("sdk.track(eventName,properties).promise"), "App track call is missing.");
  for (const action of workshop.actions) pass(files["app.html"].includes(action.event_name), `App is missing ${action.event_name}.`);
  // The key is a public client-side identifier, but it must not ride along in the
  // URL: share links would carry it and the recipient would connect to the wrong project.
  pass(!files["app.html"].includes("setParam('apiKey'"), "App writes the API key into the URL.");
  pass(files["app.html"].includes("'apiKey'") && /forEach\(name=>share\.searchParams\.delete\(name\)\)/.test(files["app.html"]), "App share link must strip the API key and the sharer's profile.");
  pass(files["app.html"].includes("sessionStorage"), "App must keep the API key in tab-scoped storage.");
  // Attendees have this page open for an hour; presenter cues don't belong in it.
  for (const marker of ["LIVE DEMO", "CUT:", "GATE:", '"slides"']) {
    pass(!files["app.html"].includes(marker), `App contains presenter-only content: ${marker}.`);
  }
  pass(files["app.html"].includes("data-toggle-id"), "App is missing the per-event tracking toggles.");
  pass(!files["app.html"].includes("event.submitter?'button'"), "App still infers entry_method from event.submitter.");
  const forbiddenProperties = ["task_title", "task_text", "task_content", "email"];
  for (const property of forbiddenProperties) {
    const declared = workshop.actions.some((action) => action.properties.some((item) => item.name === property));
    pass(!declared, `Tracking plan includes forbidden property ${property}.`);
  }
}

for (const name of ["slides.html", "app.html"]) {
  if (!files[name]) continue;
  const scripts = [...files[name].matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [index, script] of scripts.entries()) {
    try { new Function(script[1]); }
    catch (error) { errors.push(`${name} inline script ${index + 1} has invalid JavaScript: ${error.message}`); }
  }
}

const staleTerms = ["participant handout", "TODO WORKSHOP TITLE", "YOUR_API_KEY_HERE"];
for (const [name, content] of Object.entries(files)) {
  for (const term of staleTerms) pass(!content.includes(term), `${name} contains stale text: ${term}.`);
}

if (errors.length) {
  console.error(`Workshop check failed with ${errors.length} problem${errors.length === 1 ? "" : "s"}:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Workshop check passed: ${workshop.slides.length} slides, ${workshop.run_of_show.length} timed blocks, ${workshop.duration_minutes} minutes, ${expectedFiles.length} generated pages.`);
if (requestedId === "digital-analytics-practitioners") await import("../tests/amplitude-contract.mjs");

// The browser pass is the part that catches instrumentation and layout regressions.
// Skip it only when there's no Chrome to drive, and say so rather than passing quietly.
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (process.env.SKIP_BROWSER_CHECK) {
  console.log("Browser smoke skipped: SKIP_BROWSER_CHECK is set.");
} else if (await stat(chromePath).then(() => true, () => false)) {
  process.argv[2] = requestedId;
  await import("../tests/browser-smoke.mjs");
} else {
  console.log(`Browser smoke skipped: no Chrome at ${chromePath}. Set CHROME_PATH to run it.`);
}
