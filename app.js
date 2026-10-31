const STORAGE_KEY = "xushi-app-v3";
const OLD_STORAGE_KEY = "xushi-todo-v2";
const $ = (selector) => document.querySelector(selector);
const DEFAULT_TAGS = [
  { id: "work", name: "工作", color: "#70b4ca" },
  { id: "study", name: "学习", color: "#aaa7d7" },
  { id: "life", name: "生活", color: "#e6a6b8" },
  { id: "other", name: "其他", color: "#91ba9d" },
];
const QUADRANTS = ["urgent-important", "noturgent-important", "urgent-notimportant", "noturgent-notimportant"];
const QUADRANT_NAMES = { "urgent-important": "紧急且重要", "noturgent-important": "重要不紧急", "urgent-notimportant": "紧急不重要", "noturgent-notimportant": "不重要不紧急" };
const MOODS = {
  radiant: { icon: "🥳", name: "特别开心", message: "把这份快乐好好收下，今天的光亮值得记住。" },
  happy: { icon: "😊", name: "开心", message: "有好事发生的日子，也许可以多停留一会儿。" },
  calm: { icon: "😌", name: "平静", message: "平稳地走过今天，也是一件很好的事。" },
  tired: { icon: "😮‍💨", name: "疲惫", message: "辛苦了。允许自己慢下来，休息也是前进的一部分。" },
  sad: { icon: "😔", name: "低落", message: "难过不需要马上消失。先照顾好自己，明天再慢慢来。" },
};

const uid = () => crypto.randomUUID();
const isoNow = () => new Date().toISOString();
const pad = (number) => String(number).padStart(2, "0");
function dayKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function localDateTime(input) {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function localInputDateTime(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function secondsText(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  return `${pad(minutes)}:${pad(value % 60)}`;
}
function minutesText(seconds) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}
function make(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = String(text);
  return element;
}
function iconButton(iconName, label, action, id) {
  const button = make("button", "icon-button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.dataset.action = action;
  if (id) button.dataset.id = id;
  const image = make("img");
  image.src = `icons/${iconName}.svg`;
  image.alt = "";
  button.append(image);
  return button;
}
function safeColor(value) { return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#3189b5"; }
function freshData() {
  return {
    version: 3, tags: DEFAULT_TAGS.map((tag) => ({ ...tag })), activities: [], sessions: [], tasks: [],
    body: [], meals: [], exercises: [], periods: [], moods: [], events: [], reviews: [], water: [],
    settings: { focusMinutes: 50, breakMinutes: 10, heightCm: null, waterGoal: 2000, waterCup: 250,
      waterInterval: 90, waterRemind: true },
    lastWaterPromptAt: Date.now(), lastExportAt: null,
  };
}
function normalizeData(raw) {
  if (!raw || raw.version !== 3 || !Array.isArray(raw.tasks) || !Array.isArray(raw.sessions)) throw new Error("无效的数据文件");
  const data = freshData();
  const arrayFields = ["activities", "sessions", "tasks", "body", "meals", "exercises", "periods", "moods", "events", "reviews", "water"];
  for (const field of arrayFields) data[field] = Array.isArray(raw[field]) ? raw[field].filter((item) => item && typeof item === "object") : [];
  const valid = {
    activities: (item) => typeof item.id === "string" && typeof item.title === "string" && typeof item.createdAt === "string" && ["stopwatch", "countdown", "cycle"].includes(item.mode) && ["solo", "parallel"].includes(item.kind),
    sessions: (item) => typeof item.id === "string" && typeof item.endedAt === "string" && Number.isFinite(item.seconds) && item.seconds > 0,
    tasks: (item) => typeof item.id === "string" && typeof item.title === "string" && typeof item.createdAt === "string" && QUADRANTS.includes(item.quadrant),
    body: (item) => typeof item.id === "string" && typeof item.date === "string" && (item.height === null || Number.isFinite(item.height)) && Number.isFinite(item.weight),
    meals: (item) => typeof item.id === "string" && typeof item.date === "string" && typeof item.text === "string",
    exercises: (item) => typeof item.id === "string" && typeof item.date === "string" && typeof item.name === "string" && Number.isFinite(item.minutes),
    periods: (item) => typeof item.id === "string" && typeof item.start === "string" && typeof item.end === "string",
    moods: (item) => typeof item.id === "string" && typeof item.date === "string" && typeof item.note === "string" && !!MOODS[item.mood],
    events: (item) => typeof item.id === "string" && typeof item.title === "string" && typeof item.date === "string",
    reviews: (item) => typeof item.id === "string" && typeof item.key === "string" && typeof item.text === "string",
    water: (item) => typeof item.id === "string" && typeof item.date === "string" && Number.isFinite(item.amount),
  };
  for (const [field, check] of Object.entries(valid)) if (data[field].some((item) => !check(item))) throw new Error("备份内容不完整");
  if (Array.isArray(raw.tags)) data.tags = raw.tags.filter((tag) => tag && typeof tag.name === "string" && typeof tag.id === "string")
    .map((tag) => ({ id: tag.id, name: tag.name.slice(0, 16), color: safeColor(tag.color) }));
  const options = { focusMinutes: [1, 180], breakMinutes: [1, 60], waterGoal: [100, 10000], waterCup: [50, 2000], waterInterval: [15, 480] };
  for (const [key, [min, max]] of Object.entries(options)) {
    const value = Number(raw.settings?.[key]);
    if (Number.isInteger(value) && value >= min && value <= max) data.settings[key] = value;
  }
  const height = Number(raw.settings?.heightCm);
  data.settings.heightCm = height >= 50 && height <= 250 ? height :
    [...data.body].filter((item) => Number.isFinite(item.height)).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.height || null;
  data.settings.waterRemind = raw.settings?.waterRemind !== false;
  data.lastWaterPromptAt = Number.isFinite(raw.lastWaterPromptAt) ? raw.lastWaterPromptAt : Date.now();
  data.lastExportAt = typeof raw.lastExportAt === "string" ? raw.lastExportAt : null;
  for (const activity of data.activities) {
    const startedAt = Number(activity.startedAt);
    activity.running = activity.running === true && !activity.completedAt && Number.isFinite(startedAt) && startedAt > 0;
    activity.startedAt = activity.running ? startedAt : null;
    const elapsed = Number(activity.elapsed);
    activity.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    activity.taskId = typeof activity.taskId === "string" ? activity.taskId : "";
  }
  for (const session of data.sessions) session.taskId = typeof session.taskId === "string" ? session.taskId : "";
  return data;
}
function migrateOld(raw) {
  const data = freshData();
  const categoryTag = { 工作: "work", 学习: "study", 生活: "life", 其他: "other" };
  data.tasks = (raw.tasks || []).map((task) => ({ id: task.id || uid(), title: task.title || "未命名任务", quadrant: "noturgent-important",
    due: task.due || "", remind: "", note: "", completed: !!task.completed, createdAt: task.createdAt || isoNow(),
    completedAt: task.completedAt || null, notified: false }));
  data.sessions = (raw.sessions || []).map((session) => ({ id: session.id || uid(), activityId: "", title: "专注记录",
    tagId: categoryTag[session.category] || "other", tagName: session.category || "其他", taskId: session.taskId || "",
    seconds: session.seconds || (session.minutes || 0) * 60,
    endedAt: session.endedAt || isoNow() })).filter((session) => session.seconds > 0);
  data.settings.focusMinutes = raw.settings?.focus || 50;
  data.settings.breakMinutes = raw.settings?.break || 10;
  return data;
}
function loadData() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeData(JSON.parse(current));
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) return migrateOld(JSON.parse(old));
  } catch { /* Keep the app available if browser storage is unavailable. */ }
  return freshData();
}
let data = loadData();
let activeView = "timer";
let selectedMood = null;
let editingTodoId = null;
let selectedDay = dayKey();
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let summaryPeriod = "week";
let visibleTags = new Set(data.tags.map((tag) => tag.id));
let knownSummaryTags = new Set(visibleTags);
let lastReviewKey = null;
let toastTimer;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch { toast("浏览器存储空间不足，请导出数据备份"); }
}
function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add("hidden"), 3500);
}
function tagFor(id) { return data.tags.find((tag) => tag.id === id); }
function tagName(id, fallback = "未分类") { return tagFor(id)?.name || fallback; }
function tagColor(id) { return tagFor(id)?.color || "#8ba6b5"; }
function taskFor(id) { return data.tasks.find((task) => task.id === id); }
function periodBounds(scope = summaryPeriod) {
  const now = new Date();
  let start;
  let end;
  if (scope === "week") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  } else if (scope === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
  }
  return { start, end, key: `${scope}-${dayKey(start)}` };
}
function withinPeriod(value, bounds) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= bounds.start.getTime() && time < bounds.end.getTime();
}

function creature(kind, size, color, x, y, index) {
  const item = make("div", `sea-creature ${kind === "jelly" ? "jelly" : "fish"}`);
  item.style.width = `${size}px`;
  item.style.height = `${size}px`;
  item.style.left = `min(${x}%, calc(100% - ${size + 24}px))`;
  item.style.top = `min(${y}%, calc(100% - ${size + 14}px))`;
  item.style.animationDelay = `${-(index % 9) * .7}s`;
  item.title = kind === "fish" ? "完成的计时活动" : "完成的待办事项";
  if (kind === "fish") {
    item.innerHTML = `<svg viewBox="0 0 80 60" aria-hidden="true"><path d="M17 30 2 16v28z" fill="${color}"/><path d="M13 30c8-17 26-23 43-14 12 6 18 16 20 14-2 2-8 8-20 14-17 9-35 3-43-14z" fill="${color}"/><path d="M30 17 39 3l9 12z" fill="${color}" opacity=".8"/><circle cx="60" cy="25" r="3" fill="#173a52"/><circle cx="61" cy="24" r="1" fill="#fff"/><path d="M67 34q4 3 7 0" fill="none" stroke="#173a52" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  } else {
    item.innerHTML = `<svg viewBox="0 0 70 78" aria-hidden="true"><path d="M8 38c0-18 11-30 27-30s27 12 27 30c-6 7-12 5-18 1-6 7-12 7-18 0-6 4-12 6-18-1z" fill="${color}"/><path d="M16 43q-3 17 0 29M27 45q2 14-1 29M39 45q-2 16 1 28M52 43q4 15 1 29" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/><circle cx="26" cy="29" r="2.5" fill="#173a52"/><circle cx="44" cy="29" r="2.5" fill="#173a52"/><path d="M31 35q4 4 8 0" fill="none" stroke="#173a52" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  return item;
}
function renderOcean(container, sessions, tasks) {
  const items = [
    ...sessions.map((session) => ({ kind: "fish", id: session.id, size: Math.min(76, 28 + Math.sqrt(Math.max(1, session.seconds) / 60) * 5), color: tagColor(session.tagId) })),
    ...tasks.map((task) => ({ kind: "jelly", id: task.id, size: 39, color: "#f2b5c2" })),
  ].slice(-32);
  const fragment = document.createDocumentFragment();
  items.forEach((entry, index) => {
    let hash = 0;
    for (const char of entry.id || String(index)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const x = 4 + (hash % 84);
    const y = 19 + ((hash >>> 8) % 55);
    fragment.append(creature(entry.kind, entry.size, entry.color, x, y, index));
  });
  if (!items.length) fragment.append(make("span", "ocean-empty", "今天的海洋正等着你"));
  container.replaceChildren(fragment);
}
function renderTop() {
  const date = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  $("#topbar-date").textContent = date;
  $("#sidebar-date").textContent = date;
  const todaySessions = data.sessions.filter((session) => dayKey(session.endedAt) === dayKey());
  $("#timer-today").replaceChildren(make("strong", "", String(todaySessions.length)), make("span", "", "次专注记录"));
  $("#ocean-count").textContent = `${data.sessions.length} 条小鱼 · ${data.tasks.filter((task) => task.completed).length} 只水母`;
  $("#ocean-time").textContent = minutesText(todaySessions.reduce((sum, session) => sum + session.seconds, 0));
  renderOcean($("#ocean-main"), data.sessions, data.tasks.filter((task) => task.completed));
  renderSessions();
  renderTodos();
}
function actionStreak() {
  const days = new Set([
    ...data.sessions.map((session) => dayKey(session.endedAt)),
    ...data.tasks.filter((task) => task.completedAt).map((task) => dayKey(task.completedAt)),
  ]);
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) { count += 1; cursor.setDate(cursor.getDate() - 1); }
  return count;
}
function suggestedTask() {
  const today = dayKey();
  const score = (task) => {
    const priority = { "urgent-important": 100, "noturgent-important": 75, "urgent-notimportant": 55, "noturgent-notimportant": 20 }[task.quadrant] || 0;
    if (!task.due) return priority;
    const days = Math.round((new Date(`${task.due}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
    return priority + (days < 0 ? 32 : days === 0 ? 24 : days <= 3 ? 12 : 0);
  };
  return data.tasks.filter((task) => !task.completed).sort((a, b) => score(b) - score(a) ||
    (a.due || "9999").localeCompare(b.due || "9999") || a.createdAt.localeCompare(b.createdAt))[0];
}
function renderRoute() {
  const next = suggestedTask();
  const button = $("#route-start");
  button.dataset.taskId = next?.id || "";
  button.lastChild.textContent = next ? "开始专注" : "添加待办";
  button.querySelector("img").src = `icons/${next ? "play" : "plus"}.svg`;
  $("#route-task-title").textContent = next?.title || "今天从哪里开始？";
  $("#route-reason").textContent = next ? `${QUADRANT_NAMES[next.quadrant]}${next.due ? ` · 截止 ${next.due}` : ""}` : "";
  $("#route-streak").textContent = `连续行动 ${actionStreak()} 天`;
  const today = dayKey();
  const focusSeconds = data.sessions.filter((session) => dayKey(session.endedAt) === today).reduce((sum, session) => sum + Number(session.seconds || 0), 0);
  const waterAmount = data.water.filter((entry) => entry.date === today).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  $("#route-focus").textContent = minutesText(focusSeconds);
  $("#route-open").textContent = `${data.tasks.filter((task) => !task.completed).length} 件`;
  $("#route-water").textContent = `${waterAmount} ml`;
}
function showView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const title = document.querySelector(`.nav-button[data-view="${view}"]`)?.textContent || "序时";
  $("#topbar-title").textContent = title;
  document.title = `序时 · ${title}`;
  window.scrollTo({ top: 0, behavior: "auto" });
  if (view === "summary") renderSummary();
  if (view === "calendar") renderCalendar();
  if (view === "mood") renderMood();
}
document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));

function renderTags() {
  const current = $("#activity-tag").value;
  const manualCurrent = $("#manual-tag").value;
  const options = document.createDocumentFragment();
  for (const tag of data.tags) options.append(new Option(tag.name, tag.id));
  $("#activity-tag").replaceChildren(options);
  $("#manual-tag").replaceChildren(...data.tags.map((tag) => new Option(tag.name, tag.id)));
  if (data.tags.some((tag) => tag.id === current)) $("#activity-tag").value = current;
  if (data.tags.some((tag) => tag.id === manualCurrent)) $("#manual-tag").value = manualCurrent;
  const list = document.createDocumentFragment();
  for (const tag of data.tags) {
    const chip = make("span", "tag-chip");
    const dot = make("i");
    dot.style.background = tag.color;
    chip.append(dot, document.createTextNode(tag.name), iconButton("x", `删除${tag.name}标签`, "delete-tag", tag.id));
    list.append(chip);
  }
  $("#tag-list").replaceChildren(list);
}
function renderActivityTasks() {
  const current = $("#activity-task").value;
  const manualCurrent = $("#manual-task").value;
  const options = document.createDocumentFragment();
  options.append(new Option("不关联待办", ""));
  for (const task of data.tasks.filter((item) => !item.completed)) options.append(new Option(task.title, task.id));
  $("#activity-task").replaceChildren(options);
  if (data.tasks.some((task) => task.id === current && !task.completed)) $("#activity-task").value = current;
  $("#manual-task").replaceChildren(new Option("不关联待办", ""),
    ...data.tasks.map((task) => new Option(task.title, task.id)));
  if (data.tasks.some((task) => task.id === manualCurrent)) $("#manual-task").value = manualCurrent;
}
$("#activity-task").addEventListener("change", () => {
  const task = taskFor($("#activity-task").value);
  if (task && !$("#activity-title").value.trim()) $("#activity-title").value = task.title;
});
$("#tag-panel-toggle").addEventListener("click", () => $("#tag-panel").classList.toggle("hidden"));
$("#add-tag").addEventListener("click", () => {
  const name = $("#new-tag-name").value.trim();
  if (!name) { toast("请填写标签名称"); return; }
  if (data.tags.some((tag) => tag.name === name)) { toast("这个标签已经存在"); return; }
  const tag = { id: uid(), name, color: safeColor($("#new-tag-color").value) };
  data.tags.push(tag);
  visibleTags.add(tag.id);
  knownSummaryTags.add(tag.id);
  renderTags();
  $("#activity-tag").value = tag.id;
  $("#new-tag-name").value = "";
  save();
  renderSessions();
  renderSummary();
});
$("#tag-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete-tag']");
  if (!button) return;
  const tag = tagFor(button.dataset.id);
  if (!tag || !confirm(`确定删除“${tag.name}”标签吗？已有计时记录会保留原标签名称。`)) return;
  data.tags = data.tags.filter((item) => item.id !== tag.id);
  visibleTags.delete(tag.id);
  knownSummaryTags.delete(tag.id);
  data.activities.forEach((activity) => { if (activity.tagId === tag.id) activity.tagId = ""; });
  save(); renderTags(); renderActivities(); renderSessions(); renderSummary();
});
document.querySelectorAll('input[name="timer-mode"]').forEach((input) => input.addEventListener("change", () => {
  $("#duration-field").classList.toggle("hidden", input.value !== "countdown" || !input.checked);
}));

function activityElapsed(activity) {
  return Math.max(0, (Number(activity.elapsed) || 0) + (activity.running ? Math.floor((Date.now() - activity.startedAt) / 1000) : 0));
}
function phaseLength(activity) {
  return activity.mode === "cycle" ? (activity.phase === "break" ? data.settings.breakMinutes : data.settings.focusMinutes) * 60 : activity.targetSeconds;
}
function pauseActivity(activity) {
  if (!activity.running) return;
  activity.elapsed = activityElapsed(activity);
  activity.running = false;
  activity.startedAt = null;
}
function recordSession(activity, seconds, endedAt = isoNow()) {
  if (seconds < 1) return;
  data.sessions.push({ id: uid(), activityId: activity.id, title: activity.title, tagId: activity.tagId,
    tagName: tagName(activity.tagId), taskId: activity.taskId || "", seconds: Math.round(seconds),
    startedAt: new Date(new Date(endedAt).getTime() - seconds * 1000).toISOString(), endedAt });
}
function renderSessions() {
  const selected = $("#session-filter").value || "all";
  const keys = new Set(data.tags.map((tag) => tag.id));
  data.sessions.forEach((session) => keys.add(summaryTagKey(session)));
  const options = document.createDocumentFragment();
  options.append(new Option("所有标签", "all"));
  for (const key of keys) options.append(new Option(summaryTagInfo(key).name, key));
  $("#session-filter").replaceChildren(options);
  $("#session-filter").value = keys.has(selected) ? selected : "all";
  const sessions = [...data.sessions].filter((session) => $("#session-filter").value === "all" || summaryTagKey(session) === $("#session-filter").value)
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  const fragment = document.createDocumentFragment();
  for (const session of sessions) {
    const row = make("div", "record-row");
    const main = make("div", "record-row-main");
    const endTime = new Date(session.endedAt).getTime();
    const startedAt = session.startedAt || (Number.isFinite(endTime) ? new Date(endTime - session.seconds * 1000).toISOString() : "");
    main.append(make("strong", "", `${session.title || "专注记录"} · ${tagName(session.tagId, session.tagName || "未分类")}${session.manual ? " · 补记" : ""}`),
      make("span", "", `${localDateTime(startedAt)} 至 ${localDateTime(session.endedAt)}`));
    row.append(main, make("strong", "record-duration", secondsText(session.seconds)),
      iconButton("trash-2", "删除计时记录", "delete-session", session.id));
    fragment.append(row);
  }
  $("#session-list").replaceChildren(fragment);
  if (!sessions.length) $("#session-list").append(make("p", "empty-text", data.sessions.length ? "没有这个标签的记录" : "完成计时后，记录会显示在这里"));
}
$("#session-filter").addEventListener("change", renderSessions);
function resetManualSessionTimes() {
  const now = new Date();
  $("#manual-end").value = localInputDateTime(now);
  $("#manual-start").value = localInputDateTime(new Date(now.getTime() - 30 * 60000));
}
resetManualSessionTimes();
$("#manual-session-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#manual-title").value.trim();
  const start = new Date($("#manual-start").value);
  const end = new Date($("#manual-end").value);
  const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
  if (!title) { toast("请填写做了什么"); return; }
  if (!Number.isFinite(seconds) || seconds < 60 || seconds > 86400) { toast("补记时长需在 1 分钟到 24 小时之间"); return; }
  if (end.getTime() > Date.now() + 60000) { toast("结束时间不能晚于现在"); return; }
  const tagId = $("#manual-tag").value;
  data.sessions.push({ id: uid(), activityId: "", title, tagId, tagName: tagName(tagId),
    taskId: $("#manual-task").value, seconds, startedAt: start.toISOString(), endedAt: end.toISOString(), manual: true });
  $("#manual-session-form").reset();
  resetManualSessionTimes();
  save(); renderTop(); renderSummary(); toast("这段时间已补记");
});
$("#session-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete-session']");
  if (!button || !confirm("确定删除这条计时记录吗？")) return;
  data.sessions = data.sessions.filter((session) => session.id !== button.dataset.id);
  save(); renderTop(); renderSummary();
});
function completeActivity(activity, seconds = activityElapsed(activity), endedAt = isoNow()) {
  if (activity.mode !== "cycle" || activity.phase === "focus") recordSession(activity, activity.mode === "countdown" ? Math.min(seconds, activity.targetSeconds) : seconds, endedAt);
  activity.elapsed = Math.min(seconds, phaseLength(activity) || seconds);
  activity.running = false;
  activity.startedAt = null;
  activity.completedAt = endedAt;
  save(); renderActivities(); renderTop(); renderSummary();
}
function advanceActivities() {
  let changed = false;
  for (const activity of data.activities) {
    if (!activity.running || activity.completedAt || activity.mode === "stopwatch") continue;
    if (activity.mode === "countdown" && activityElapsed(activity) >= activity.targetSeconds) {
      const endedAt = new Date(activity.startedAt + (activity.targetSeconds - activity.elapsed) * 1000).toISOString();
      completeActivity(activity, activity.targetSeconds, endedAt);
      changed = true;
      continue;
    }
    if (activity.mode !== "cycle") continue;
    let transitions = 0;
    while (activityElapsed(activity) >= phaseLength(activity) && transitions < 24) {
      const length = phaseLength(activity);
      const phaseEnd = activity.startedAt + (length - activity.elapsed) * 1000;
      if (activity.phase === "focus") recordSession(activity, length, new Date(phaseEnd).toISOString());
      activity.phase = activity.phase === "focus" ? "break" : "focus";
      activity.elapsed = 0;
      activity.startedAt = phaseEnd;
      transitions += 1;
    }
    if (transitions >= 24) { pauseActivity(activity); activity.elapsed = 0; toast("长时间未操作，计时已暂停"); }
    if (transitions > 0) changed = true;
  }
  if (changed) { save(); renderActivities(); renderTop(); renderSummary(); }
}
function activityClock(activity) {
  const elapsed = activityElapsed(activity);
  if (activity.mode === "countdown") return secondsText(Math.max(0, activity.targetSeconds - elapsed));
  return secondsText(activity.mode === "cycle" ? Math.min(elapsed, phaseLength(activity)) : elapsed);
}
function activityProgress(activity) {
  if (activity.mode === "stopwatch") return 0;
  const length = phaseLength(activity);
  return length ? Math.min(100, activityElapsed(activity) / length * 100) : 0;
}
function activityLabel(activity) {
  if (activity.mode === "cycle") return activity.phase === "break" ? "休息中" : "专注中";
  return activity.mode === "countdown" ? "倒计时" : "正计时";
}
function renderActivities() {
  const fragment = document.createDocumentFragment();
  const activities = [...data.activities].sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || b.createdAt.localeCompare(a.createdAt));
  for (const activity of activities) {
    const card = make("article", `activity-card${activity.completedAt ? " completed" : ""}`);
    card.dataset.id = activity.id;
    card.style.setProperty("--tag-color", tagColor(activity.tagId));
    const head = make("div", "activity-head");
    const info = make("div");
    info.append(make("h3", "", activity.title));
    const meta = make("div", "activity-meta");
    const tag = make("span", "activity-tag");
    tag.append(make("i"), document.createTextNode(tagName(activity.tagId)));
    meta.append(tag, make("span", "", activity.kind === "parallel" ? "并行" : "独行"), make("span", "phase-label", activityLabel(activity)));
    const linkedTask = taskFor(activity.taskId);
    if (linkedTask) meta.append(make("span", "", `关联：${linkedTask.title}`));
    info.append(meta);
    const clock = make("div", "activity-clock");
    clock.append(make("span", "activity-clock-value", activityClock(activity)));
    if (activity.mode !== "stopwatch") clock.append(make("small", "", activity.mode === "cycle" ? `目标 ${secondsText(phaseLength(activity))}` : `目标 ${secondsText(activity.targetSeconds)}`));
    head.append(info, clock);
    card.append(head);
    if (activity.mode !== "stopwatch") {
      const progress = make("div", "activity-progress");
      const bar = make("span");
      bar.style.width = `${activityProgress(activity)}%`;
      progress.append(bar);
      card.append(progress);
    }
    const actions = make("div", "activity-actions");
    if (!activity.completedAt) {
      const toggle = make("button", "secondary-button", activity.running ? "暂停" : "开始");
      toggle.type = "button"; toggle.dataset.action = "toggle-activity"; toggle.dataset.id = activity.id;
      const image = make("img"); image.src = `icons/${activity.running ? "pause" : "play"}.svg`; image.alt = "";
      toggle.prepend(image);
      const finish = make("button", "text-button", "完成");
      finish.type = "button"; finish.dataset.action = "finish-activity"; finish.dataset.id = activity.id;
      actions.append(toggle, finish);
    } else actions.append(make("span", "small-note", `完成于 ${localDateTime(activity.completedAt)}`));
    actions.append(make("span", "spacer"), iconButton("trash-2", "删除活动", "delete-activity", activity.id));
    card.append(actions);
    fragment.append(card);
  }
  $("#activity-list").replaceChildren(fragment);
  $("#activity-count").textContent = `${data.activities.filter((activity) => !activity.completedAt).length} 项进行中`;
  $("#activity-empty").classList.toggle("hidden", activities.length > 0);
}
function updateActivityDisplays() {
  for (const activity of data.activities) {
    if (!activity.running) continue;
    const card = [...document.querySelectorAll(".activity-card")].find((item) => item.dataset.id === activity.id);
    if (!card) continue;
    card.querySelector(".activity-clock-value").textContent = activityClock(activity);
    const bar = card.querySelector(".activity-progress>span");
    if (bar) bar.style.width = `${activityProgress(activity)}%`;
  }
}
$("#activity-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#activity-title").value.trim();
  if (!title) return;
  const mode = $('input[name="timer-mode"]:checked').value;
  const duration = Number($("#activity-duration").value);
  if (mode === "countdown" && (!Number.isInteger(duration) || duration < 1 || duration > 480)) { toast("倒计时需设为 1 到 480 分钟"); return; }
  data.activities.push({ id: uid(), title, tagId: $("#activity-tag").value, taskId: $("#activity-task").value, mode,
    kind: $('input[name="timer-kind"]:checked').value, targetSeconds: mode === "countdown" ? duration * 60 : 0,
    phase: "focus", elapsed: 0, running: false, startedAt: null, createdAt: isoNow(), completedAt: null });
  $("#activity-title").value = "";
  $("#activity-task").value = "";
  save(); renderActivities(); toast("活动已创建");
});
function startFocusForTask(task) {
  if (!task) { showView("todos"); $("#todo-title").focus(); return; }
  let activity = data.activities.find((item) => !item.completedAt && item.taskId === task.id && item.mode === "cycle");
  if (!activity) {
    activity = { id: uid(), title: task.title, tagId: $("#activity-tag").value || data.tags[0]?.id || "",
      taskId: task.id, mode: "cycle", kind: "solo", targetSeconds: 0, phase: "focus",
      elapsed: 0, running: false, startedAt: null, createdAt: isoNow(), completedAt: null };
    data.activities.push(activity);
  }
  if (!activity.running) {
    for (const other of data.activities) if (other.running && other.id !== activity.id) pauseActivity(other);
    activity.running = true;
    activity.startedAt = Date.now();
  }
  save(); renderActivities(); showView("timer");
  document.querySelector(`.activity-card[data-id="${activity.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  toast(`开始专注：${task.title}`);
}
$("#route-start").addEventListener("click", () => startFocusForTask(taskFor($("#route-start").dataset.taskId)));
$("#activity-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const activity = data.activities.find((item) => item.id === button.dataset.id);
  if (!activity) return;
  if (button.dataset.action === "toggle-activity") {
    advanceActivities();
    if (activity.running) pauseActivity(activity);
    else {
      for (const other of data.activities) {
        if (other.running && (activity.kind === "solo" || other.kind === "solo")) pauseActivity(other);
      }
      activity.running = true;
      activity.startedAt = Date.now();
    }
    save(); renderActivities();
  } else if (button.dataset.action === "finish-activity") {
    advanceActivities(); completeActivity(activity);
    toast("活动已完成，海里多了一条小鱼");
  } else if (button.dataset.action === "delete-activity" && confirm(`确定删除“${activity.title}”吗？已有计时记录会保留。`)) {
    data.activities = data.activities.filter((item) => item.id !== activity.id);
    save(); renderActivities();
  }
});

function renderWater() {
  const today = dayKey();
  const amount = data.water.filter((entry) => entry.date === today).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  $("#water-progress-text").textContent = `${amount} / ${data.settings.waterGoal} ml`;
  $("#water-meter-fill").style.width = `${Math.min(100, amount / data.settings.waterGoal * 100)}%`;
  $("#undo-water").disabled = !data.water.some((entry) => entry.date === today);
  renderRoute();
}
$("#add-water").addEventListener("click", () => {
  data.water.push({ id: uid(), date: dayKey(), amount: data.settings.waterCup, at: isoNow() });
  data.lastWaterPromptAt = Date.now();
  save(); renderWater(); toast(`已记录 ${data.settings.waterCup} ml`);
});
$("#undo-water").addEventListener("click", () => {
  let last = -1;
  for (let index = data.water.length - 1; index >= 0; index -= 1) {
    if (data.water[index].date === dayKey()) { last = index; break; }
  }
  if (last < 0) return;
  data.water.splice(last, 1);
  save(); renderWater();
});

function todoMeta(task) {
  const meta = make("div", "todo-item-meta");
  if (task.due) {
    const due = make("span", task.due < dayKey() && !task.completed ? "overdue" : "", `截止 ${task.due}`);
    meta.append(due);
  }
  if (task.remind) meta.append(make("span", "", `提醒 ${task.remind.replace("T", " ")}`));
  if (task.note) meta.append(make("span", "", task.note));
  const focusSeconds = data.sessions.filter((session) => session.taskId === task.id).reduce((sum, session) => sum + Number(session.seconds || 0), 0);
  if (focusSeconds > 0) meta.append(make("span", "todo-focus-time", `专注 ${minutesText(focusSeconds)}`));
  return meta;
}
function renderTodos() {
  for (const quadrant of QUADRANTS) {
    const list = document.querySelector(`#list-${quadrant}`);
    const tasks = data.tasks.filter((task) => task.quadrant === quadrant).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.due || "9999").localeCompare(b.due || "9999") || b.createdAt.localeCompare(a.createdAt));
    const fragment = document.createDocumentFragment();
    for (const task of tasks) {
      const item = make("li", `todo-item${task.completed ? " completed" : ""}`);
      item.dataset.id = task.id;
      const check = make("input");
      check.type = "checkbox"; check.checked = task.completed;
      check.setAttribute("aria-label", `${task.completed ? "取消完成" : "完成"}：${task.title}`);
      const body = make("div", "todo-item-main");
      body.append(make("div", "todo-item-title", task.title), todoMeta(task));
      item.append(check, body);
      if (!task.completed) item.append(iconButton("play", "开始专注", "focus-todo", task.id));
      item.append(iconButton("pencil", "编辑待办", "edit-todo", task.id), iconButton("trash-2", "删除待办", "delete-todo", task.id));
      fragment.append(item);
    }
    list.replaceChildren(fragment);
    $(`#count-${quadrant}`).textContent = tasks.filter((task) => !task.completed).length;
  }
  $("#completed-today").textContent = data.tasks.filter((task) => task.completed && dayKey(task.completedAt) === dayKey()).length;
  renderActivityTasks();
  renderWater();
}
function clearTodoForm() {
  editingTodoId = null;
  $("#todo-form").reset();
  $("#todo-submit").textContent = "添加待办";
  $("#todo-cancel").classList.add("hidden");
}
$("#todo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#todo-title").value.trim();
  if (!title) return;
  const fields = { title, quadrant: $("#todo-quadrant").value, due: $("#todo-due").value,
    remind: $("#todo-remind").value, note: $("#todo-note").value.trim(), notified: false };
  if (editingTodoId) {
    const task = data.tasks.find((item) => item.id === editingTodoId);
    if (task) Object.assign(task, fields);
  } else data.tasks.push({ id: uid(), ...fields, completed: false, createdAt: isoNow(), completedAt: null });
  clearTodoForm(); save(); renderTodos(); renderCalendar(); toast("待办已保存");
});
$("#todo-cancel").addEventListener("click", clearTodoForm);
$("#view-todos").addEventListener("change", (event) => {
  if (!event.target.matches(".todo-item input[type='checkbox']")) return;
  const task = data.tasks.find((item) => item.id === event.target.closest(".todo-item").dataset.id);
  if (!task) return;
  task.completed = event.target.checked;
  task.completedAt = task.completed ? isoNow() : null;
  save(); renderTodos(); renderTop(); renderSummary(); renderCalendar();
  if (task.completed) toast("完成一件事，海里多了一只小水母");
});
$("#view-todos").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const task = data.tasks.find((item) => item.id === button.dataset.id);
  if (!task) return;
  if (button.dataset.action === "focus-todo") {
    startFocusForTask(task);
  } else if (button.dataset.action === "edit-todo") {
    editingTodoId = task.id;
    $("#todo-title").value = task.title;
    $("#todo-quadrant").value = task.quadrant;
    $("#todo-due").value = task.due || "";
    $("#todo-remind").value = task.remind || "";
    $("#todo-note").value = task.note || "";
    $("#todo-submit").textContent = "保存修改";
    $("#todo-cancel").classList.remove("hidden");
    $("#todo-title").focus();
  } else if (button.dataset.action === "delete-todo" && confirm(`确定删除“${task.title}”吗？`)) {
    data.tasks = data.tasks.filter((item) => item.id !== task.id);
    if (editingTodoId === task.id) clearTodoForm();
    save(); renderTodos(); renderTop(); renderSummary(); renderCalendar();
  }
});

function showNotice(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body }); return; } catch { /* Fall back to the in-page notice. */ }
  }
  toast(`${title}：${body}`);
}
function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const task of data.tasks) {
    const when = task.remind ? new Date(task.remind).getTime() : NaN;
    if (!task.completed && !task.notified && Number.isFinite(when) && when <= now) {
      task.notified = true;
      showNotice("待办提醒", task.title);
      changed = true;
    }
  }
  if (data.settings.waterRemind && new Date().getHours() >= 8 && new Date().getHours() < 22 &&
      now - data.lastWaterPromptAt >= data.settings.waterInterval * 60000) {
    data.lastWaterPromptAt = now;
    showNotice("喝水提醒", "记得喝一杯水");
    changed = true;
  }
  if (changed) save();
}

function renderRecordList(selector, items, describe) {
  const container = $(selector);
  if (!items.length) { container.replaceChildren(make("p", "empty-text", "暂无记录")); return; }
  const fragment = document.createDocumentFragment();
  for (const item of [...items].sort((a, b) => (b.date || b.start || "").localeCompare(a.date || a.start || ""))) {
    const row = make("div", "record-row");
    const body = make("div", "record-row-main");
    const [title, subtitle] = describe(item);
    body.append(make("strong", "", title), make("span", "", subtitle));
    row.append(body, iconButton("trash-2", "删除记录", "delete-record", item.id));
    row.dataset.collection = selector.slice(1).replace("-list", "");
    fragment.append(row);
  }
  container.replaceChildren(fragment);
}
function renderWeightChart() {
  const container = $("#weight-chart");
  const records = [...data.body].sort((a, b) => a.date.localeCompare(b.date));
  const latest = records.at(-1);
  $("#body-latest").textContent = latest ? `最近 ${latest.weight} kg` : "";
  if (!records.length) {
    container.setAttribute("aria-label", "暂无体重记录");
    container.replaceChildren(make("p", "empty-text", "记录体重后，变化会显示在这里"));
    return;
  }
  container.setAttribute("aria-label", `${records.length} 次体重记录，最近 ${latest.weight} 千克`);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 600 220");
  svg.setAttribute("aria-hidden", "true");
  const add = (tag, attributes) => {
    const element = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    svg.append(element);
    return element;
  };
  const weights = records.map((item) => item.weight);
  const min = Math.floor(Math.min(...weights) - 1);
  const max = Math.ceil(Math.max(...weights) + 1);
  const firstTime = new Date(`${records[0].date}T12:00:00`).getTime();
  const lastTime = new Date(`${latest.date}T12:00:00`).getTime();
  const points = records.map((item, index) => {
    const time = new Date(`${item.date}T12:00:00`).getTime();
    const x = lastTime > firstTime ? 45 + (time - firstTime) / (lastTime - firstTime) * 515 :
      45 + (records.length === 1 ? .5 : index / (records.length - 1)) * 515;
    return { x, y: 174 - (item.weight - min) / (max - min) * 135, item };
  });
  for (let index = 0; index < 4; index += 1) {
    const y = 39 + index * 45;
    add("line", { x1: 45, y1: y, x2: 560, y2: y, class: "weight-grid-line" });
  }
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  add("path", { d: `${path} L${points.at(-1).x.toFixed(1)} 174 L${points[0].x.toFixed(1)} 174 Z`, class: "weight-area" });
  add("path", { d: path, class: "weight-line" });
  for (const point of points) {
    const circle = add("circle", { cx: point.x, cy: point.y, r: 5, class: "weight-point" });
    const label = document.createElementNS(ns, "title");
    label.textContent = `${point.item.date}：${point.item.weight} kg`;
    circle.append(label);
  }
  for (const [x, y, value, anchor] of [
    [36, 42, `${max} kg`, "end"], [36, 177, `${min} kg`, "end"],
    [45, 210, records[0].date.slice(5), "start"], [560, 210, latest.date.slice(5), "end"],
  ]) {
    const label = add("text", { x, y, "text-anchor": anchor, class: "weight-chart-label" });
    label.textContent = value;
  }
  container.replaceChildren(svg);
}
function renderHealth() {
  renderWeightChart();
  $("#body-height").value = data.settings.heightCm || "";
  $("#body-height-note").textContent = data.settings.heightCm ? `已保存 ${data.settings.heightCm} cm` : "";
  renderRecordList("#body-list", data.body, (item) => [`${item.weight} kg${item.height ? ` · 身高 ${item.height} cm` : ""}`, item.date]);
  renderRecordList("#meal-list", data.meals, (item) => [`${item.type} · ${item.text}`, item.date]);
  renderRecordList("#exercise-list", data.exercises, (item) => [`${item.name} · ${item.minutes} 分钟`, item.date]);
  renderRecordList("#period-list", data.periods, (item) => [`${item.start} 至 ${item.end}`, "经期记录"]);
}
for (const id of ["body-date", "meal-date", "exercise-date", "period-start", "period-end"]) $(`#${id}`).value = dayKey();
$("#height-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const height = Number($("#body-height").value);
  if (!Number.isFinite(height) || height < 50 || height > 250) { toast("请填写 50 到 250 cm 的身高"); return; }
  data.settings.heightCm = height;
  save(); renderHealth(); toast("身高已保存");
});
$("#body-form").addEventListener("submit", (event) => {
  event.preventDefault();
  data.body.push({ id: uid(), date: $("#body-date").value, height: data.settings.heightCm, weight: Number($("#body-weight").value) });
  save(); renderHealth(); $("#body-form").reset(); $("#body-date").value = dayKey(); toast("体重已记录");
});
$("#meal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("#meal-text").value.trim();
  if (!text) return;
  data.meals.push({ id: uid(), date: $("#meal-date").value, type: $("#meal-type").value, text });
  save(); renderHealth(); $("#meal-form").reset(); $("#meal-date").value = dayKey();
});
$("#exercise-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#exercise-name").value.trim();
  if (!name) return;
  data.exercises.push({ id: uid(), date: $("#exercise-date").value, name, minutes: Number($("#exercise-minutes").value) });
  save(); renderHealth(); $("#exercise-form").reset(); $("#exercise-date").value = dayKey();
});
$("#period-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const start = $("#period-start").value;
  const end = $("#period-end").value;
  if (end < start) { toast("结束日期不能早于开始日期"); return; }
  data.periods.push({ id: uid(), start, end });
  save(); renderHealth(); $("#period-form").reset(); $("#period-start").value = dayKey(); $("#period-end").value = dayKey();
});
$("#view-health").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete-record']");
  if (!button || !confirm("确定删除这条记录吗？")) return;
  const collection = button.closest(".record-row").dataset.collection;
  if (!["body", "meal", "exercise", "period"].includes(collection)) return;
  const key = { body: "body", meal: "meals", exercise: "exercises", period: "periods" }[collection];
  data[key] = data[key].filter((item) => item.id !== button.dataset.id);
  save(); renderHealth();
});

function renderMood() {
  const today = dayKey();
  const entry = data.moods.find((item) => item.date === today);
  selectedMood = entry?.mood || selectedMood;
  $("#mood-date-label").textContent = today;
  document.querySelectorAll("#mood-options button").forEach((button) => button.classList.toggle("active", button.dataset.mood === selectedMood));
  $("#mood-message").textContent = selectedMood ? MOODS[selectedMood]?.message || "" : "";
  $("#diary-text").value = entry?.note || "";
  const fragment = document.createDocumentFragment();
  for (const item of [...data.moods].sort((a, b) => b.date.localeCompare(a.date))) {
    const mood = MOODS[item.mood] || MOODS.calm;
    const row = make("div", "record-row");
    const main = make("div", "record-row-main");
    main.append(make("strong", "", `${mood.icon} ${mood.name} · ${item.date}`), make("span", "", item.note || "没有写日记"));
    row.append(main, iconButton("trash-2", "删除心情记录", "delete-mood", item.id));
    fragment.append(row);
  }
  $("#mood-history-list").replaceChildren(fragment);
  if (!data.moods.length) $("#mood-history-list").append(make("p", "empty-text", "心情足迹会留在这里"));
}
$("#mood-options").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mood]");
  if (!button) return;
  selectedMood = button.dataset.mood;
  document.querySelectorAll("#mood-options button").forEach((item) => item.classList.toggle("active", item === button));
  $("#mood-message").textContent = MOODS[selectedMood].message;
});
$("#save-mood").addEventListener("click", () => {
  if (!selectedMood) { toast("先选一种今天的心情"); return; }
  const today = dayKey();
  const note = $("#diary-text").value.trim();
  const existing = data.moods.find((item) => item.date === today);
  if (existing) Object.assign(existing, { mood: selectedMood, note });
  else data.moods.push({ id: uid(), date: today, mood: selectedMood, note });
  save(); renderMood(); renderSummary(); toast("今天的心情已保存");
});
$("#mood-history-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete-mood']");
  if (!button || !confirm("确定删除这天的心情和日记吗？")) return;
  data.moods = data.moods.filter((item) => item.id !== button.dataset.id);
  if (!data.moods.some((item) => item.date === dayKey())) selectedMood = null;
  save(); renderMood(); renderSummary();
});

function summaryTagKey(session) { return tagFor(session.tagId) ? session.tagId : `archived:${session.tagName || "未分类"}`; }
function summaryTagInfo(key) {
  if (key.startsWith("archived:")) return { name: key.slice(9), color: "#8ba6b5" };
  return tagFor(key) || { name: "未分类", color: "#8ba6b5" };
}
function renderTrend(sessions, bounds) {
  const labels = summaryPeriod === "week" ? ["一", "二", "三", "四", "五", "六", "日"] :
    summaryPeriod === "month" ? ["第1周", "第2周", "第3周", "第4周", "第5周"] :
    Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const values = labels.map(() => 0);
  for (const session of sessions) {
    const date = new Date(session.endedAt);
    let index;
    if (summaryPeriod === "year") index = date.getMonth();
    else index = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - bounds.start) / 86400000 / (summaryPeriod === "month" ? 7 : 1));
    if (index >= 0 && index < values.length) values[index] += Number(session.seconds) || 0;
  }
  const max = Math.max(1, ...values);
  const fragment = document.createDocumentFragment();
  values.forEach((value, index) => {
    const column = make("div", "trend-col");
    column.title = `${labels[index]}：${minutesText(value)}`;
    const bar = make("div", "trend-bar");
    bar.style.height = `${Math.max(2, value / max * 165)}px`;
    column.append(bar, make("span", "", labels[index]));
    fragment.append(column);
  });
  $("#trend-chart").replaceChildren(fragment);
}
function renderSummary() {
  const bounds = periodBounds();
  const sessions = data.sessions.filter((session) => withinPeriod(session.endedAt, bounds));
  const tasks = data.tasks.filter((task) => task.completed && withinPeriod(task.completedAt, bounds));
  const moods = data.moods.filter((item) => item.date >= dayKey(bounds.start) && item.date < dayKey(bounds.end));
  const totals = new Map(data.tags.map((tag) => [tag.id, 0]));
  for (const session of sessions) {
    const key = summaryTagKey(session);
    if (!totals.has(key)) totals.set(key, 0);
    if (!knownSummaryTags.has(key)) { knownSummaryTags.add(key); visibleTags.add(key); }
    totals.set(key, totals.get(key) + (Number(session.seconds) || 0));
  }
  const shown = [...totals].filter(([key, seconds]) => visibleTags.has(key) && seconds > 0);
  const total = shown.reduce((sum, [, seconds]) => sum + seconds, 0);
  $("#summary-total").textContent = minutesText(total);
  let position = 0;
  const slices = [];
  for (const [key, seconds] of shown) {
    const next = position + seconds / total * 100;
    slices.push(`${summaryTagInfo(key).color} ${position}% ${next}%`);
    position = next;
  }
  $("#time-pie").style.background = slices.length ? `conic-gradient(${slices.join(",")})` : "#dce8ee";
  $("#time-pie").setAttribute("aria-label", total ? `专注时间分布，共${minutesText(total)}` : "暂无专注时间记录");
  const legend = document.createDocumentFragment();
  for (const [key, seconds] of totals) {
    const info = summaryTagInfo(key);
    const label = make("label");
    const check = make("input");
    check.type = "checkbox"; check.checked = visibleTags.has(key); check.dataset.tag = key;
    const swatch = make("span", "legend-swatch"); swatch.style.background = info.color;
    label.append(check, swatch, document.createTextNode(info.name), make("strong", "", minutesText(seconds)));
    legend.append(label);
  }
  $("#pie-legend").replaceChildren(legend);
  renderTrend(sessions, bounds);
  renderOcean($("#summary-ocean"), sessions, tasks);
  $("#creature-summary").textContent = `${sessions.length} 条小鱼 · ${tasks.length} 只水母`;
  const moodCounts = Object.keys(MOODS).map((key) => [key, moods.filter((item) => item.mood === key).length]);
  const moodFragment = document.createDocumentFragment();
  for (const [key, count] of moodCounts) {
    const row = make("div", "mood-summary-row");
    row.append(make("span", "", `${MOODS[key].icon} ${MOODS[key].name}`));
    const track = make("div");
    const fill = make("span"); fill.style.width = `${moods.length ? count / moods.length * 100 : 0}%`;
    track.append(fill);
    row.append(track, make("strong", "", String(count)));
    moodFragment.append(row);
  }
  $("#mood-summary").replaceChildren(moodFragment);
  $("#todo-summary").textContent = `完成待办 ${tasks.length} 件 · 记录心情 ${moods.length} 天`;
  const doneList = document.createDocumentFragment();
  for (const task of [...tasks].sort((a, b) => b.completedAt.localeCompare(a.completedAt))) {
    const row = make("div", "summary-todo-row");
    row.append(make("span", "", task.title), make("small", "", dayKey(task.completedAt)));
    doneList.append(row);
  }
  $("#summary-todos").replaceChildren(doneList);
  $("#review-period").textContent = `${dayKey(bounds.start)} 至 ${dayKey(new Date(bounds.end.getTime() - 86400000))}`;
  if (lastReviewKey !== bounds.key) {
    const review = data.reviews.find((item) => item.key === bounds.key);
    $("#review-text").value = review?.text || "";
    lastReviewKey = bounds.key;
  }
}
$("#pie-legend").addEventListener("change", (event) => {
  if (!event.target.matches("input[data-tag]")) return;
  if (event.target.checked) visibleTags.add(event.target.dataset.tag);
  else visibleTags.delete(event.target.dataset.tag);
  renderSummary();
});
document.querySelectorAll(".period-button").forEach((button) => button.addEventListener("click", () => {
  summaryPeriod = button.dataset.period;
  document.querySelectorAll(".period-button").forEach((item) => item.classList.toggle("active", item === button));
  renderSummary();
}));
$("#save-review").addEventListener("click", () => {
  const bounds = periodBounds();
  const text = $("#review-text").value.trim();
  const current = data.reviews.find((item) => item.key === bounds.key);
  if (current) current.text = text;
  else data.reviews.push({ id: uid(), key: bounds.key, text, createdAt: isoNow() });
  save(); toast("总结已保存");
});

function eventsOn(date) { return data.events.filter((event) => event.date === date).sort((a, b) => (a.start || "00:00").localeCompare(b.start || "00:00")); }
function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $("#calendar-month").textContent = `${year} 年 ${month + 1} 月`;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = dayKey(date);
    const day = make("button", `calendar-day${date.getMonth() !== month ? " other-month" : ""}${key === selectedDay ? " selected" : ""}${key === dayKey() ? " today" : ""}`);
    day.type = "button";
    day.dataset.date = key;
    day.append(make("span", "day-number", String(date.getDate())));
    const markers = [
      ...eventsOn(key).map((event) => ({ title: event.title, className: "" })),
      ...data.tasks.filter((task) => task.due === key && !task.completed).map((task) => ({ title: task.title, className: "task" })),
    ];
    markers.slice(0, 2).forEach((marker) => day.append(make("span", `day-marker ${marker.className}`, marker.title)));
    if (markers.length > 2) day.append(make("span", "day-marker", `还有 ${markers.length - 2} 项`));
    fragment.append(day);
  }
  $("#calendar-grid").replaceChildren(fragment);
  $("#selected-day-title").textContent = `${selectedDay} 日程`;
  $("#event-date").value = selectedDay;
  const list = document.createDocumentFragment();
  for (const event of eventsOn(selectedDay)) {
    const row = make("div", "record-row");
    const body = make("div", "record-row-main");
    body.append(make("strong", "", event.title), make("span", "", `${event.start || "全天"}${event.end ? ` - ${event.end}` : ""}${event.note ? ` · ${event.note}` : ""}`));
    row.append(body, iconButton("trash-2", "删除日程", "delete-event", event.id));
    list.append(row);
  }
  for (const task of data.tasks.filter((item) => item.due === selectedDay && !item.completed)) {
    const row = make("div", "record-row");
    const body = make("div", "record-row-main");
    body.append(make("strong", "", task.title), make("span", "", `待办 · ${QUADRANT_NAMES[task.quadrant] || "重要不紧急"}`));
    row.append(body);
    list.append(row);
  }
  $("#day-events").replaceChildren(list);
  if (!$("#day-events").children.length) $("#day-events").append(make("p", "empty-text", "这一天还没有安排"));
}
$("#calendar-grid").addEventListener("click", (event) => {
  const day = event.target.closest("button[data-date]");
  if (!day) return;
  selectedDay = day.dataset.date;
  const date = new Date(`${selectedDay}T12:00:00`);
  calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar();
});
$("#calendar-prev").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$("#calendar-next").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$("#calendar-today").addEventListener("click", () => { selectedDay = dayKey(); calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCalendar(); });
$("#event-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#event-title").value.trim();
  const date = $("#event-date").value;
  const start = $("#event-start").value;
  const end = $("#event-end").value;
  if (!title || !date) return;
  if (start && end && end <= start) { toast("结束时间应晚于开始时间"); return; }
  data.events.push({ id: uid(), title, date, start, end, note: $("#event-note").value.trim(), sourceKey: "" });
  selectedDay = date;
  const selected = new Date(`${date}T12:00:00`);
  calendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  $("#event-form").reset();
  save(); renderCalendar(); toast("日程已添加");
});
$("#day-events").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete-event']");
  if (!button || !confirm("确定删除这条日程吗？")) return;
  data.events = data.events.filter((item) => item.id !== button.dataset.id);
  save(); renderCalendar();
});

function icalFields(time) {
  if (time.isDate) return { date: `${time.year}-${pad(time.month)}-${pad(time.day)}`, clock: "" };
  const date = time.toJSDate();
  return { date: dayKey(date), clock: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}
function importIcs(text) {
  if (!window.ICAL) throw new Error("日历解析器未加载");
  const root = new ICAL.Component(ICAL.parse(text));
  const components = root.name === "vcalendar" ? root.getAllSubcomponents("vevent") : [];
  if (!components.length) throw new Error("文件中没有日程");
  const existing = new Set(data.events.map((event) => event.sourceKey).filter(Boolean));
  const imported = [];
  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 2);
  for (const component of components) {
    const event = new ICAL.Event(component);
    const addOccurrence = (startTime, endTime, suffix) => {
      const start = icalFields(startTime);
      const end = endTime ? icalFields(endTime) : { clock: "" };
      const sourceKey = `${event.uid || event.summary}|${suffix}`;
      if (existing.has(sourceKey)) return;
      existing.add(sourceKey);
      imported.push({ id: uid(), title: event.summary || "未命名日程", date: start.date, start: start.clock,
        end: end.clock, note: event.description || "", sourceKey });
    };
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next;
      let count = 0;
      const earliest = new Date();
      earliest.setFullYear(earliest.getFullYear() - 1);
      while ((next = iterator.next()) && count < 12000) {
        count += 1;
        if (next.toJSDate() > horizon) break;
        if (next.toJSDate() < earliest) continue;
        const details = event.getOccurrenceDetails(next);
        addOccurrence(details.startDate, details.endDate, next.toString());
      }
    } else addOccurrence(event.startDate, event.endDate, event.startDate.toString());
  }
  data.events.push(...imported);
  save(); renderCalendar();
  return imported.length;
}
$("#ics-import").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try { toast(`已导入 ${importIcs(await file.text())} 条日程`); }
  catch (error) { toast(`导入失败：${error.message}`); }
  finally { event.target.value = ""; }
});

function renderSettings() {
  $("#setting-focus").value = data.settings.focusMinutes;
  $("#setting-break").value = data.settings.breakMinutes;
  $("#setting-water-goal").value = data.settings.waterGoal;
  $("#setting-water-cup").value = data.settings.waterCup;
  $("#setting-water-interval").value = data.settings.waterInterval;
  $("#setting-water-remind").checked = data.settings.waterRemind;
  $("#notification-button").textContent = "";
  const image = make("img"); image.src = "icons/bell.svg"; image.alt = "";
  $("#notification-button").append(image, document.createTextNode(
    "Notification" in window && Notification.permission === "granted" ? "浏览器通知已开启" : "允许浏览器通知"));
  $("#backup-last").textContent = data.lastExportAt ? `上次导出备份：${localDateTime(data.lastExportAt)}` : "还没有导出过备份";
  renderInstallState();
}
$("#save-settings").addEventListener("click", () => {
  const fields = [
    ["focusMinutes", "#setting-focus", 1, 180], ["breakMinutes", "#setting-break", 1, 60],
    ["waterGoal", "#setting-water-goal", 100, 10000], ["waterCup", "#setting-water-cup", 50, 2000],
    ["waterInterval", "#setting-water-interval", 15, 480],
  ];
  const next = { ...data.settings };
  for (const [key, selector, min, max] of fields) {
    const value = Number($(selector).value);
    if (!Number.isInteger(value) || value < min || value > max) { toast(`请检查${$(selector).closest("label").textContent}的数值`); return; }
    next[key] = value;
  }
  next.waterRemind = $("#setting-water-remind").checked;
  advanceActivities();
  for (const activity of data.activities.filter((item) => item.mode === "cycle" && !item.completedAt)) {
    pauseActivity(activity);
    activity.elapsed = Math.min(activity.elapsed, (activity.phase === "break" ? next.breakMinutes : next.focusMinutes) * 60);
  }
  data.settings = next;
  data.lastWaterPromptAt = Date.now();
  save(); renderActivities(); renderWater(); toast("设置已保存");
});
$("#notification-button").addEventListener("click", async () => {
  if (!("Notification" in window)) { toast("当前浏览器不支持系统通知"); return; }
  try {
    const permission = await Notification.requestPermission();
    toast(permission === "granted" ? "浏览器通知已开启" : "未获得通知权限，仍会在页面内提醒");
  } catch { toast("通知权限请求失败，仍会在页面内提醒"); }
  renderSettings();
});
$("#export-button").addEventListener("click", () => {
  data.lastExportAt = isoNow();
  save();
  const snapshot = JSON.parse(JSON.stringify(data));
  snapshot.activities.forEach((activity, index) => {
    activity.elapsed = activityElapsed(data.activities[index]);
    activity.running = false;
    activity.startedAt = null;
  });
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const link = make("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `序时备份-${dayKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  renderSettings();
});
$("#backup-import").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const imported = raw.version === 3 ? normalizeData(raw) : migrateOld(raw);
    if (!confirm("导入会替换当前全部数据，包括健康和日记记录。确定继续吗？")) return;
    data = imported;
    visibleTags = new Set(data.tags.map((tag) => tag.id));
    knownSummaryTags = new Set(visibleTags);
    lastReviewKey = null;
    editingTodoId = null;
    selectedMood = null;
    save(); renderAll(); toast("备份已导入");
  } catch { toast("导入失败，请选择序时导出的 JSON 备份"); }
  finally { event.target.value = ""; }
});

let deferredInstallPrompt = null;
function renderInstallState() {
  const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  $("#install-button").disabled = installed;
  $("#install-state").textContent = installed ? "已作为 App 打开" :
    location.protocol === "file:" ? "发布到 HTTPS 网址后可安装到 iPhone" : "可添加到 iPhone 主屏幕";
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderInstallState();
});
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; renderInstallState(); });
$("#install-button").addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
  } else if (typeof $("#install-dialog").showModal === "function") $("#install-dialog").showModal();
  else toast("用 iPhone Safari 打开 HTTPS 网址，从分享菜单选择添加到主屏幕");
});
$("#close-install").addEventListener("click", () => $("#install-dialog").close());
$("#install-dialog").addEventListener("click", (event) => { if (event.target.id === "install-dialog") event.target.close(); });
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function renderAll() {
  renderTags();
  renderActivities();
  renderTodos();
  renderHealth();
  renderMood();
  renderSummary();
  renderCalendar();
  renderSettings();
  renderTop();
}
function tick() {
  advanceActivities();
  updateActivityDisplays();
}
window.addEventListener("pagehide", () => {
  advanceActivities();
  save();
});
document.addEventListener("visibilitychange", () => { tick(); checkReminders(); });
window.addEventListener("pageshow", () => { tick(); checkReminders(); });
renderAll();
save();
setInterval(tick, 500);
setInterval(checkReminders, 30000);
checkReminders();
