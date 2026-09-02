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
const payloadContext = { window: {} };
vm.runInNewContext(`
  let tasks = [
    {id:'task-a13f',title:'Write tracking plan',done:false,createdAt:1},
    {id:'task-b27q',title:'Check event',done:true,createdAt:2}
  ];
  let filter = 'active';
  function age(){ return 42; }
  function visibleTasks(){ return tasks.filter(task => filter === 'all' || (filter === 'active' && !task.done) || (filter === 'completed' && task.done)); }
  function actionPayload(id,context){${payloadMatch[1]}
  }
  window.actionPayload = actionPayload;
`, payloadContext);

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
  const payload = payloadContext.window.actionPayload(action.id, contexts[action.id]);
  assert.deepEqual(Object.keys(payload).sort(), action.properties.map((property) => property.name).sort(), `${action.id} property names differ from the plan.`);
  for (const property of action.properties) {
    assert.equal(typeof payload[property.name], property.type, `${action.id}.${property.name} should be ${property.type}.`);
  }
}

console.log("Amplitude contract passed: init → setUserId → identify → track; all event payloads match the plan.");
