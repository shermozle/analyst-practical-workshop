// Drives the built pack in headless Chrome over CDP. Static asserts can't tell us
// whether entry_method actually reports "keyboard", whether a share link is clean,
// or whether clicking the identity panel skips a slide. This can.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workshopId = process.argv[2] || "digital-analytics-practitioners";
const dist = join(root, "dist", workshopId);
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ---------------------------------------------------------------- static server
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  try {
    const body = await readFile(join(dist, path === "/" ? "index.html" : path.slice(1)));
    response.writeHead(200, { "content-type": types[path.slice(path.lastIndexOf("."))] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------------ CDP client
const profile = await mkdtemp(join(tmpdir(), "workshop-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--window-size=1440,900", `--user-data-dir=${profile}`, "--remote-debugging-port=0",
  "about:blank"
], { stdio: ["ignore", "pipe", "pipe"] });

const endpoint = await new Promise((done, fail) => {
  const timer = setTimeout(() => fail(new Error("Chrome never reported a DevTools endpoint.")), 30000);
  let buffer = "";
  chrome.stderr.on("data", (chunk) => {
    buffer += chunk;
    const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) { clearTimeout(timer); done(match[1]); }
  });
  chrome.on("exit", (code) => { clearTimeout(timer); fail(new Error(`Chrome exited with ${code}.`)); });
});

const socket = new WebSocket(endpoint);
await new Promise((done, fail) => { socket.onopen = done; socket.onerror = () => fail(new Error("Could not open the CDP socket.")); });
const pending = new Map();
let nextId = 0;
socket.onmessage = (message) => {
  const frame = JSON.parse(message.data);
  if (frame.id === undefined || !pending.has(frame.id)) return;
  const { done, fail } = pending.get(frame.id);
  pending.delete(frame.id);
  frame.error ? fail(new Error(`${frame.error.message} (${frame.method || ""})`)) : done(frame.result);
};
const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
  const id = ++nextId;
  pending.set(id, { done, fail });
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

async function openPage(path) {
  const { targetId } = await send("Target.createTarget", { url: `${origin}${path}` });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(sessionId, "document.readyState");
    if (state === "complete") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 250));
  return { sessionId, targetId };
}

async function evaluate(sessionId, expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true
  }, sessionId);
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text || "page threw");
  }
  return result.value;
}

// -------------------------------------------------------------------- harnesses
const APP_SCRIPT = `(async () => {
  const results = {};
  const wait = () => new Promise(r => setTimeout(r, 60));
  const form = document.querySelector('#add-form');
  const input = document.querySelector('#new-task');
  const addButton = document.querySelector('#add-button');
  const lastPayload = () => JSON.parse(document.querySelector('#activity .log pre').textContent);
  const lastTitle = () => document.querySelector('#activity .log .log-head b').textContent;
  const submit = () => form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: addButton }));
  const change = (el, value) => { if (value !== undefined) el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const check = (el, on) => { el.checked = on; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const tick = (action, name, on) => check(document.querySelector('[data-prop-action="' + action + '"][data-prop-name="' + name + '"]'), on);
  const uprop = (name, on) => check(document.querySelector('[data-uprop="' + name + '"]'), on);
  const addTask = (title, viaButton) => {
    input.value = title;
    if (viaButton) addButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    submit();
  };

  results.planRows = document.querySelectorAll('#plan .plan-row').length;
  results.toggles = document.querySelectorAll('#plan [data-toggle-id]').length;
  results.userPropRows = document.querySelectorAll('#user-plan [data-uprop]').length;

  // ---- as shipped: the plan is wrong in the ways the answer key says it is ----
  addTask('Shipped task');
  await wait();
  results.shippedCreate = lastPayload();

  document.querySelector('[data-filter="active"]').click();
  await wait();
  results.shippedFilter = lastPayload();

  const visible = [...document.querySelectorAll('#tasks .task')];
  results.expectedPosition = 3;
  check(visible[2].querySelector('input[type=checkbox]'), true);
  await wait();
  results.shippedComplete = lastPayload();

  document.querySelector('[data-filter="all"]').click();
  await wait();
  document.querySelector('#tasks .task .delete').click();
  await wait();
  results.shippedDelete = lastPayload();

  document.querySelector('#identify').click();
  await wait();
  results.shippedUserProperties = lastPayload().user_properties;

  // An untracked action must send nothing and say so.
  const toggle = document.querySelector('[data-toggle-id="task-created"]');
  check(toggle, false);
  addTask('Untracked task');
  await wait();
  results.untrackedTitle = lastTitle();
  results.untrackedPayload = lastPayload();
  results.offParam = new URLSearchParams(location.search).get('off_task-created');
  results.rowDimmed = document.querySelector('[data-row-id="task-created"]').classList.contains('off');
  check(toggle, true);
  await wait();

  // ---- now correct it, the way an attendee would ----
  change(document.querySelector('#event-task-created'), 'Task Created');
  tick('task-created', 'entry_method', true);
  tick('task-created', 'role', false);
  tick('task-created', 'analytics_experience', false);
  change(document.querySelector('[data-type-action="task-created"][data-type-name="list_size"]'), 'number');
  await wait();

  addTask('Corrected task');
  await wait();
  results.correctedCreateKeyboard = lastPayload();
  addTask('Clicked task', true);
  await wait();
  results.correctedCreateButton = lastPayload();

  change(document.querySelector('#event-filter-changed'), 'List Filter Changed');
  tick('filter-changed', 'filter', true);
  await wait();
  document.querySelector('[data-filter="completed"]').click();
  await wait();
  results.correctedFilter = lastPayload();
  document.querySelector('[data-filter="all"]').click();
  await wait();

  change(document.querySelector('#event-task-completed'), 'Task Completed');
  tick('task-completed', 'age_seconds', true);
  await wait();
  const stillActive = [...document.querySelectorAll('#tasks .task')].find(row => !row.classList.contains('done'));
  check(stillActive.querySelector('input[type=checkbox]'), true);
  await wait();
  results.correctedComplete = lastPayload();

  uprop('last_task_id', false);
  uprop('last_filter', false);
  uprop('workshop_table', true);
  document.querySelector('#table').value = 'table-4';
  await wait();
  document.querySelector('#identify').click();
  await wait();
  results.correctedUserProperties = lastPayload().user_properties;

  // The key lives in tab storage, never the URL.
  const key = document.querySelector('#api-key');
  key.value = 'testkey1234567890';
  key.dispatchEvent(new Event('change', { bubbles: true }));
  await wait();
  results.urlHasApiKey = /[?&]apiKey=/.test(location.search);
  try { results.sessionKey = sessionStorage.getItem('workshop_api_key'); } catch (e) { results.sessionKey = 'THREW'; }

  // A share link carries the list, not the key or the sharer's identity.
  let shared = null;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { shared = text; } }, configurable: true });
  document.querySelector('#share').click();
  await wait();
  results.shareHasApiKey = /[?&]apiKey=/.test(shared || '');
  results.shareHasUserId = /[?&]userId=/.test(shared || '');
  results.shareHasRole = /[?&]role=/.test(shared || '');
  results.shareHasTasks = /[?&]tasks=/.test(shared || '');
  results.shareHasSharedFlag = /[?&]shared=1/.test(shared || '');

  // The copied link must restore the same list.
  const shareParams = new URLSearchParams(new URL(shared).search);
  const decode = (value) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))));
  results.shareTaskTitles = decode(shareParams.get('tasks')).map(t => t.title);
  results.liveTaskTitles = [...document.querySelectorAll('#tasks .task-title')].map(el => el.textContent);
  results.correctedUrl = location.href;
  return results;
})()`;

const DECK_SCRIPT = `(async () => {
  const results = {};
  const wait = () => new Promise(r => setTimeout(r, 60));
  location.hash = '#identity';
  await wait();
  const lab = document.querySelector('.lab');
  const control = (name) => lab.querySelector('[data-lab=' + name + ']');
  results.slideOnLoad = document.querySelector('.slide.on').dataset.id;

  control('event').click();
  control('event').click();
  await wait();
  results.slideAfterClicks = document.querySelector('.slide.on').dataset.id;
  results.deviceChipsAnonymous = lab.querySelectorAll('[data-lane=device] .chip').length;
  results.verdictAnonymous = lab.querySelector('[data-lab-verdict]').textContent;

  control('signin').click();
  control('event').click();
  await wait();
  results.userChipsSignedIn = lab.querySelectorAll('[data-lane=user] .chip').length;
  results.deviceChipsSignedIn = lab.querySelectorAll('[data-lane=device] .chip').length;
  results.resolved = lab.classList.contains('resolved');
  results.verdictResolved = lab.querySelector('[data-lab-verdict]').textContent;
  results.userLabel = lab.querySelector('[data-user-label]').textContent;
  results.signInLabel = control('signin').textContent;

  const setUser = control('setuser');
  setUser.checked = false;
  setUser.dispatchEvent(new Event('change', { bubbles: true }));
  await wait();
  results.userChipsNoId = lab.querySelectorAll('[data-lane=user] .chip').length;
  results.deviceChipsNoId = lab.querySelectorAll('[data-lane=device] .chip').length;
  results.verdictNoId = lab.querySelector('[data-lab-verdict]').textContent;
  results.slideAtEnd = document.querySelector('.slide.on').dataset.id;

  // Arrow keys must still move the deck even after the panel has been driven.
  dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait();
  results.slideAfterArrow = document.querySelector('.slide.on').dataset.id;

  // Every slide must fit the 1280x720 stage.
  results.overflowing = [...document.querySelectorAll('.slide')].filter(slide => {
    slide.style.display = 'flex';
    const tall = slide.scrollHeight > 723 || slide.scrollWidth > 1283;
    const size = slide.scrollHeight + 'x' + slide.scrollWidth;
    slide.style.display = '';
    slide.dataset.size = size;
    return tall;
  }).map(slide => slide.dataset.id + ' ' + slide.dataset.size);
  return results;
})()`;

// ----------------------------------------------------------------- assertions
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

try {
  const appPage = await openPage("/app.html");
  const app = await evaluate(appPage.sessionId, APP_SCRIPT);

  expect(app.planRows === 8, `Instrumentation panel shows ${app.planRows} rows, expected 8.`);
  expect(app.toggles === 8, `Instrumentation panel shows ${app.toggles} toggles, expected 8.`);
  expect(app.userPropRows === 5, `User property panel shows ${app.userPropRows} chips, expected 5.`);

  // The app must arrive wrong in exactly the ways the answer key claims.
  const shippedCreate = app.shippedCreate?.event_properties || {};
  expect(app.shippedCreate?.event_type === "clicked_add_button", `Shipped create event is "${app.shippedCreate?.event_type}".`);
  expect(typeof shippedCreate.list_size === "string", `Shipped list_size is ${typeof shippedCreate.list_size}, expected the planted string.`);
  expect("role" in shippedCreate, "Shipped create event should carry role as an event property for attendees to move.");
  expect(!("entry_method" in shippedCreate), "Shipped create event shouldn't carry entry_method; that's the planted omission.");

  const shippedFilter = app.shippedFilter?.event_properties || {};
  expect(app.shippedFilter?.event_type === "Filter Changed - active", `Shipped filter event is "${app.shippedFilter?.event_type}"; the value should be baked into the name.`);
  expect(!("filter" in shippedFilter), "Shipped filter event shouldn't carry a filter property; that's the planted omission.");

  const shippedComplete = app.shippedComplete?.event_properties || {};
  expect(app.shippedComplete?.event_type === "Task Toggled", `Shipped complete event is "${app.shippedComplete?.event_type}".`);
  expect(!("age_seconds" in shippedComplete), "Shipped complete event shouldn't carry age_seconds; that's the planted omission.");
  expect(shippedComplete.task_position === app.expectedPosition, `task_position reported ${shippedComplete.task_position}; the person clicked the item at visible position ${app.expectedPosition}.`);

  const shippedDelete = app.shippedDelete?.event_properties || {};
  expect(app.shippedDelete?.event_type === "taskDeleted", `Shipped delete event is "${app.shippedDelete?.event_type}".`);
  expect(typeof shippedDelete.was_completed === "string", `Shipped was_completed is ${typeof shippedDelete.was_completed}, expected the planted string.`);
  expect("client_timestamp" in shippedDelete, "Shipped delete event should carry the redundant client_timestamp.");

  expect("last_filter" in (app.shippedUserProperties || {}), "Shipped user properties should include last_filter for attendees to move.");
  expect(!("workshop_table" in (app.shippedUserProperties || {})), "Shipped user properties shouldn't include workshop_table; that's the planted omission.");

  expect(/^Not tracked/.test(app.untrackedTitle || ""), `Untracked action logged "${app.untrackedTitle}".`);
  expect(app.untrackedPayload?.event_properties === undefined, "Untracked action still logged an event payload.");
  expect(app.offParam === "1", "Unticking an action didn't record off_task-created in the URL.");
  expect(app.rowDimmed === true, "Unticked row isn't visibly marked as untracked.");

  // And every correction must actually change what goes out.
  const fixedKeyboard = app.correctedCreateKeyboard?.event_properties || {};
  expect(app.correctedCreateKeyboard?.event_type === "Task Created", `Renaming the event sent "${app.correctedCreateKeyboard?.event_type}".`);
  expect(fixedKeyboard.entry_method === "keyboard", `Enter in the field reported entry_method "${fixedKeyboard.entry_method}".`);
  expect(app.correctedCreateButton?.event_properties?.entry_method === "button", `Clicking Add task reported entry_method "${app.correctedCreateButton?.event_properties?.entry_method}".`);
  expect(typeof fixedKeyboard.list_size === "number", `Correcting the type left list_size as ${typeof fixedKeyboard.list_size}.`);
  expect(!("role" in fixedKeyboard) && !("analytics_experience" in fixedKeyboard), "Unticking person context left it on the event.");

  expect(app.correctedFilter?.event_type === "List Filter Changed", `Corrected filter event is "${app.correctedFilter?.event_type}".`);
  expect(app.correctedFilter?.event_properties?.filter === "completed", `Corrected filter property is "${app.correctedFilter?.event_properties?.filter}".`);

  expect(app.correctedComplete?.event_type === "Task Completed", `Corrected complete event is "${app.correctedComplete?.event_type}".`);
  expect(typeof app.correctedComplete?.event_properties?.age_seconds === "number", "Ticking age_seconds didn't add it to the payload.");

  const fixedUser = app.correctedUserProperties || {};
  expect(fixedUser.workshop_table === "table-4", `Corrected user properties give workshop_table as "${fixedUser.workshop_table}".`);
  expect(!("last_filter" in fixedUser) && !("last_task_id" in fixedUser), "Unticking occurrence context left it on the user.");
  expect("role" in fixedUser, "Corrected user properties dropped role, which does belong on the person.");

  expect(app.urlHasApiKey === false, "The API key reached the URL.");
  expect(app.sessionKey === "testkey1234567890", `The API key wasn't stored in the tab (got ${app.sessionKey}).`);
  expect(app.shareHasApiKey === false, "The share link carries the API key.");
  expect(app.shareHasUserId === false, "The share link carries the sharer's user ID.");
  expect(app.shareHasRole === false, "The share link carries the sharer's profile.");
  expect(app.shareHasTasks === true, "The share link doesn't carry the list.");
  expect(app.shareHasSharedFlag === true, "The share link doesn't set shared=1.");
  expect(JSON.stringify(app.shareTaskTitles) === JSON.stringify(app.liveTaskTitles),
    `Share link doesn't round-trip the list: ${JSON.stringify(app.shareTaskTitles)} vs ${JSON.stringify(app.liveTaskTitles)}.`);

  // A copied link has to restore the corrected plan, not the shipped one.
  const restored = await evaluate((await openPage(app.correctedUrl.replace(origin, ""))).sessionId, `({
    eventName: document.querySelector('#event-task-created').value,
    entryMethodOn: document.querySelector('[data-prop-action="task-created"][data-prop-name="entry_method"]').checked,
    roleOn: document.querySelector('[data-prop-action="task-created"][data-prop-name="role"]').checked,
    listSizeType: document.querySelector('[data-type-action="task-created"][data-type-name="list_size"]').value,
    filterEventName: document.querySelector('#event-filter-changed').value,
    filterPropOn: document.querySelector('[data-prop-action="filter-changed"][data-prop-name="filter"]').checked,
    workshopTableOn: document.querySelector('[data-uprop="workshop_table"]').checked,
    lastFilterOn: document.querySelector('[data-uprop="last_filter"]').checked
  })`);
  expect(restored.eventName === "Task Created", `Reloading restored the event name as "${restored.eventName}".`);
  expect(restored.entryMethodOn === true, "Reloading lost the ticked entry_method property.");
  expect(restored.roleOn === false, "Reloading brought back the unticked role property.");
  expect(restored.listSizeType === "number", `Reloading restored the list_size type as "${restored.listSizeType}".`);
  expect(restored.filterEventName === "List Filter Changed", `Reloading restored the filter event name as "${restored.filterEventName}".`);
  expect(restored.filterPropOn === true, "Reloading lost the ticked filter property.");
  expect(restored.workshopTableOn === true, "Reloading lost the ticked workshop_table user property.");
  expect(restored.lastFilterOn === false, "Reloading brought back the unticked last_filter user property.");

  const deckPage = await openPage("/slides.html");
  const deck = await evaluate(deckPage.sessionId, DECK_SCRIPT);

  expect(deck.slideOnLoad === "identity", `Hash link opened "${deck.slideOnLoad}" instead of the identity slide.`);
  expect(deck.slideAfterClicks === "identity", "Clicking the identity panel advanced the deck.");
  expect(deck.slideAtEnd === "identity", "Driving the identity panel advanced the deck.");
  expect(deck.slideAfterArrow !== "identity", "Arrow keys stopped advancing the deck after the panel was used.");
  expect(deck.deviceChipsAnonymous === 2, `Anonymous lane shows ${deck.deviceChipsAnonymous} events, expected 2.`);
  expect(deck.userChipsSignedIn === 1, `Signed-in lane shows ${deck.userChipsSignedIn} events, expected 1.`);
  expect(deck.deviceChipsSignedIn === 2, `Device lane shows ${deck.deviceChipsSignedIn} events after sign-in, expected the 2 earlier ones.`);
  expect(deck.resolved === true, "Signing in with a user ID didn't mark the lanes resolved.");
  expect(deck.signInLabel === "Sign out", `Sign-in control reads "${deck.signInLabel}" after signing in.`);
  expect(/analyst-7f3/.test(deck.userLabel || ""), `User lane label reads "${deck.userLabel}".`);
  expect(/including the 2 from before sign-in/.test(deck.verdictResolved || ""), `Resolved verdict reads "${deck.verdictResolved}".`);
  expect(deck.userChipsNoId === 0, "Unticking the user ID left events attributed to a person.");
  expect(deck.deviceChipsNoId === 3, `Without a user ID the device lane shows ${deck.deviceChipsNoId} events, expected all 3.`);
  expect(/nobody to match/.test(deck.verdictNoId || ""), `No-user-ID verdict reads "${deck.verdictNoId}".`);
  expect(deck.overflowing.length === 0, `Slides overflow the 16:9 stage: ${deck.overflowing.join("; ")}.`);
} finally {
  socket.close();
  chrome.kill("SIGKILL");
  server.close();
  await rm(profile, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`Browser smoke failed with ${failures.length} problem${failures.length === 1 ? "" : "s"}:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Browser smoke passed: shipped plan arrives with its planted flaws, every correction changes the payload, corrections survive a reload, plus key handling, share round-trip, identity panel, and slide fit.");
