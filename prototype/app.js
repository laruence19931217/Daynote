const STORAGE_KEY = "daynote.notes.v1";
const THEME_KEY = "daynote.theme";
const DAY_COUNT = 14;

const editor = document.querySelector("#editor");
const dateList = document.querySelector("#dateList");
const dateHeading = document.querySelector("#dateHeading");
const weekdayLabel = document.querySelector("#weekdayLabel");
const saveState = document.querySelector("#saveState");
const characterCount = document.querySelector("#characterCount");
const boldButton = document.querySelector("#boldButton");
const clearButton = document.querySelector("#clearButton");
const todayButton = document.querySelector("#todayButton");
const themeToggle = document.querySelector("#themeToggle");
const toast = document.querySelector("#toast");

let selectedDate = toDateKey(new Date());
let notes = loadNotes();
let saveTimer;
let toastTimer;

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

function starterNotes() {
  return {
    [toDateKey(relativeDate(0))]: "修复登录回调里的竞态问题<br><br><strong>下午 3 点前：</strong> 把异常日志整理到 issue",
    [toDateKey(relativeDate(1))]: "试一下新的缓存策略<br>记得补充 README 的本地开发说明",
    [toDateKey(relativeDate(3))]: "周会：下个版本先聚焦编辑体验",
  };
}

function loadNotes() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : starterNotes();
  } catch {
    return starterNotes();
  }
}

function saveNotes() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    setSaveStatus("saved");
  } catch {
    setSaveStatus("error");
  }
}

function plainText(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  return (container.textContent || "").replace(/\s+/g, " ").trim();
}

function sanitizeEditorHTML(html) {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  const allowed = new Set(["B", "STRONG", "BR", "DIV", "P"]);

  [...root.querySelectorAll("*")].forEach((element) => {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
  });

  return root.innerHTML;
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function dateName(date, index) {
  if (index === 0) return "今天";
  if (index === 1) return "昨天";
  return formatDate(date, { month: "numeric", day: "numeric", weekday: "short" });
}

function renderDateList() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < DAY_COUNT; index += 1) {
    const date = relativeDate(index);
    const key = toDateKey(date);
    const button = document.createElement("button");
    const preview = plainText(notes[key]);

    button.type = "button";
    button.className = "date-item";
    button.dataset.date = key;
    button.setAttribute("aria-label", `${dateName(date, index)}${preview ? `，${preview}` : "，无记录"}`);
    if (key === selectedDate) button.setAttribute("aria-current", "date");

    const name = document.createElement("span");
    name.className = "date-name";
    name.textContent = dateName(date, index);

    const notePreview = document.createElement("span");
    notePreview.className = "date-preview";
    notePreview.textContent = preview || "暂无记录";

    button.append(name, notePreview);
    button.addEventListener("click", () => selectDate(key));
    fragment.append(button);
  }

  dateList.replaceChildren(fragment);
}

function selectDate(key) {
  flushCurrentNote();
  selectedDate = key;
  renderDateList();
  renderEditor();
  editor.focus();
}

function renderEditor() {
  const date = fromDateKey(selectedDate);
  const todayKey = toDateKey(new Date());
  const isToday = selectedDate === todayKey;

  editor.innerHTML = sanitizeEditorHTML(notes[selectedDate] || "");
  dateHeading.textContent = formatDate(date, { month: "long", day: "numeric" });
  weekdayLabel.textContent = `${isToday ? "今天 · " : ""}${formatDate(date, { weekday: "long" })}`;
  updateCharacterCount();
  setSaveStatus("saved");
}

function flushCurrentNote() {
  const sanitized = sanitizeEditorHTML(editor.innerHTML);
  if (plainText(sanitized)) {
    notes[selectedDate] = sanitized;
  } else {
    delete notes[selectedDate];
  }
  saveNotes();
}

function queueSave() {
  window.clearTimeout(saveTimer);
  setSaveStatus("saving");
  updateCharacterCount();

  saveTimer = window.setTimeout(() => {
    flushCurrentNote();
    renderDateList();
  }, 420);
}

function setSaveStatus(state) {
  saveState.classList.toggle("is-saving", state === "saving");

  if (state === "saving") {
    saveState.lastChild.textContent = " 正在保存…";
  } else if (state === "error") {
    saveState.lastChild.textContent = " 保存失败，请检查浏览器设置";
  } else {
    saveState.lastChild.textContent = " 已保存到本地";
  }
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
  const isBold = document.queryCommandState("bold");
  boldButton.setAttribute("aria-pressed", String(isBold));
}

function clearCurrentNote() {
  if (!plainText(editor.innerHTML)) {
    showToast("今天还没有内容");
    return;
  }

  const confirmed = window.confirm("清空这一天的全部笔记？此操作无法撤销。");
  if (!confirmed) return;

  editor.innerHTML = "";
  delete notes[selectedDate];
  saveNotes();
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
  themeToggle.setAttribute("aria-label", theme === "dark" ? "切换浅色模式" : "切换深色模式");
  themeToggle.title = theme === "dark" ? "切换浅色模式" : "切换深色模式";
}

function initializeTheme() {
  const stored = window.localStorage.getItem(THEME_KEY);
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(stored || preferred);
}

editor.addEventListener("input", queueSave);
editor.addEventListener("keyup", updateBoldState);
editor.addEventListener("mouseup", updateBoldState);
editor.addEventListener("blur", flushCurrentNote);
editor.addEventListener("paste", (event) => {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain");
  document.execCommand("insertText", false, text);
});

boldButton.addEventListener("click", applyBold);
clearButton.addEventListener("click", clearCurrentNote);
todayButton.addEventListener("click", () => selectDate(toDateKey(new Date())));
themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  window.localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
});

window.addEventListener("beforeunload", flushCurrentNote);

initializeTheme();
renderDateList();
renderEditor();
window.setTimeout(() => editor.focus(), 120);
