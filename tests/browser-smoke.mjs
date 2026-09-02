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

  results.planRows = document.querySelectorAll('#plan .plan-row').length;
  results.toggles = document.querySelectorAll('#plan [data-toggle-id]').length;

  // Enter in the field must report keyboard, even though implicit submission
  // sets event.submitter to the default button.
  input.value = 'Keyboard task';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  submit();
  await wait();
  results.keyboardEntry = lastPayload().event_properties.entry_method;

  // Clicking Add task must report button.
  input.value = 'Button task';
  addButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  submit();
  await wait();
  results.buttonEntry = lastPayload().event_properties.entry_method;

  // An untracked action must send nothing and say so.
  const toggle = document.querySelector('[data-toggle-id="task-created"]');
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  input.value = 'Untracked task';
  submit();
  await wait();
  results.untrackedTitle = lastTitle();
  results.untrackedPayload = lastPayload();
  results.offParam = new URLSearchParams(location.search).get('off_task-created');
  results.rowDimmed = document.querySelector('[data-row-id="task-created"]').classList.contains('off');
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  await wait();

  // task_position must be the position the person saw, not the index in the full list.
  document.querySelector('[data-filter="active"]').click();
  await wait();
  const visible = [...document.querySelectorAll('#tasks .task')];
  const target = visible[2];
  results.visibleCount = visible.length;
  results.expectedPosition = 3;
  const box = target.querySelector('input[type=checkbox]');
  box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  await wait();
  results.reportedPosition = lastPayload().event_properties.task_position;
  results.reportedEventName = lastPayload().event_type;
  document.querySelector('[data-filter="all"]').click();
  await wait();

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
  results.pageText = document.body.innerText.length;
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
  expect(app.keyboardEntry === "keyboard", `Enter in the field reported entry_method "${app.keyboardEntry}".`);
  expect(app.buttonEntry === "button", `Clicking Add task reported entry_method "${app.buttonEntry}".`);
  expect(/^Not tracked/.test(app.untrackedTitle || ""), `Untracked action logged "${app.untrackedTitle}".`);
  expect(app.untrackedPayload?.event_properties === undefined, "Untracked action still logged an event payload.");
  expect(app.offParam === "1", "Unticking an action didn't record off_task-created in the URL.");
  expect(app.rowDimmed === true, "Unticked row isn't visibly marked as untracked.");
  expect(app.reportedEventName === "Task Completed", `Completing a task sent "${app.reportedEventName}".`);
  expect(app.reportedPosition === app.expectedPosition, `task_position reported ${app.reportedPosition}; the person clicked the item at visible position ${app.expectedPosition}.`);
  expect(app.urlHasApiKey === false, "The API key reached the URL.");
  expect(app.sessionKey === "testkey1234567890", `The API key wasn't stored in the tab (got ${app.sessionKey}).`);
  expect(app.shareHasApiKey === false, "The share link carries the API key.");
  expect(app.shareHasUserId === false, "The share link carries the sharer's user ID.");
  expect(app.shareHasRole === false, "The share link carries the sharer's profile.");
  expect(app.shareHasTasks === true, "The share link doesn't carry the list.");
  expect(app.shareHasSharedFlag === true, "The share link doesn't set shared=1.");
  expect(JSON.stringify(app.shareTaskTitles) === JSON.stringify(app.liveTaskTitles),
    `Share link doesn't round-trip the list: ${JSON.stringify(app.shareTaskTitles)} vs ${JSON.stringify(app.liveTaskTitles)}.`);

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
console.log("Browser smoke passed: entry_method, tracking toggles, task_position, key handling, share round-trip, identity panel, and slide fit.");
