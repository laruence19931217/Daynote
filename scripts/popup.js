const NOTES_KEY = "notes";
const THEME_KEY = "theme";
const RECENT_DAY_COUNT = 14;
const SAVE_DELAY_MS = 350;

const editor = document.querySelector("#editor");
const dateList = document.querySelector("#dateList");
const dateHeading = document.querySelector("#dateHeading");
const weekdayLabel = document.querySelector("#weekdayLabel");
const saveState = document.querySelector("#saveState");
const saveStateText = document.querySelector("#saveStateText");
const characterCount = document.querySelector("#characterCount");
const boldButton = document.querySelector("#boldButton");
const clearButton = document.querySelector("#clearButton");
const todayButton = document.querySelector("#todayButton");
const themeToggle = document.querySelector("#themeToggle");
const toast = document.querySelector("#toast");

let selectedDate = toDateKey(new Date());
let notes = {};
let saveTimer;
let toastTimer;
let saveRevision = 0;
let saveQueue = Promise.resolve();

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function relativeDate(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return date;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(fromDateKey(value).getTime());
}

function plainText(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  return (container.textContent || "").replace(/\s+/g, " ").trim();
}

function sanitizeEditorHTML(html) {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  const allowedElements = new Set(["B", "STRONG", "BR", "DIV", "P"]);

  [...root.querySelectorAll("*")].forEach((element) => {
    if (!allowedElements.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }

    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
  });

  return root.innerHTML;
}

function sanitizeStoredNotes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, html]) => isDateKey(key) && typeof html === "string")
      .map(([key, html]) => [key, sanitizeEditorHTML(html)])
      .filter(([, html]) => plainText(html)),
  );
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function dateName(date, todayKey) {
  const key = toDateKey(date);
  if (key === todayKey) return "今天";
  if (key === toDateKey(relativeDate(1))) return "昨天";
  return formatDate(date, { month: "numeric", day: "numeric", weekday: "short" });
}

function visibleDateKeys() {
  const keys = new Set(Object.keys(notes).filter(isDateKey));
  for (let index = 0; index < RECENT_DAY_COUNT; index += 1) {
    keys.add(toDateKey(relativeDate(index)));
  }
  return [...keys].sort((left, right) => right.localeCompare(left));
}

function renderDateList() {
  const fragment = document.createDocumentFragment();
  const todayKey = toDateKey(new Date());

  visibleDateKeys().forEach((key) => {
    const date = fromDateKey(key);
    const button = document.createElement("button");
    const preview = plainText(notes[key]);
    const label = dateName(date, todayKey);

    button.type = "button";
    button.className = "date-item";
    button.dataset.date = key;
    button.setAttribute("aria-label", `${label}${preview ? `，${preview}` : "，无记录"}`);
    if (key === selectedDate) button.setAttribute("aria-current", "date");

    const name = document.createElement("span");
    name.className = "date-name";
    name.textContent = label;

    const notePreview = document.createElement("span");
    notePreview.className = "date-preview";
    notePreview.textContent = preview || "暂无记录";

    button.append(name, notePreview);
    button.addEventListener("click", () => void selectDate(key));
    fragment.append(button);
  });

  dateList.replaceChildren(fragment);
}

function renderEditor() {
  const date = fromDateKey(selectedDate);
  const isToday = selectedDate === toDateKey(new Date());

  editor.innerHTML = sanitizeEditorHTML(notes[selectedDate] || "");
  dateHeading.textContent = formatDate(date, { month: "long", day: "numeric" });
  weekdayLabel.textContent = `${isToday ? "今天 · " : ""}${formatDate(date, { weekday: "long" })}`;
  updateCharacterCount();
  updateBoldState();
}

function captureEditor() {
  const sanitized = sanitizeEditorHTML(editor.innerHTML);
  if (plainText(sanitized)) {
    notes[selectedDate] = sanitized;
  } else {
    delete notes[selectedDate];
  }
}

function setSaveStatus(state) {
  saveState.classList.toggle("is-saving", state === "saving");
  saveState.classList.toggle("is-error", state === "error");

  if (state === "saving") {
    saveStateText.textContent = "正在保存…";
  } else if (state === "error") {
    saveStateText.textContent = "保存失败，请重新打开扩展";
  } else {
    saveStateText.textContent = "已保存到本地";
  }
}

function persistNotes(revision) {
  const snapshot = { ...notes };
  saveQueue = saveQueue
    .then(() => chrome.storage.local.set({ [NOTES_KEY]: snapshot }))
    .then(() => {
      if (revision === saveRevision) setSaveStatus("saved");
    })
    .catch(() => setSaveStatus("error"));
  return saveQueue;
}

function queueSave() {
  window.clearTimeout(saveTimer);
  captureEditor();
  updateCharacterCount();
  renderDateList();
  setSaveStatus("saving");
  const revision = ++saveRevision;
  saveTimer = window.setTimeout(() => void persistNotes(revision), SAVE_DELAY_MS);
}

async function flushCurrentNote() {
  window.clearTimeout(saveTimer);
  captureEditor();
  const revision = ++saveRevision;
  setSaveStatus("saving");
  await persistNotes(revision);
}

async function selectDate(key) {
  if (key === selectedDate) {
    editor.focus();
    return;
  }

  await flushCurrentNote();
  selectedDate = key;
  renderDateList();
  renderEditor();
  editor.focus();
}

function updateCharacterCount() {
  const count = (editor.textContent || "").replace(/\s/g, "").length;
  characterCount.textContent = `${count} 字`;
}

function applyBold() {
  editor.focus();
  document.execCommand("bold", false);
  updateBoldState();
  queueSave();
}

function updateBoldState() {
  boldButton.setAttribute("aria-pressed", String(document.queryCommandState("bold")));
}

async function clearCurrentNote() {
  if (!plainText(editor.innerHTML)) {
    showToast("这一天还没有内容");
    return;
  }

  if (!window.confirm("清空这一天的全部笔记？此操作无法撤销。")) return;

  editor.innerHTML = "";
  delete notes[selectedDate];
  const revision = ++saveRevision;
  setSaveStatus("saving");
  await persistNotes(revision);
  renderDateList();
  updateCharacterCount();
  editor.focus();
  showToast("已清空当天笔记");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3000);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-label", isDark ? "切换浅色模式" : "切换深色模式");
  themeToggle.title = isDark ? "切换浅色模式" : "切换深色模式";
}

async function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  await chrome.storage.local.set({ [THEME_KEY]: nextTheme });
}

function insertPlainText(text) {
  document.execCommand("insertText", false, text);
}

async function initialize() {
  try {
    const stored = await chrome.storage.local.get([NOTES_KEY, THEME_KEY]);
    notes = sanitizeStoredNotes(stored[NOTES_KEY]);
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(stored[THEME_KEY] || systemTheme);
    document.execCommand("defaultParagraphSeparator", false, "div");
    renderDateList();
    renderEditor();
    setSaveStatus("saved");
    window.setTimeout(() => editor.focus(), 80);
  } catch {
    renderDateList();
    renderEditor();
    setSaveStatus("error");
  }
}

editor.addEventListener("input", queueSave);
editor.addEventListener("keyup", updateBoldState);
editor.addEventListener("mouseup", updateBoldState);
editor.addEventListener("blur", () => void flushCurrentNote());
editor.addEventListener("beforeinput", (event) => {
  if (event.inputType.startsWith("format") && event.inputType !== "formatBold") {
    event.preventDefault();
  }
});
editor.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && ["i", "u"].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
});
editor.addEventListener("paste", (event) => {
  event.preventDefault();
  insertPlainText(event.clipboardData.getData("text/plain"));
});
editor.addEventListener("drop", (event) => {
  event.preventDefault();
  insertPlainText(event.dataTransfer.getData("text/plain"));
});

boldButton.addEventListener("click", applyBold);
clearButton.addEventListener("click", () => void clearCurrentNote());
todayButton.addEventListener("click", () => void selectDate(toDateKey(new Date())));
themeToggle.addEventListener("click", () => void toggleTheme());

void initialize();
