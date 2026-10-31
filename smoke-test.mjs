import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const profile = mkdtempSync(resolve(tmpdir(), "xushi-v3-smoke-"));
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const appUrl = process.env.XUSHI_TEST_URL || pathToFileURL(resolve("index.html")).href;
const browser = spawn(edge, ["--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
  "--remote-allow-origins=*", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  appUrl], { stdio: "ignore" });
let socket;
let nextId = 1;
const pending = new Map();

async function waitForPort() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const file = resolve(profile, "DevToolsActivePort");
    if (existsSync(file)) return Number(readFileSync(file, "utf8").split("\n")[0]);
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Edge did not start");
}
function call(method, params = {}) {
  const id = nextId++;
  return new Promise((resolveCall, rejectCall) => {
    pending.set(id, { resolveCall, rejectCall });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
async function screenshot(name) {
  await evaluate("document.querySelector('#toast').classList.add('hidden')");
  const result = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(name), Buffer.from(result.data, "base64"));
}

try {
  const port = await waitForPort();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === "page" && item.url.includes("index.html"));
  assert(target, "App page not found");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (!pending.has(message.id)) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.rejectCall(new Error(message.error.message));
    else entry.resolveCall(message.result);
  };
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  await new Promise((done) => setTimeout(done, 400));
  assert(await evaluate("document.querySelector('#activity-tag').options.length") === 4, "Initial render failed");

  const activity = await evaluate(`(() => {
    document.querySelector('#new-tag-name').value = '创作';
    document.querySelector('#add-tag').click();
    document.querySelector('#activity-title').value = '读书';
    document.querySelector('#activity-form').requestSubmit();
    document.querySelector('#activity-title').value = '写作';
    document.querySelector('input[name="timer-kind"][value="parallel"]').checked = true;
    document.querySelector('#activity-form').requestSubmit();
    const solo = data.activities[0], parallel = data.activities[1];
    document.querySelector('[data-action="toggle-activity"][data-id="' + solo.id + '"]').click();
    document.querySelector('[data-action="toggle-activity"][data-id="' + parallel.id + '"]').click();
    const soloPaused = !solo.running && parallel.running;
    parallel.elapsed = 120; parallel.running = false; parallel.startedAt = null;
    document.querySelector('[data-action="finish-activity"][data-id="' + parallel.id + '"]').click();
    return { tag: data.tags.at(-1).name, soloPaused, sessions: data.sessions.length, fish: document.querySelectorAll('#ocean-main .fish').length,
      history: document.querySelectorAll('#session-list .record-row').length };
  })()`);
  assert(activity.tag === "创作" && activity.soloPaused && activity.sessions === 1 && activity.fish === 1 && activity.history === 1,
    `Activity failed: ${JSON.stringify(activity)}`);

  const timerModes = await evaluate(`(() => {
    document.querySelector('input[name="timer-kind"][value="parallel"]').checked = true;
    document.querySelector('#activity-title').value = '并行甲'; document.querySelector('#activity-form').requestSubmit();
    document.querySelector('#activity-title').value = '并行乙'; document.querySelector('#activity-form').requestSubmit();
    const a = data.activities.at(-2), b = data.activities.at(-1);
    document.querySelector('[data-action="toggle-activity"][data-id="' + a.id + '"]').click();
    document.querySelector('[data-action="toggle-activity"][data-id="' + b.id + '"]').click();
    const parallel = a.running && b.running;
    pauseActivity(a); pauseActivity(b);
    document.querySelector('input[name="timer-mode"][value="countdown"]').click();
    document.querySelector('#activity-duration').value = '1';
    document.querySelector('#activity-title').value = '倒计时'; document.querySelector('#activity-form').requestSubmit();
    const countdown = data.activities.at(-1);
    countdown.elapsed = 59; countdown.running = true; countdown.startedAt = Date.now() - 2000;
    advanceActivities();
    const countdownDone = !!countdown.completedAt && data.sessions.at(-1).seconds === 60;
    document.querySelector('input[name="timer-mode"][value="cycle"]').click();
    document.querySelector('#activity-title').value = '循环'; document.querySelector('#activity-form').requestSubmit();
    const cycle = data.activities.at(-1);
    cycle.elapsed = 2999; cycle.running = true; cycle.startedAt = Date.now() - 2000;
    advanceActivities();
    const focusDone = cycle.phase === 'break' && data.sessions.at(-1).seconds === 3000;
    cycle.elapsed = 599; cycle.startedAt = Date.now() - 2000;
    advanceActivities();
    const breakDone = cycle.phase === 'focus';
    pauseActivity(cycle);
    return { parallel, countdownDone, focusDone, breakDone, sessions: data.sessions.length };
  })()`);
  assert(timerModes.parallel && timerModes.countdownDone && timerModes.focusDone && timerModes.breakDone && timerModes.sessions === 3,
    `Timer modes failed: ${JSON.stringify(timerModes)}`);

  const todos = await evaluate(`(() => {
    showView('todos');
    document.querySelector('#todo-title').value = '交报告';
    document.querySelector('#todo-quadrant').value = 'urgent-important';
    document.querySelector('#todo-form').requestSubmit();
    document.querySelector('.todo-item input[type="checkbox"]').click();
    document.querySelector('#add-water').click();
    return { tasks: data.tasks.length, completed: data.tasks[0].completed, jelly: document.querySelectorAll('#ocean-main .jelly').length, water: data.water[0].amount };
  })()`);
  assert(todos.tasks === 1 && todos.completed && todos.jelly === 1 && todos.water === 250, `Todo failed: ${JSON.stringify(todos)}`);

  const health = await evaluate(`(() => {
    showView('health');
    document.querySelector('#body-height').value = '165'; document.querySelector('#body-weight').value = '60'; document.querySelector('#body-form').requestSubmit();
    document.querySelector('#meal-text').value = '米饭和蔬菜'; document.querySelector('#meal-form').requestSubmit();
    document.querySelector('#exercise-name').value = '慢跑'; document.querySelector('#exercise-minutes').value = '30'; document.querySelector('#exercise-form').requestSubmit();
    document.querySelector('#period-form').requestSubmit();
    return [data.body.length, data.meals.length, data.exercises.length, data.periods.length];
  })()`);
  assert(health.every((count) => count === 1), `Health failed: ${health}`);

  const mood = await evaluate(`(() => {
    showView('mood');
    document.querySelector('[data-mood="happy"]').click();
    document.querySelector('#diary-text').value = '今天完成了计划';
    document.querySelector('#save-mood').click();
    return { count: data.moods.length, text: data.moods[0].note };
  })()`);
  assert(mood.count === 1 && mood.text === "今天完成了计划", `Mood failed: ${JSON.stringify(mood)}`);

  const summary = await evaluate(`(() => {
    showView('summary');
    document.querySelector('#review-text').value = '本周做得不错';
    document.querySelector('#pie-legend input').click();
    const draft = document.querySelector('#review-text').value;
    document.querySelector('#save-review').click();
    return { draft, reviews: data.reviews.length, fish: document.querySelectorAll('#summary-ocean .fish').length,
      completedItems: document.querySelectorAll('#summary-todos .summary-todo-row').length };
  })()`);
  assert(summary.draft === "本周做得不错" && summary.reviews === 1 && summary.fish === 3 && summary.completedItems === 1,
    `Summary failed: ${JSON.stringify(summary)}`);
  await call("Emulation.setDeviceMetricsOverride", { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
  await screenshot("preview-summary-v3.png");

  const calendar = await evaluate(String.raw`(() => {
    showView('calendar');
    document.querySelector('#event-title').value = '手动日程';
    document.querySelector('#event-form').requestSubmit();
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-event\r\nDTSTART:20261101T090000\r\nDTEND:20261101T100000\r\nSUMMARY:导入日程\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const imported = importIcs(ics);
    const recurring = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:daily-event\r\nDTSTART:20261101T120000\r\nDTEND:20261101T123000\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:每日练习\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const repeated = importIcs(recurring);
    const duplicate = importIcs(recurring);
    return { count: data.events.length, imported, repeated, duplicate };
  })()`);
  assert(calendar.count === 5 && calendar.imported === 1 && calendar.repeated === 3 && calendar.duplicate === 0,
    `Calendar failed: ${JSON.stringify(calendar)}`);

  const settings = await evaluate(`(() => {
    showView('settings');
    document.querySelector('#setting-water-goal').value = '2500';
    document.querySelector('#save-settings').click();
    return data.settings.waterGoal;
  })()`);
  assert(settings === 2500, "Settings failed");
  await call("Page.reload");
  await new Promise((done) => setTimeout(done, 500));
  const persistence = await evaluate("({tasks:data.tasks.length,sessions:data.sessions.length,events:data.events.length,moods:data.moods.length})");
  assert(persistence.tasks === 1 && persistence.sessions === 3 && persistence.events === 5 && persistence.moods === 1,
    `Persistence failed: ${JSON.stringify(persistence)}`);

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate(`(() => {
    const result = {};
    for (const view of ['timer','todos','health','mood','summary','calendar','settings']) {
      showView(view);
      result[view] = { width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    }
    showView('timer');
    return result;
  })()`);
  for (const [view, size] of Object.entries(mobile)) assert(size.width === 390 && size.scrollWidth <= 390, `Mobile overflow in ${view}: ${JSON.stringify(size)}`);
  await screenshot("preview-mobile-v3.png");
  await evaluate("showView('todos')");
  await screenshot("preview-todos-mobile-v3.png");
  await evaluate("showView('calendar')");
  await screenshot("preview-calendar-mobile-v3.png");
  const migration = await evaluate(`(() => {
    const migrated = migrateOld({
      tasks: [{id:'old-task',title:'旧任务',category:'学习',completed:true,createdAt:new Date().toISOString(),completedAt:new Date().toISOString()}],
      sessions: [{id:'old-session',category:'学习',seconds:300,endedAt:new Date().toISOString()}],
      settings: {focus:50,break:10}
    });
    return { title:migrated.tasks[0]?.title, quadrant:migrated.tasks[0]?.quadrant, seconds:migrated.sessions[0]?.seconds };
  })()`);
  assert(migration.title === "旧任务" && migration.quadrant === "noturgent-important" && migration.seconds === 300,
    `Migration failed: ${JSON.stringify(migration)}`);
  const linkage = await evaluate(`(() => {
    const task = data.tasks[0];
    task.completed = false; task.completedAt = null;
    renderTodos(); renderTop();
    const suggested = document.querySelector('#route-start').dataset.taskId === task.id;
    document.querySelector('#route-start').click();
    const linked = data.activities.at(-1);
    const running = linked.running && linked.taskId === task.id;
    linked.elapsed = 120; linked.running = false; linked.startedAt = null;
    completeActivity(linked);
    showView('todos');
    return { suggested, running, taskId: data.sessions.at(-1).taskId, expectedId: task.id,
      focusLabel: document.querySelector('.todo-focus-time')?.textContent, streak: actionStreak() };
  })()`);
  assert(linkage.suggested && linkage.running && linkage.taskId === linkage.expectedId &&
    linkage.focusLabel?.includes("2 分钟") && linkage.streak >= 1, `Task linkage failed: ${JSON.stringify(linkage)}`);
  let pwa = null;
  if (appUrl.startsWith("http")) {
    pwa = await evaluate(`Promise.race([
      navigator.serviceWorker.ready.then(async () => {
        const keys = await caches.keys(); const key = keys.find((item) => item.startsWith('xushi-app-'));
        return { controlled: !!navigator.serviceWorker.controller, files: key ? (await (await caches.open(key)).keys()).length : 0,
          cachedIndex: !!(await caches.match('./index.html')) };
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PWA install timed out')), 8000))
    ])`);
    assert(pwa.files >= 40, `PWA cache failed: ${JSON.stringify(pwa)}`);
    await call("Network.enable");
    await call("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await call("Page.reload");
    await new Promise((done) => setTimeout(done, 650));
    pwa.offline = await evaluate("({url:location.href,options:document.querySelector('#activity-tag')?.options.length || 0,body:document.body?.innerText.slice(0,100)})");
    assert(pwa.offline.options >= 4, `Offline reload failed: ${JSON.stringify(pwa)}`);
    await call("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  process.stdout.write(JSON.stringify({ activity, timerModes, todos, health, mood, summary, calendar, settings, persistence, mobile, migration, linkage, pwa }) + "\n");
  await call("Browser.close");
} finally {
  socket?.close();
  browser.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
