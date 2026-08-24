// ============================================================
// IT Foundations — app engine
// Vanilla JS, hash router, localStorage progress, JSON-driven content
// ============================================================

const DATA_ROOT = 'data';
const PROGRESS_KEY = 'itlearn_progress_v1';

const state = {
  manifest: null,
  lessonIndex: {},   // lessonId -> { path, moduleId, moduleTitle, phaseId, phaseTitle }
  progress: {},       // lessonId -> { done: bool, score: n, total: n }
  currentLesson: null,
  taskIdx: 0,
  answered: false,
  correctCount: 0,
};

const $app = document.getElementById('app');

// ---------- progress persistence ----------
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    state.progress = raw ? JSON.parse(raw) : {};
  } catch (e) {
    state.progress = {};
  }
}
function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
  } catch (e) { /* storage unavailable, fail silently */ }
}
function exportProgress() {
  const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'itlearn_progress.json';
  a.click();
  URL.revokeObjectURL(url);
}
function importProgressFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.progress = JSON.parse(reader.result);
      saveProgress();
      route();
    } catch (e) { alert('読み込みに失敗しました'); }
  };
  reader.readAsText(file);
}

// ---------- data loading ----------
async function loadManifest() {
  const res = await fetch(`${DATA_ROOT}/manifest.json`);
  state.manifest = await res.json();
  state.manifest.phases.forEach(phase => {
    (phase.modules || []).forEach(mod => {
      (mod.lessons || []).forEach(path => {
        // lesson id resolved lazily after fetch; store path keyed by path itself for now
        state.lessonIndex[path] = {
          path, moduleId: mod.id, moduleTitle: mod.title,
          phaseId: phase.id, phaseTitle: phase.title,
        };
      });
    });
  });
}
async function loadLesson(path) {
  const res = await fetch(path);
  return res.json();
}

// ---------- router ----------
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'module' && parts[1] && parts[2]) {
    renderModule(Number(parts[1]), parts[2]);
  } else if (parts[0] === 'lesson' && parts[1]) {
    startLesson(decodeURIComponent(parts[1]));
  } else {
    renderPhaseMap();
  }
}
window.addEventListener('hashchange', route);

function topbar(title, backHash) {
  return `
    <div class="topbar">
      ${backHash ? `<button class="back" onclick="location.hash='${backHash}'">← 戻る</button>` : `<span></span>`}
      <span class="brand">IT<b>_</b>FOUNDATIONS</span>
      <span></span>
    </div>`;
}

// ---------- screen: phase map ----------
function lessonProgressForModule(mod) {
  const total = (mod.lessons || []).length;
  const done = (mod.lessons || []).filter(p => state.progress[p]?.done).length;
  return { done, total };
}

function renderPhaseMap() {
  const phases = state.manifest.phases;
  let html = topbar() + `<main><div class="circuit"><div class="circuit-title">Learning Map</div>`;

  phases.forEach(phase => {
    const hasModules = (phase.modules || []).length > 0;
    let phaseDone = 0, phaseTotal = 0;
    (phase.modules || []).forEach(m => {
      const { done, total } = lessonProgressForModule(m);
      phaseDone += done; phaseTotal += total;
    });
    const phaseState = !hasModules ? 'locked' : (phaseTotal > 0 && phaseDone === phaseTotal ? 'done' : 'active');
    const dotLabel = phaseState === 'done' ? '✓' : String(phase.id);

    html += `<div class="node-row">
      <div class="node-dot ${phaseState === 'done' ? 'done' : phaseState === 'active' ? 'active' : ''}">${dotLabel}</div>
      <div class="node-card ${!hasModules ? 'locked' : ''}">
        <h3>${phase.title}</h3>
        <p>${phase.description || ''}</p>`;

    if (hasModules) {
      phase.modules.forEach(mod => {
        const { done, total } = lessonProgressForModule(mod);
        html += `
          <div class="meta">${mod.title} — ${done}/${total} lessons</div>
          <button class="enter" onclick="location.hash='#/module/${phase.id}/${mod.id}'">開く →</button>`;
      });
    } else {
      html += `<div class="meta">準備中</div>`;
    }
    html += `</div></div>`;
  });

  html += `</div>
    <div style="padding:20px 0 40px; display:flex; gap:10px;">
      <button class="enter" style="flex:1;" onclick="exportProgress()">進捗をエクスポート</button>
      <label class="enter" style="flex:1; text-align:center; display:block;">
        インポート
        <input type="file" accept="application/json" style="display:none" onchange="importProgressFromFile(this.files[0])">
      </label>
    </div>
  </main>`;
  $app.innerHTML = html;
}

// ---------- screen: module lesson list ----------
function renderModule(phaseId, moduleId) {
  const phase = state.manifest.phases.find(p => p.id === phaseId);
  const mod = phase.modules.find(m => m.id === moduleId);
  let html = topbar(mod.title, '#/') + `<main>
    <div class="circuit-title" style="padding-top:22px;">${phase.title}</div>
    <h2 style="margin:6px 0 2px;">${mod.title}</h2>
    <p style="color:var(--text-dim); font-size:13px; margin-top:0;">${mod.description || ''}</p>
    <div style="margin-top:10px;">`;

  mod.lessons.forEach((path, i) => {
    const p = state.progress[path];
    const status = p?.done ? `<span class="status done">✓ ${p.score}/${p.total}</span>` : `<span class="status">未着手</span>`;
    html += `<div class="lesson-item" onclick="location.hash='#/lesson/${encodeURIComponent(path)}'" style="cursor:pointer;">
      <div>
        <div class="title">${i + 1}. ${p?.title || '…'}</div>
      </div>
      ${status}
    </div>`;
  });
  html += `</div></main>`;
  $app.innerHTML = html;
  // fetch titles asynchronously to fill in lesson names
  mod.lessons.forEach(async path => {
    if (!state.progress[path]) state.progress[path] = {};
    if (!state.progress[path].title) {
      const lesson = await loadLesson(path);
      state.progress[path].title = lesson.title;
      saveProgress();
      if (location.hash.includes(`module/${phaseId}/${moduleId}`)) renderModule(phaseId, moduleId);
    }
  });
}

// ---------- screen: lesson / task runner ----------
async function startLesson(path) {
  $app.innerHTML = topbar('', '#/') + `<main><p style="padding-top:40px;color:var(--text-dim);">読み込み中…</p></main>`;
  const lesson = await loadLesson(path);
  state.currentLesson = { ...lesson, path };
  state.taskIdx = 0;
  state.correctCount = 0;
  renderTask();
}

function backHashForLesson() {
  const meta = state.lessonIndex[state.currentLesson.path];
  return `#/module/${meta.phaseId}/${meta.moduleId}`;
}

function progressBar() {
  const total = state.currentLesson.tasks.length;
  let segs = '';
  for (let i = 0; i < total; i++) {
    const cls = i < state.taskIdx ? 'done' : i === state.taskIdx ? 'current' : '';
    segs += `<div class="seg ${cls}"></div>`;
  }
  return `<div class="task-progress">${segs}</div>`;
}

const KIND_LABEL = {
  mcq: 'CHOICE', fill: 'FILL IN', terminal: 'TERMINAL', order: 'ORDER', scenario: 'SCENARIO',
};

function renderTask() {
  const lesson = state.currentLesson;
  const task = lesson.tasks[state.taskIdx];
  state.answered = false;

  let body = topbar(lesson.title, backHashForLesson()) + `<main>`;
  body += progressBar();
  body += `<div class="task-kind">${KIND_LABEL[task.type] || task.type}</div>`;

  if (task.type === 'mcq') body += renderMCQ(task);
  else if (task.type === 'fill') body += renderFill(task);
  else if (task.type === 'terminal') body += renderTerminal(task);
  else if (task.type === 'order') body += renderOrder(task);
  else if (task.type === 'scenario') body += renderScenario(task);
  else body += `<p>未対応のタスク形式です: ${task.type}</p>`;

  body += `<div class="feedback" id="feedback"></div>`;
  body += `<button class="next-btn" id="nextBtn" disabled onclick="nextTask()">次へ</button>`;
  body += `</main>`;
  $app.innerHTML = body;

  if (task.type === 'order') setupOrderState(task);
}

function showFeedback(correct, text) {
  const fb = document.getElementById('feedback');
  fb.className = `feedback show ${correct ? 'correct' : 'wrong'}`;
  fb.innerHTML = `<div class="verdict">${correct ? '✓ 正解' : '✕ 不正解'}</div><div>${text || ''}</div>`;
  document.getElementById('nextBtn').disabled = false;
  if (correct) state.correctCount++;
  state.answered = true;
}

function nextTask() {
  if (!state.answered) return;
  state.taskIdx++;
  if (state.taskIdx >= state.currentLesson.tasks.length) {
    finishLesson();
  } else {
    renderTask();
  }
}

function finishLesson() {
  const total = state.currentLesson.tasks.length;
  const path = state.currentLesson.path;
  state.progress[path] = {
    ...(state.progress[path] || {}),
    done: true,
    score: state.correctCount,
    total,
    title: state.currentLesson.title,
  };
  saveProgress();
  $app.innerHTML = topbar('', backHashForLesson()) + `<main>
    <div class="complete-screen">
      <div class="task-kind" style="justify-content:center;">LESSON COMPLETE</div>
      <div class="score">${state.correctCount} / ${total}</div>
      <p>${state.currentLesson.title}</p>
      <button class="next-btn" style="margin-top:24px;" onclick="location.hash='${backHashForLesson()}'">レッスン一覧へ</button>
    </div>
  </main>`;
}

// ---------- task type: mcq ----------
function renderMCQ(task) {
  let html = `<div class="task-prompt">${task.question}</div><div class="choice-list">`;
  task.choices.forEach((c, i) => {
    html += `<button class="choice-btn" onclick="answerMCQ(${i})" data-idx="${i}">${c}</button>`;
  });
  html += `</div>`;
  return html;
}
function answerMCQ(idx) {
  if (state.answered) return;
  const task = state.currentLesson.tasks[state.taskIdx];
  const btns = document.querySelectorAll('.choice-btn');
  btns.forEach((b, i) => {
    b.classList.add('disabled');
    if (i === task.answer) b.classList.add('correct');
    else if (i === idx) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  showFeedback(idx === task.answer, task.explain);
}

// ---------- task type: fill in the blank ----------
function renderFill(task) {
  const templ = task.template.replace('___', '<b style="color:var(--amber)">▢▢▢</b>');
  let html = `<div class="task-prompt">${task.prompt}</div>
    <div class="terminal"><div class="prompt-line mono">${templ}</div></div>
    <div class="choice-list">`;
  task.options.forEach(opt => {
    html += `<button class="choice-btn" onclick="answerFill('${escapeAttr(opt)}')">${opt}</button>`;
  });
  html += `</div>`;
  return html;
}
function answerFill(choice) {
  if (state.answered) return;
  const task = state.currentLesson.tasks[state.taskIdx];
  const btns = document.querySelectorAll('.choice-btn');
  btns.forEach(b => {
    b.classList.add('disabled');
    if (b.textContent === task.answer) b.classList.add('correct');
    else if (b.textContent === choice) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  showFeedback(choice === task.answer, task.explain);
}

// ---------- task type: terminal command ----------
function renderTerminal(task) {
  let html = `<div class="task-prompt">${task.prompt}</div>
    <div class="terminal" id="termOut">
      <div class="prompt-line"><span class="prompt-sym">$</span> <span id="termCmd" class="cmd">…</span></div>
      <div class="out" id="termOutText"></div>
    </div>
    <div class="choice-list">`;
  task.commandOptions.forEach(cmd => {
    html += `<button class="choice-btn mono" onclick="answerTerminal('${escapeAttr(cmd)}')">${cmd}</button>`;
  });
  html += `</div>`;
  return html;
}
function answerTerminal(cmd) {
  if (state.answered) return;
  const task = state.currentLesson.tasks[state.taskIdx];
  document.getElementById('termCmd').textContent = cmd;
  const correct = cmd === task.answer;
  document.getElementById('termOutText').textContent = correct ? task.output : (task.wrongOutput || 'command not recognized in this context');
  const btns = document.querySelectorAll('.choice-btn');
  btns.forEach(b => {
    b.classList.add('disabled');
    if (b.textContent === task.answer) b.classList.add('correct');
    else if (b.textContent === cmd) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  showFeedback(correct, task.explain);
}

// ---------- task type: order ----------
let orderState = [];
function setupOrderState(task) {
  orderState = task.items.map((label, i) => ({ label, origIdx: i }));
  shuffleInPlace(orderState);
  renderOrderList();
}
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function renderOrder(task) {
  return `<div class="task-prompt">${task.prompt}</div><div class="order-list" id="orderList"></div>`;
}
function renderOrderList() {
  const list = document.getElementById('orderList');
  if (!list) return;
  list.innerHTML = orderState.map((item, i) => `
    <div class="order-item">
      <span class="num">${i + 1}</span>
      <span>${item.label}</span>
      <button ${i === 0 ? 'disabled' : ''} onclick="moveOrderItem(${i}, -1)">↑</button>
      <button ${i === orderState.length - 1 ? 'disabled' : ''} onclick="moveOrderItem(${i}, 1)">↓</button>
    </div>`).join('') + `<button class="next-btn" style="margin-top:10px;" onclick="submitOrder()">この順序で確定</button>`;
}
function moveOrderItem(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= orderState.length) return;
  [orderState[i], orderState[j]] = [orderState[j], orderState[i]];
  renderOrderList();
}
function submitOrder() {
  if (state.answered) return;
  const task = state.currentLesson.tasks[state.taskIdx];
  const userOrder = orderState.map(o => o.label);
  const correct = JSON.stringify(userOrder) === JSON.stringify(task.answer);
  document.getElementById('orderList').querySelectorAll('button').forEach(b => b.disabled = true);
  showFeedback(correct, task.explain + (correct ? '' : `<br><br>正解: ${task.answer.join(' → ')}`));
}

// ---------- task type: scenario (diagram reacts to choice) ----------
function renderScenario(task) {
  let html = `<div class="task-prompt">${task.prompt}</div>`;
  html += `<div class="diagram" id="diagram">` +
    task.diagram.nodes.map((n, i) => `<span class="box">${n}</span>${i < task.diagram.nodes.length - 1 ? '<span class="arrow">→</span>' : ''}`).join('') +
    `</div>`;
  html += `<div class="choice-list">`;
  task.choices.forEach((c, i) => {
    html += `<button class="choice-btn" onclick="answerScenario(${i})">${c.label}</button>`;
  });
  html += `</div>`;
  return html;
}
function answerScenario(idx) {
  if (state.answered) return;
  const task = state.currentLesson.tasks[state.taskIdx];
  const choice = task.choices[idx];
  const btns = document.querySelectorAll('.choice-btn');
  btns.forEach((b, i) => {
    b.classList.add('disabled');
    if (task.choices[i].correct) b.classList.add('correct');
    else if (i === idx) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  if (choice.diagramAfter) {
    const dia = document.getElementById('diagram');
    dia.innerHTML = choice.diagramAfter.map((n, i) => {
      const isNew = !task.diagram.nodes.includes(n);
      return `<span class="box ${isNew ? 'new' : ''}">${n}</span>${i < choice.diagramAfter.length - 1 ? '<span class="arrow">→</span>' : ''}`;
    }).join('');
  }
  showFeedback(!!choice.correct, choice.resultText);
}

// ---------- utils ----------
function escapeAttr(s) { return String(s).replace(/'/g, "\\'"); }

// ---------- boot ----------
(async function init() {
  loadProgress();
  await loadManifest();
  route();
})();
