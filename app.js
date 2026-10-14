// ============ 预设色板 ============
const PRESET_COLORS = [
  '#ff6b6b', '#ff9f43', '#ffd479', '#f9e547', '#6bcf7f', '#4ecdc4',
  '#6ba3ff', '#a29bfe', '#b18cff', '#ff8ec7', '#ff6b9d', '#c9a06b',
  '#9aa8c0', '#ffffff', '#ffb8b8', '#b8e0ff', '#c4f0c4', '#e0c4f0',
];

const COLOR_NAMES = {
  red: '#ff0000', blue: '#0000ff', green: '#008000',
  yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', brown: '#a52a2a', gray: '#808080',
  grey: '#808080', black: '#000000', white: '#ffffff',
  gold: '#ffd700', teal: '#008080', cyan: '#00ffff',
  magenta: '#ff00ff', lime: '#00ff00', navy: '#000080',
  maroon: '#800000', olive: '#808000', silver: '#c0c0c0'
};

function normalizeColor(c) {
  if (!c) return null;
  c = c.trim();
  if (COLOR_NAMES[c.toLowerCase()]) return COLOR_NAMES[c.toLowerCase()];
  return c;
}

const DEFAULT_SCRIPT = `@旁白
夜色降临，街角的路灯忽明忽暗。

@小明[red]
你终于来了。我等了好久。

@小红[blue]
抱歉，路上有点事。

@小明[red]
没关系，能来就好。

@旁白
两人并肩走在空荡的街道上。

@小红[blue]
其实……我有件事一直想告诉你。

@小明[red]
嗯？什么事？

@小红[blue]
算了，以后再说吧。
`;

const STORAGE_KEY = 'story_editor_v5';

function loadFiles() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.files && saved.files.length > 0) return saved;
  } catch (e) {}
  return {
    activeIndex: 0,
    files: [{
      name: '剧本 1',
      title: '',
      content: DEFAULT_SCRIPT,
      chars: [
        { name: '小明', color: '#ff6b6b' },
        { name: '小红', color: '#6ba3ff' }
      ]
    }]
  };
}
function saveFiles() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let state = loadFiles();

// ============ DOM ============
const tabsBar      = document.getElementById('tabsBar');
const charBar      = document.getElementById('charBar');
const editorInfo   = document.getElementById('editorInfo');
const undoBtn      = document.getElementById('undoBtn');
const redoBtn      = document.getElementById('redoBtn');
const speakerEl    = document.getElementById('speaker');
const textEl       = document.getElementById('text');
const dialogEl     = document.getElementById('dialog');
const hintEl       = document.getElementById('hint');
const progressEl   = document.getElementById('progress');
const historyList  = document.getElementById('historyList');
const historyPanel = document.getElementById('historyPanel');
const titleInput   = document.getElementById('titleInput');
const exportModal  = document.getElementById('exportModal');
const exportTitle  = document.getElementById('exportTitle');
const exportAuthor = document.getElementById('exportAuthor');

// ============ CodeMirror ============
const cm = CodeMirror(document.getElementById('editorWrap'), {
  value: '',
  mode: null,
  theme: 'material-darker',
  lineNumbers: true,
  lineWrapping: true,
  indentUnit: 2,
  tabSize: 2,
});

// 渲染编辑区：隐藏 @，给名字染色
let charMarks = [];
function decorateEditor() {
  // 清除旧标记
  charMarks.forEach(m => m.clear());
  charMarks = [];

  const text = cm.getValue();
  const lines = text.split('\n');
  lines.forEach((lineText, i) => {
    const m = lineText.match(/^@([^\[\]\n]+?)(?:\s*\[\s*([^\]]+?)\s*\])?\s*$/);
    if (!m) return;
    const name = m[1].trim();
    const color = normalizeColor(m[2]) || '#ffd479';

    // 隐藏 @
    charMarks.push(cm.markText(
      { line: i, ch: 0 },
      { line: i, ch: 1 },
      { className: 'cm-hide-at' }
    ));
    // 名字染色
    charMarks.push(cm.markText(
      { line: i, ch: 1 },
      { line: i, ch: 1 + name.length },
      { css: `color:${color}; font-weight:bold;` }
    ));
  });
}

// ============ 撤销/重做 ============
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 100;
let isUndoRedoing = false;
let isSyncingFromCursor = false;
let lastSnapshot = '';

function takeSnapshot() {
  if (isUndoRedoing) return;
  const cur = cm.getValue();
  if (cur === lastSnapshot) return;
  undoStack.push(lastSnapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  lastSnapshot = cur;
  redoStack.length = 0;
  updateUndoButtons();
}
function undo() {
  if (undoStack.length === 0) return;
  isUndoRedoing = true;
  const prev = undoStack.pop();
  redoStack.push(lastSnapshot);
  lastSnapshot = prev;
  cm.setValue(prev);
  decorateEditor();
  applyInput();
  isUndoRedoing = false;
  updateUndoButtons();
}
function redo() {
  if (redoStack.length === 0) return;
  isUndoRedoing = true;
  const nxt = redoStack.pop();
  undoStack.push(lastSnapshot);
  lastSnapshot = nxt;
  cm.setValue(nxt);
  decorateEditor();
  applyInput();
  isUndoRedoing = false;
  updateUndoButtons();
}
function updateUndoButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}
function applyInput() {
  state.files[state.activeIndex].content = cm.getValue();
  saveFiles();
  updateEditorInfo();
  refreshScript();
}

// ============ 解析剧本 ============
function parseScript(raw) {
  const blocks = raw.split(/^@/m).filter(b => b.trim());
  return blocks.map(block => {
    const firstLine = block.split('\n')[0].trim();
    const content = block.split('\n').slice(1).join('\n').trim();
    if (!content) return null;

    let speaker = firstLine;
    let color = null;
    const m = firstLine.match(/^(.+?)\s*\[\s*([^\]]+?)\s*\]\s*$/);
    if (m) {
      speaker = m[1].trim();
      color = normalizeColor(m[2]);
    }
    const isNarration = speaker === '旁白' || speaker === '';
    return { speaker, content, color, isNarration };
  }).filter(Boolean);
}

// ============ 预览 ============
let script = [];
let current = 0;
let history = [];

function refreshScript() {
  script = parseScript(state.files[state.activeIndex].content);
  if (current >= script.length) current = Math.max(0, script.length - 1);
  render();
}

function render() {
  const line = script[current];
  if (!line) {
    speakerEl.textContent = '';
    textEl.textContent = '（剧本为空）';
    progressEl.textContent = '0 / 0';
    return;
  }
  if (line.isNarration) {
    speakerEl.style.color = '#9aa8c0';
    textEl.style.borderLeftColor = '#6b7a99';
    textEl.style.color = '#b8c4d8';
    textEl.style.fontStyle = 'italic';
    speakerEl.textContent = '';       // ← 旁白不显示名字
  } else {
    const c = line.color || '#ffd479';
    speakerEl.style.color = c;
    textEl.style.borderLeftColor = c;
    textEl.style.color = '#eee';
    textEl.style.fontStyle = 'normal';
    speakerEl.textContent = line.speaker;
  }
  textEl.textContent = line.content;
  dialogEl.style.animation = 'none';
  void dialogEl.offsetWidth;
  dialogEl.style.animation = '';
  progressEl.textContent = `${current + 1} / ${script.length}`;
  hintEl.style.visibility = current >= script.length - 1 ? 'hidden' : 'visible';

  if (!isSyncingFromCursor && !history.includes(current)) {
    history.push(current);
    renderHistory();
  }
}

function renderHistory() {
  historyList.innerHTML = '';
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">还没有对话记录</div>';
    return;
  }
  history.forEach(i => {
    const line = script[i];
    if (!line) return;
    const item = document.createElement('div');
    item.className = 'history-item';
    if (line.isNarration) {
      item.style.fontStyle = 'italic';
      item.style.color = '#9aa8c0';
      item.style.borderLeftColor = '#6b7a99';
    } else {
      const c = line.color || '#ffd479';
      item.style.borderLeftColor = c;
      const sp = document.createElement('div');
      sp.className = 'h-speaker';
      sp.style.color = c;
      sp.textContent = line.speaker;
      item.appendChild(sp);
    }
    const tx = document.createElement('div');
    tx.textContent = line.content;
    item.appendChild(tx);
    historyList.appendChild(item);
  });
  historyList.scrollTop = historyList.scrollHeight;
}

function next() { if (current < script.length - 1) { current++; render(); } }
function prev() { if (current > 0) { current--; render(); } }
function restart() { current = 0; history = []; render(); renderHistory(); }

// ============ 角色按钮 ============
function renderCharBar() {
  charBar.querySelectorAll('.char-btn').forEach(el => el.remove());
  const chars = state.files[state.activeIndex].chars || [];

  chars.forEach((ch, i) => {
    const btn = document.createElement('div');
    btn.className = 'char-btn';
    btn.style.color = ch.color || '#ffd479';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = ch.color || '#ffd479';
    dot.title = '点击修改颜色';
    dot.addEventListener('click', e => {
      e.stopPropagation();
      openCharModal({ mode: 'edit', index: i, name: ch.name, color: ch.color });
    });
    btn.appendChild(dot);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = ch.name;
    btn.appendChild(nameSpan);

    const del = document.createElement('span');
    del.className = 'del';
    del.textContent = '×';
    del.title = '删除角色';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`删除角色「${ch.name}」？`)) return;
      chars.splice(i, 1);
      saveFiles();
      renderCharBar();
    });
    btn.appendChild(del);

    btn.addEventListener('click', () => {
      insertCharSnippet(ch.name, ch.color);
      charBar.querySelectorAll('.char-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    charBar.appendChild(btn);
  });
}

function insertCharSnippet(name, color) {
  const cursor = cm.getCursor();
  const text = cm.getValue();
  const lines = text.split('\n');
  let pos = 0;
  for (let i = 0; i < cursor.line; i++) pos += lines[i].length + 1;
  pos += cursor.ch;

  const before = text.slice(0, pos);
  let prefix = '';
  if (before.length > 0 && !before.endsWith('\n\n')) {
    prefix = before.endsWith('\n') ? '\n' : '\n\n';
  }
  const head = `@${name}${color ? `[${color}]` : ''}\n`;
  const snippet = prefix + head;

  cm.replaceRange(snippet, cm.posFromIndex(pos));
  const newPos = pos + snippet.length;
  cm.setCursor(cm.posFromIndex(newPos));
  cm.focus();
}
function insertNarrationSnippet() {
  const cursor = cm.getCursor();
  const text = cm.getValue();
  const lines = text.split('\n');
  let pos = 0;
  for (let i = 0; i < cursor.line; i++) pos += lines[i].length + 1;
  pos += cursor.ch;

  const before = text.slice(0, pos);
  let prefix = '';
  if (before.length > 0 && !before.endsWith('\n\n')) {
    prefix = before.endsWith('\n') ? '\n' : '\n\n';
  }
  const snippet = prefix + '@旁白\n';

  cm.replaceRange(snippet, cm.posFromIndex(pos));
  const newPos = pos + snippet.length;
  cm.setCursor(cm.posFromIndex(newPos));
  cm.focus();
}

// ============ 角色弹窗 ============
const charModal       = document.getElementById('charModal');
const modalTitle      = document.getElementById('modalTitle');
const charNameInput   = document.getElementById('charNameInput');
const colorGrid       = document.getElementById('colorGrid');
const customColor     = document.getElementById('customColor');
const customColorText = document.getElementById('customColorText');
const rgbR = document.getElementById('rgbR');
const rgbG = document.getElementById('rgbG');
const rgbB = document.getElementById('rgbB');
const rgbRVal = document.getElementById('rgbRVal');
const rgbGVal = document.getElementById('rgbGVal');
const rgbBVal = document.getElementById('rgbBVal');
const previewChip     = document.getElementById('previewChip');
const previewName     = document.getElementById('previewName');

let modalMode = 'add';
let modalEditIndex = -1;
let modalColor = '#ffd479';

PRESET_COLORS.forEach(c => {
  const sw = document.createElement('div');
  sw.className = 'color-swatch';
  sw.style.background = c;
  sw.dataset.color = c;
  sw.addEventListener('click', () => selectColor(c));
  colorGrid.appendChild(sw);
});

function selectColor(c) {
  modalColor = c;
  colorGrid.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === c);
  });
  if (/^#[0-9a-fA-F]{6}$/.test(c)) {
    customColor.value = c;
    syncRgbFromHex(c);
  }
  customColorText.value = c;
  updatePreview();
}

function syncRgbFromHex(hex) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  rgbR.value = r; rgbRVal.textContent = r;
  rgbG.value = g; rgbGVal.textContent = g;
  rgbB.value = b; rgbBVal.textContent = b;
}

function rgbToHex(r, g, b) {
  const h = n => n.toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

function onRgbChange() {
  const r = +rgbR.value, g = +rgbG.value, b = +rgbB.value;
  rgbRVal.textContent = r;
  rgbGVal.textContent = g;
  rgbBVal.textContent = b;
  const hex = rgbToHex(r, g, b);
  modalColor = hex;
  colorGrid.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === hex);
  });
  customColor.value = hex;
  customColorText.value = hex;
  updatePreview();
}
rgbR.addEventListener('input', onRgbChange);
rgbG.addEventListener('input', onRgbChange);
rgbB.addEventListener('input', onRgbChange);

function updatePreview() {
  const name = charNameInput.value.trim() || '角色';
  previewName.textContent = name;
  previewName.style.color = modalColor;
  previewChip.style.borderLeftColor = modalColor;
  const norm = normalizeColor(customColorText.value);
  if (norm && /^#[0-9a-fA-F]{6}$/.test(norm)) customColor.value = norm;
}

charNameInput.addEventListener('input', updatePreview);
customColorText.addEventListener('input', () => {
  const c = customColorText.value.trim();
  if (normalizeColor(c)) selectColor(c);
});
customColor.addEventListener('input', () => selectColor(customColor.value));

function openCharModal(opts) {
  modalMode = opts.mode || 'add';
  modalEditIndex = opts.index !== undefined ? opts.index : -1;
  modalTitle.textContent = modalMode === 'add' ? '添加角色' : '修改角色';
  charNameInput.value = opts.name || '';
  const initColor = normalizeColor(opts.color) || '#ffd479';
  selectColor(initColor);
  updatePreview();
  charModal.classList.add('show');
  setTimeout(() => charNameInput.focus(), 100);
}
function closeCharModal() {
  charModal.classList.remove('show');
}

document.getElementById('modalCancel').addEventListener('click', closeCharModal);
document.getElementById('modalOk').addEventListener('click', () => {
  const name = charNameInput.value.trim();
  if (!name) { alert('请输入角色名'); return; }
  const color = modalColor;
  const chars = state.files[state.activeIndex].chars || [];

  if (modalMode === 'add') {
    if (chars.some(c => c.name === name)) { alert('已存在同名角色'); return; }
    chars.push({ name, color });
    state.files[state.activeIndex].chars = chars;
    saveFiles();
    renderCharBar();
    insertCharSnippet(name, color);
  } else {
    const old = chars[modalEditIndex];
    if (!old) return;
    old.color = color;
    old.name = name;
    saveFiles();
    renderCharBar();
  }
  closeCharModal();
});
charModal.addEventListener('click', e => {
  if (e.target === charModal) closeCharModal();
});
document.getElementById('insertCharBtn').addEventListener('click', () => {
  openCharModal({ mode: 'add', name: '', color: '#ffd479' });
});
document.getElementById('insertNarrationBtn').addEventListener('click', insertNarrationSnippet);

// ============ 标签栏 ============
function renderTabs() {
  tabsBar.innerHTML = '';
  state.files.forEach((file, i) => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (i === state.activeIndex ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = file.name;
    name.addEventListener('dblclick', e => {
      e.stopPropagation();
      const newName = prompt('重命名标签：', file.name);
      if (newName && newName.trim()) {
        file.name = newName.trim();
        saveFiles();
        renderTabs();
        updateEditorInfo();
      }
    });
    tab.appendChild(name);

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', e => {
      e.stopPropagation();
      if (state.files.length === 1) { alert('至少保留一个标签页'); return; }
      if (!confirm(`关闭「${file.name}」？内容会丢失。`)) return;
      state.files.splice(i, 1);
      if (state.activeIndex >= state.files.length) {
        state.activeIndex = state.files.length - 1;
      }
      saveFiles();
      renderTabs();
      loadActiveFile();
    });
    tab.appendChild(close);

    tab.addEventListener('click', () => switchTab(i));
    tabsBar.appendChild(tab);
  });

  const add = document.createElement('button');
  add.className = 'tab-add';
  add.textContent = '+';
  add.title = '新建剧本';
  add.addEventListener('click', () => {
    state.files.push({
      name: `剧本 ${state.files.length + 1}`,
      title: '',
      content: '@旁白\n新的一幕开始了。\n',
      chars: []
    });
    state.activeIndex = state.files.length - 1;
    saveFiles();
    renderTabs();
    loadActiveFile();
  });
  tabsBar.appendChild(add);
}

function switchTab(i) {
  state.files[state.activeIndex].content = cm.getValue();
  state.activeIndex = i;
  saveFiles();
  renderTabs();
  loadActiveFile();
}

function loadActiveFile() {
  const f = state.files[state.activeIndex];
  if (!f.title) f.title = '';
  if (!f.chars) f.chars = [];

  cm.setValue(f.content);
  decorateEditor();
  titleInput.value = f.title;
  lastSnapshot = cm.getValue();
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoButtons();
  current = 0;
  history = [];
  renderCharBar();
  updateEditorInfo();
  refreshScript();
}

function updateEditorInfo() {
  const f = state.files[state.activeIndex];
  const title = (f.title || '').trim() || f.name || '未命名剧本';
  const len = cm.getValue().length;
  editorInfo.textContent = `📖 ${title} · 共 ${state.files.length} 个剧本 · ${len} 字`;
}

// ============ 编辑区事件 ============
cm.on('change', () => {
  takeSnapshot();
  applyInput();
  decorateEditor();
});

cm.on('cursorActivity', () => {
  syncPreviewToCursor();
});

function syncPreviewToCursor() {
  const cursor = cm.getCursor();
  const text = cm.getValue();
  const lines = text.split('\n');
  let pos = 0;
  for (let i = 0; i < cursor.line; i++) pos += lines[i].length + 1;
  pos += cursor.ch;

  const beforeCursor = text.slice(0, pos);
  const matches = beforeCursor.match(/^@/gm);
  let lineIndex = matches ? matches.length - 1 : -1;

  if (lineIndex < 0) lineIndex = 0;
  if (lineIndex >= script.length) lineIndex = script.length - 1;
  if (script.length === 0) return;

  if (lineIndex !== current) {
    isSyncingFromCursor = true;
    current = lineIndex;
    render();
    isSyncingFromCursor = false;
  }
}

titleInput.addEventListener('input', () => {
  state.files[state.activeIndex].title = titleInput.value;
  saveFiles();
  // 同步标签页名字
  const t = titleInput.value.trim();
  state.files[state.activeIndex].name = t || `剧本 ${state.activeIndex + 1}`;
  saveFiles();
  renderTabs();
  updateTitleDisplay();
});

// 更新顶部标题显示
function updateTitleDisplay() {
  const f = state.files[state.activeIndex];
  const title = (f.title || '').trim() || f.name || '未命名剧本';
  editorInfo.textContent = ` ${title} · 共 ${state.files.length} 个剧本 · ${cm.getValue().length} 字`;
}

document.getElementById('resetFileBtn').addEventListener('click', () => {
  if (!confirm('清空当前剧本？此操作不可撤销。')) return;
  cm.setValue('');
  takeSnapshot();
  applyInput();
  decorateEditor();
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// ============ 预览事件 ============
document.getElementById('nextBtn').addEventListener('click', next);
document.getElementById('prevBtn').addEventListener('click', prev);
document.getElementById('restartBtn').addEventListener('click', restart);
document.getElementById('stage').addEventListener('click', next);

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault(); redo(); return;
  }
});

document.getElementById('historyBtn').addEventListener('click', () => {
  historyPanel.classList.toggle('open');
});
document.getElementById('closeHistory').addEventListener('click', () => {
  historyPanel.classList.remove('open');
});

// ============ 导出功能 ============
const exportBtn    = document.getElementById('exportBtn');
const exportCancel = document.getElementById('exportCancel');
const exportOk     = document.getElementById('exportOk');

exportBtn.addEventListener('click', () => {
  const f = state.files[state.activeIndex];
  if (!f.content.trim()) { alert('剧本是空的，没东西可导出'); return; }
  exportTitle.value = f.title || f.name || '未命名剧情';
  exportAuthor.value = f.author || '';
  exportModal.classList.add('show');
  setTimeout(() => exportTitle.focus(), 100);
});
exportCancel.addEventListener('click', () => {
  exportModal.classList.remove('show');
});
exportModal.addEventListener('click', e => {
  if (e.target === exportModal) exportModal.classList.remove('show');
});
exportOk.addEventListener('click', () => {
  const title = exportTitle.value.trim() || '未命名剧情';
  const author = exportAuthor.value.trim();
  const useTypewriter = document.getElementById('optTypewriter').checked;
  const useRestart = document.getElementById('optRestart').checked;
  const useHistory = document.getElementById('optHistory').checked;

  const f = state.files[state.activeIndex];
  f.author = author;
  saveFiles();

  const html = buildExportHTML({
    title, author,
    scriptRaw: f.content,
    useTypewriter, useRestart, useHistory
  });
  downloadFile(`${title}.html`, html);
  exportModal.classList.remove('show');
});

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildExportHTML(opts) {
  const { title, author, scriptRaw, useTypewriter, useRestart, useHistory } = opts;
  const scriptEncoded = btoa(unescape(encodeURIComponent(scriptRaw)));

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: linear-gradient(160deg, #2b3a55, #1a1f2e);
    color: #eee; overflow: hidden;
  }
  .app { height: 100vh; display: flex; flex-direction: column; position: relative; }
  .title-screen {
    position: fixed; inset: 0;
    background: linear-gradient(160deg, #2b3a55, #0d1220);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 30px; z-index: 100; transition: opacity 0.6s;
  }
  .title-screen.hide { opacity: 0; pointer-events: none; }
  .title-screen h1 {
    font-size: 42px; letter-spacing: 4px;
    color: #ffd479;
    text-shadow: 0 4px 20px rgba(255,212,121,0.4);
    text-align: center; padding: 0 20px;
  }
  .title-screen .author { color: #8a9bb5; font-size: 15px; letter-spacing: 2px; }
  .title-screen button {
    margin-top: 20px; padding: 14px 48px;
    font-size: 17px; background: #ffd479; color: #222;
    border: none; border-radius: 30px;
    cursor: pointer; font-weight: bold; letter-spacing: 2px;
    box-shadow: 0 6px 20px rgba(255,212,121,0.35);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .title-screen button:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 28px rgba(255,212,121,0.5);
  }
  .stage {
    flex: 1; display: flex; flex-direction: column;
    justify-content: flex-end; padding: 0 60px 50px;
    cursor: pointer; position: relative;
  }
  .dialog { animation: fadeIn 0.35s ease; }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .speaker {
    font-size: 16px; font-weight: bold;
    margin-bottom: 10px; padding-left: 4px; letter-spacing: 1px;
  }
  .text {
    font-size: 21px; line-height: 1.8;
    background: rgba(0,0,0,0.6);
    padding: 26px 30px; border-radius: 14px;
    border-left: 4px solid #ffd479;
    min-height: 110px; white-space: pre-wrap;
    backdrop-filter: blur(6px);
  }
  .hint {
    text-align: right; color: #8a9bb5;
    font-size: 13px; margin-top: 12px;
    animation: hintBlink 1.4s infinite;
  }
  @keyframes hintBlink { 50% { opacity: 0.3; } }
  .bottom-btns {
    position: fixed; right: 24px; bottom: 24px;
    display: flex; gap: 10px; z-index: 10;
  }
  .bottom-btns button {
    width: 46px; height: 46px; border-radius: 50%;
    background: rgba(58,74,102,0.9); color: #fff;
    border: none; font-size: 18px; cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,0.4);
    transition: background 0.15s;
  }
  .bottom-btns button:hover { background: #4a5d80; }
  .history-panel {
    position: fixed; top: 0; right: -420px;
    width: 420px; max-width: 90vw; height: 100%;
    background: #1e2430;
    box-shadow: -6px 0 24px rgba(0,0,0,0.6);
    transition: right 0.3s ease;
    display: flex; flex-direction: column; z-index: 50;
  }
  .history-panel.open { right: 0; }
  .history-header {
    padding: 18px 22px; background: #252b38;
    display: flex; justify-content: space-between;
    align-items: center; border-bottom: 1px solid #333;
  }
  .history-header h2 { font-size: 16px; color: #ddd; }
  .history-header button {
    background: none; border: none;
    color: #aaa; font-size: 24px; cursor: pointer;
  }
  .history-list {
    flex: 1; overflow-y: auto; padding: 18px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .history-item {
    padding: 12px 15px; background: #262d3c;
    border-radius: 8px; border-left: 3px solid #4a5d80;
    font-size: 15px; line-height: 1.65; color: #cdd6e5;
  }
  .history-item .h-speaker {
    font-weight: bold; font-size: 13px; margin-bottom: 5px;
  }
  .history-empty {
    color: #667; text-align: center;
    margin-top: 40px; font-size: 14px;
  }
  .end-screen {
    position: fixed; inset: 0;
    background: rgba(10,14,24,0.92);
    display: none; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 26px; z-index: 90; animation: fadeIn 0.6s;
  }
  .end-screen.show { display: flex; }
  .end-screen h2 { font-size: 32px; color: #ffd479; letter-spacing: 4px; }
  .end-screen button {
    padding: 12px 40px; font-size: 16px;
    background: #ffd479; color: #222;
    border: none; border-radius: 30px;
    cursor: pointer; font-weight: bold;
  }
</style>
</head>
<body>

<div class="title-screen" id="titleScreen">
  <h1>${escapeHtml(title)}</h1>
  ${author ? `<div class="author">— ${escapeHtml(author)} —</div>` : ''}
  <button id="startBtn">开始</button>
</div>

<div class="app">
  <div class="stage" id="stage">
    <div class="dialog" id="dialog">
      <div class="speaker" id="speaker"></div>
      <div class="text" id="text"></div>
    </div>
    <div class="hint" id="hint">点击继续 ▸</div>
  </div>
</div>

${useHistory ? `
<div class="bottom-btns">
  <button id="historyBtn" title="历史">📜</button>
  ${useRestart ? `<button id="restartBtn" title="重新开始">↻</button>` : ''}
</div>

<div class="history-panel" id="historyPanel">
  <div class="history-header">
    <h2>📜 历史对话</h2>
    <button id="closeHistory">×</button>
  </div>
  <div class="history-list" id="historyList"></div>
</div>
` : (useRestart ? `
<div class="bottom-btns">
  <button id="restartBtn" title="重新开始">↻</button>
</div>
` : '')}

<div class="end-screen" id="endScreen">
  <h2>— 完 —</h2>
  <button id="endRestart">重新开始</button>
</div>

<script>
(function(){
  const SCRIPT_RAW = decodeURIComponent(escape(atob("${scriptEncoded}")));
  const USE_TYPEWRITER = ${useTypewriter};
  const USE_RESTART = ${useRestart};
  const USE_HISTORY = ${useHistory};

  const COLOR_NAMES = ${JSON.stringify(COLOR_NAMES)};

  function normalizeColor(c) {
    if (!c) return null;
    c = c.trim();
    if (COLOR_NAMES[c.toLowerCase()]) return COLOR_NAMES[c.toLowerCase()];
    return c;
  }

  function parseScript(raw) {
    const blocks = raw.split(/^@/m).filter(b => b.trim());
    return blocks.map(block => {
      const firstLine = block.split('\\n')[0].trim();
      const content = block.split('\\n').slice(1).join('\\n').trim();
      if (!content) return null;
      let speaker = firstLine;
      let color = null;
      const m = firstLine.match(/^(.+?)\\s*\\[\\s*([^\\]]+?)\\s*\\]\\s*$/);
      if (m) { speaker = m[1].trim(); color = normalizeColor(m[2]); }
      const isNarration = speaker === '旁白' || speaker === '';
      return { speaker, content, color, isNarration };
    }).filter(Boolean);
  }

  const script = parseScript(SCRIPT_RAW);
  let current = -1;
  let historyList_ = [];
  let typing = false;
  let typeTimer = null;
  let fullText = '';

  const stage = document.getElementById('stage');
  const dialogEl = document.getElementById('dialog');
  const speakerEl = document.getElementById('speaker');
  const textEl = document.getElementById('text');
  const hintEl = document.getElementById('hint');
  const titleScreen = document.getElementById('titleScreen');
  const endScreen = document.getElementById('endScreen');

  document.getElementById('startBtn').addEventListener('click', () => {
    titleScreen.classList.add('hide');
    setTimeout(() => titleScreen.style.display = 'none', 600);
    next();
  });

  function next() {
    if (typing) {
      clearInterval(typeTimer);
      typing = false;
      textEl.textContent = fullText;
      hintEl.style.visibility = 'visible';
      return;
    }
    if (current >= script.length - 1) { showEnd(); return; }
    current++;
    render();
  }

  function render() {
    const line = script[current];
    if (!line) return;

    if (line.isNarration) {
      speakerEl.style.color = '#9aa8c0';
      textEl.style.borderLeftColor = '#6b7a99';
      textEl.style.color = '#b8c4d8';
      textEl.style.fontStyle = 'italic';
      speakerEl.textContent = '';
    } else {
      const c = line.color || '#ffd479';
      speakerEl.style.color = c;
      textEl.style.borderLeftColor = c;
      textEl.style.color = '#eee';
      textEl.style.fontStyle = 'normal';
      speakerEl.textContent = line.speaker;
    }

    dialogEl.style.animation = 'none';
    void dialogEl.offsetWidth;
    dialogEl.style.animation = '';

    if (USE_HISTORY && !historyList_.includes(current)) {
      historyList_.push(current);
      renderHistory();
    }

    fullText = line.content;
    if (USE_TYPEWRITER) {
      typeText(fullText);
      hintEl.style.visibility = 'hidden';
    } else {
      textEl.textContent = fullText;
      hintEl.style.visibility = 'visible';
    }
  }

  function typeText(str) {
    typing = true;
    textEl.textContent = '';
    let i = 0;
    clearInterval(typeTimer);
    typeTimer = setInterval(() => {
      if (i >= str.length) {
        clearInterval(typeTimer);
        typing = false;
        hintEl.style.visibility = 'visible';
        return;
      }
      textEl.textContent = str.slice(0, ++i);
    }, 40);
  }

  function renderHistory() {
    if (!USE_HISTORY) return;
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';
    if (historyList_.length === 0) {
      list.innerHTML = '<div class="history-empty">还没有对话记录</div>';
      return;
    }
    historyList_.forEach(i => {
      const line = script[i];
      if (!line) return;
      const item = document.createElement('div');
      item.className = 'history-item';
      if (line.isNarration) {
        item.style.fontStyle = 'italic';
        item.style.color = '#9aa8c0';
        item.style.borderLeftColor = '#6b7a99';
      } else {
        const c = line.color || '#ffd479';
        item.style.borderLeftColor = c;
        const sp = document.createElement('div');
        sp.className = 'h-speaker';
        sp.style.color = c;
        sp.textContent = line.speaker;
        item.appendChild(sp);
      }
      const tx = document.createElement('div');
      tx.textContent = line.content;
      item.appendChild(tx);
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }

  function showEnd() { endScreen.classList.add('show'); }

  function restart() {
    current = -1;
    historyList_ = [];
    typing = false;
    clearInterval(typeTimer);
    endScreen.classList.remove('show');
    const panel = document.getElementById('historyPanel');
    if (panel) panel.classList.remove('open');
    next();
  }

  stage.addEventListener('click', next);

  document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'Escape') {
      const panel = document.getElementById('historyPanel');
      if (panel) panel.classList.remove('open');
    }
  });

  const histBtn = document.getElementById('historyBtn');
  if (histBtn) {
    histBtn.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('historyPanel').classList.toggle('open');
    });
  }
  const closeHist = document.getElementById('closeHistory');
  if (closeHist) {
    closeHist.addEventListener('click', () => {
      document.getElementById('historyPanel').classList.remove('open');
    });
  }
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) {
    restartBtn.addEventListener('click', e => { e.stopPropagation(); restart(); });
  }
  const endRestart = document.getElementById('endRestart');
  if (endRestart) endRestart.addEventListener('click', restart);
})();
</script>
</body>
</html>`;
}

// ============ 初始化 ============
renderTabs();
loadActiveFile();