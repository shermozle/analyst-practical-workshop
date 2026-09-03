// Minimal CDP client. Chrome's one-shot --dump-dom and --screenshot modes don't
// return on this platform, so everything goes over the DevTools socket instead.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launchChrome({ width = 1440, height = 900 } = {}) {
  const profile = await mkdtemp(join(tmpdir(), "workshop-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", `--window-size=${width},${height}`, `--user-data-dir=${profile}`,
    "--remote-debugging-port=0", "about:blank"
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
  await new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = () => fail(new Error("Could not open the CDP socket."));
  });

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

  async function evaluate(sessionId, expression) {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true
    }, sessionId);
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text || "page threw");
    }
    return result.value;
  }

  async function openPage(url) {
    const { targetId } = await send("Target.createTarget", { url });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Runtime.enable", {}, sessionId);
    await send("Page.enable", {}, sessionId);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(sessionId, "document.readyState") === "complete") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 250));
    return { sessionId, targetId };
  }

  async function screenshot(sessionId, clip) {
    const { data } = await send("Page.captureScreenshot", {
      format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: Boolean(clip)
    }, sessionId);
    return Buffer.from(data, "base64");
  }

  async function elementClip(sessionId, selector) {
    const box = await evaluate(sessionId, `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
    })()`);
    if (!box) throw new Error(`No element matched ${selector}.`);
    return box;
  }

  return {
    send,
    evaluate,
    openPage,
    screenshot,
    elementClip,
    async close() {
      socket.close();
      chrome.kill("SIGKILL");
      await rm(profile, { recursive: true, force: true });
    }
  };
}
