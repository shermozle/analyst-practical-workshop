import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const template = await readFile(new URL("../workshops/digital-analytics-practitioners/app.template.html", import.meta.url), "utf8");
const workshop = JSON.parse(await readFile(new URL("../workshops/digital-analytics-practitioners/workshop.json", import.meta.url), "utf8"));
const match = template.match(/<script id="amplitude-adapter">([\s\S]*?)<\/script>/);
assert(match, "Amplitude adapter script is missing from the app template.");

const calls = [];
class Identify {
  constructor() { this.values = {}; }
  set(key, value) { this.values[key] = value; return this; }
}
const sdk = {
  Identify,
  init(apiKey, userId, options) {
    calls.push({ method: "init", apiKey, userId, options });
    return { promise: Promise.resolve({ code: 200 }) };
  },
  setUserId(userId) { calls.push({ method: "setUserId", userId }); },
  identify(event) {
    calls.push({ method: "identify", properties: event.values });
    return { promise: Promise.resolve({ code: 200 }) };
  },
  track(eventName, properties) {
    calls.push({ method: "track", eventName, properties });
    return { promise: Promise.resolve({ code: 200, event: { event_type: eventName, event_properties: properties } }) };
  }
};

const context = { window: {} };
vm.runInNewContext(match[1], context);
const adapter = context.window.createWorkshopAmplitudeAdapter(sdk);
await adapter.init("project-api-key", "analyst-123", { defaultTracking: false, serverZone: "EU" });
await adapter.identify("analyst-123", {
  role: "digital analyst",
  analytics_experience: "intermediate",
  workshop_table: "table-4"
});
const result = await adapter.track("Task Created", {
  task_id: "task-a13f",
  task_length: 18,
  list_size: 4,
  entry_method: "keyboard"
});

assert.deepEqual(calls.map((call) => call.method), ["init", "setUserId", "identify", "track"]);
assert.equal(calls[0].apiKey, "project-api-key");
assert.equal(calls[0].userId, "analyst-123");
assert.equal(calls[0].options.defaultTracking, false);
assert.equal(calls[0].options.serverZone, "EU");
assert.deepEqual(calls[2].properties, {
  role: "digital analyst",
  analytics_experience: "intermediate",
  workshop_table: "table-4"
});
assert.deepEqual(calls[3].properties, {
  task_id: "task-a13f",
  task_length: 18,
  list_size: 4,
  entry_method: "keyboard"
});
assert.equal(result.code, 200);

const payloadMatch = template.match(/function actionPayload\(id,context\)\{([\s\S]*?)\n    \}\n    async function emit/);
assert(payloadMatch, "The app's actionPayload function is missing.");
const castMatch = template.match(/function cast\(value,type\)\{([\s\S]*?)\n    \}/);
assert(castMatch, "The app's cast function is missing.");

const payloadContext = { window: {} };
vm.runInNewContext(`
  let tasks = [
    {id:'task-a13f',title:'Write tracking plan',done:false,createdAt:1},
    {id:'task-b27q',title:'Check event',done:true,createdAt:2}
  ];
  let filter = 'active';
  function age(){ return 42; }
  function profile(){ return { role:'digital analyst', analytics_experience:'intermediate', workshop_table:'table-4' }; }
  function visibleTasks(){ return tasks.filter(task => filter === 'all' || (filter === 'active' && !task.done) || (filter === 'completed' && task.done)); }
  function actionPayload(id,context){${payloadMatch[1]}
  }
  function cast(value,type){${castMatch[1]}
  }
  window.actionPayload = actionPayload;
  window.cast = cast;
`, payloadContext);

// Values leave actionPayload in their honest type. The shipped plan's wrong types
// are produced by casting at send time, which is what the attendee corrects.
const { cast } = payloadContext.window;
assert.equal(cast(4, "string"), "4", "a number cast to string should keep its digits");
assert.equal(cast("4", "number"), 4, "a string holding a number should cast back to a number");
assert.equal(cast(true, "string"), "yes", "a boolean cast to string should read yes");
assert.equal(cast(false, "string"), "no", "a boolean cast to string should read no");
assert.equal(cast("no", "boolean"), false, "the string no should cast back to false");
assert.equal(cast("yes", "boolean"), true, "the string yes should cast back to true");
assert.equal(cast(0, "number"), 0, "zero should survive a number cast");

const task = { id: "task-a13f", title: "Write tracking plan", done: false, createdAt: 1 };
const contexts = {
  "task-created": { task, entryMethod: "keyboard" },
  "task-completed": { task, position: 1 },
  "task-reopened": { task, position: 1 },
  "task-edited": { task, before: "Write plan" },
  "task-deleted": { task },
  "filter-changed": {},
  "list-shared": {},
  "shared-list-opened": {}
};
for (const action of workshop.actions) {
  const values = payloadContext.window.actionPayload(action.id, contexts[action.id]);
  // The app must be able to produce every value either side of the audit: the ones
  // the shipped plan sends, and the ones an attendee can tick to repair it.
  const pool = [...action.shipped.properties, ...action.properties];
  for (const property of pool) {
    assert(property.name in values, `${action.id}.${property.name} has no value in the app, so ticking it would send nothing.`);
  }
  for (const property of action.properties) {
    assert.equal(typeof values[property.name], property.type, `${action.id}.${property.name} should be ${property.type} before casting.`);
  }
  assert.deepEqual(
    Object.keys(values).sort(),
    [...new Set(pool.map((property) => property.name))].sort(),
    `${action.id} produces values the plan never asks for.`
  );
}

const flawCount = workshop.actions.reduce((sum, action) => sum + action.shipped.flaws.length, 0) + workshop.shipped_user_property_flaws.length;
console.log(`Amplitude contract passed: init → setUserId → identify → track; every value either side of the audit is produced; ${flawCount} planted flaws across ${workshop.actions.filter((a) => a.shipped.flaws.length).length} of ${workshop.actions.length} actions.`);
