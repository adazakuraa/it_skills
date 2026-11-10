// ============================================================
// CyberLab — アプリ本体（画面遷移・ミッション実行）
// ============================================================
import { el, clear } from './util.js';
import { buildEnvironment } from './env.js';
import { Terminal } from './terminal.js';
import { evaluate, needsAnswer } from './checker.js';
import * as store from './storage.js';
import { STAGES, getMission, getStageOf, isMissionUnlocked, allMissions } from './missions/index.js';
import { CAST, PROLOGUE, EPILOGUE, chapterOf } from './story.js';

const app = document.getElementById('app');
const isDone = id => store.missionState(id).done;

// 現在プレイ中の状態
let play = null;

// ---------- ルーター ----------
function route() {
  applyFontSize();
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'stage' && parts[1]) return renderStage(parts[1]);
  if (parts[0] === 'mission' && parts[1]) return renderMissionDetail(parts[1]);
  if (parts[0] === 'play' && parts[1]) return startPlay(parts[1]);
  if (parts[0] === 'progress') return renderProgress();
  if (parts[0] === 'story') return renderStory();
  if (!store.storySeen() && parts.length === 0) return renderStory(true);
  return renderHome();
}
window.addEventListener('hashchange', route);

function go(hash) { location.hash = hash; }

// ---------- 共通パーツ ----------
function topbar(title, back) {
  return el('div', { class: 'topbar' }, [
    back ? el('button', { class: 'tb-btn', text: '‹ 戻る', onclick: () => go(back) }) : el('span', { class: 'tb-spacer' }),
    el('span', { class: 'tb-title', text: title || '' }),
    el('button', { class: 'tb-btn', text: '進捗', onclick: () => go('#/progress') }),
  ]);
}

function screen(children) { clear(app); const m = el('main', {}, children); app.appendChild(m); window.scrollTo(0, 0); }

// ---------- ストーリー ----------
function dialogue(lines) {
  return el('div', { class: 'story-lines' }, (lines || []).map(l => {
    const who = CAST[l.who];
    return el('div', { class: 'story-line ' + (who ? 'say ' + l.who : 'narr') }, [
      who ? el('div', { class: 'story-who', text: who }) : null,
      el('div', { class: 'story-text', text: l.text }),
    ]);
  }));
}

function renderStory(first) {
  const done = STAGES.filter(st => st.missions.every(m => isDone(m.id))).length;
  const chapters = STAGES.map((st, i) => {
    const ch = chapterOf(st.id);
    const cleared = st.missions.every(m => isDone(m.id));
    const open = isMissionUnlocked(st.missions[0].id, isDone);
    return el('div', { class: 'chapter-row' + (open ? '' : ' locked') }, [
      el('div', { class: 'chapter-no', text: String(i + 1) }),
      el('div', { class: 'chapter-body' }, [
        el('div', { class: 'chapter-title', text: ch.title || st.title }),
        el('div', { class: 'chapter-sub', text: open ? (cleared ? '読了' : '進行中') : '未解放' }),
      ]),
    ]);
  });
  const all = done === STAGES.length;
  screen([
    topbar('ストーリー', first ? null : '#/'),
    el('div', { class: 'story-hero' }, [
      el('div', { class: 'hero-badge', text: 'PROLOGUE' }),
      el('h2', { class: 'detail-title', text: PROLOGUE.title }),
    ]),
    dialogue(PROLOGUE.lines),
    first ? el('div', { class: 'detail-cta' }, [el('button', { class: 'btn-primary', text: '訓練を始める ▸', onclick: () => { store.markStorySeen(); go('#/'); renderHome(); } })]) : null,
    first ? null : el('div', { class: 'section-label', text: '章の一覧' }),
    first ? null : el('div', { class: 'chapter-list' }, chapters),
    first || !all ? null : el('div', { class: 'section-label', text: 'エピローグ' }),
    first || !all ? null : dialogue(EPILOGUE.lines),
  ]);
}

// ---------- ホーム ----------
function renderHome() {
  const total = allMissions().length;
  const done = allMissions().filter(m => isDone(m.id)).length;
  const db = store.load();

  const header = el('div', { class: 'home-hero' }, [
    el('div', { class: 'hero-badge', text: 'SECURITY TRAINING' }),
    el('h1', { class: 'hero-title' }, [document.createTextNode('Cyber'), el('span', { class: 'accent', text: 'Lab' })]),
    el('p', { class: 'hero-sub', text: 'Linux × サイバーセキュリティ 実践演習' }),
    el('p', { class: 'hero-desc', text: '仮想環境のターミナルを操作し、調査・分析・防御の課題を自力で解く。スマホだけで学べる訓練シミュレーター。' }),
  ]);

  const stat = el('div', { class: 'stat-row' }, [
    statCard(String(done) + '/' + total, 'ミッション'),
    statCard(String(db.flags.length), '獲得フラグ'),
    statCard(String(db.learned.length), '習得トピック'),
  ]);

  // 続きから
  const next = allMissions().find(m => isMissionUnlocked(m.id, isDone) && !isDone(m.id));
  const cont = el('div', { class: 'home-actions' }, [
    el('button', { class: 'btn-primary', text: next ? (done ? '続きから学習する ▸' : '訓練を開始する ▸') : '全ミッション踏破済み ✓', onclick: () => next ? go('#/mission/' + next.id) : go('#/progress') }),
    el('button', { class: 'btn-ghost', text: 'ステージ一覧を見る', onclick: () => go('#/stage/' + STAGES[0].id) }),
    el('button', { class: 'btn-ghost', text: 'ストーリーを読む', onclick: () => go('#/story') }),
  ]);

  const map = el('div', { class: 'stage-list' }, STAGES.map(st => stageRow(st)));

  screen([
    topbar(''),
    header, stat, cont,
    el('div', { class: 'section-label', text: '学習ステージ' }),
    map,
    el('p', { class: 'foot-note', text: 'これは学習用シミュレーターです。実在のLinuxとは一部挙動が異なります（docs/LIMITATIONS.md）。実際のコマンド実行や外部通信は一切行いません。' }),
  ]);
}

function statCard(v, label) { return el('div', { class: 'stat-card' }, [el('div', { class: 'stat-val', text: v }), el('div', { class: 'stat-label', text: label })]); }

function stageRow(st) {
  const ms = st.missions;
  const d = ms.filter(m => isDone(m.id)).length;
  const unlocked = isMissionUnlocked(ms[0].id, isDone);
  const pct = Math.round((d / ms.length) * 100);
  return el('div', { class: 'stage-card' + (unlocked ? '' : ' locked'), onclick: () => unlocked && go('#/stage/' + st.id) }, [
    el('div', { class: 'stage-top' }, [
      el('div', { class: 'stage-name', text: st.title }),
      el('div', { class: 'stage-count', text: unlocked ? d + '/' + ms.length : '🔒' }),
    ]),
    el('div', { class: 'stage-sub', text: st.subtitle }),
    el('div', { class: 'bar' }, [el('div', { class: 'bar-fill', style: 'width:' + pct + '%' })]),
  ]);
}

// ---------- ステージ画面 ----------
function renderStage(stageId) {
  const st = STAGES.find(s => s.id === stageId);
  if (!st) return renderHome();
  const list = el('div', { class: 'mission-list' }, st.missions.map((m, i) => {
    const unlocked = isMissionUnlocked(m.id, isDone);
    const done = isDone(m.id);
    return el('div', { class: 'mission-card' + (unlocked ? '' : ' locked') + (done ? ' done' : ''), onclick: () => unlocked && go('#/mission/' + m.id) }, [
      el('div', { class: 'mc-icon', text: done ? '✓' : unlocked ? String(i + 1) : '🔒' }),
      el('div', { class: 'mc-body' }, [
        el('div', { class: 'mc-title', text: m.title }),
        el('div', { class: 'mc-meta', text: `およそ${m.minutes}分 ・ ${m.objectives.length}目標 ・ ${m.tasks.length}課題` }),
      ]),
      el('div', { class: 'mc-arrow', text: unlocked ? '›' : '' }),
    ]);
  }));
  const ch = chapterOf(st.id);
  const idx = STAGES.indexOf(st);
  const cleared = st.missions.every(m => isDone(m.id));
  screen([
    topbar(st.title, '#/'),
    el('div', { class: 'stage-hero' }, [
      el('div', { class: 'section-label', text: st.title }),
      ch.title ? el('div', { class: 'chapter-head', text: `第${idx + 1}章 ${ch.title}` }) : null,
      dialogue(ch.intro),
      el('p', { class: 'stage-intro', text: st.intro }),
    ]),
    list,
    cleared && ch.outro.length ? el('div', { class: 'section-label', text: 'この章の締め' }) : null,
    cleared ? dialogue(ch.outro) : null,
  ]);
}

// ---------- ミッション詳細（ブリーフィング） ----------
function renderMissionDetail(id) {
  const m = getMission(id);
  if (!m) return renderHome();
  const stageId = getStageOf(id);
  const mstate = store.missionState(id);

  const objectives = el('ul', { class: 'obj-list' }, m.objectives.map(o => el('li', { text: o })));
  const prereq = (m.prereq && m.prereq.length)
    ? el('div', { class: 'detail-block' }, [el('div', { class: 'db-label', text: '前提知識' }), el('div', { class: 'db-text', text: m.prereq.map(p => getMission(p)?.title || p).join(' / ') })])
    : null;

  const concepts = el('div', { class: 'concept-wrap' }, (m.concepts || []).map(c => conceptCard(c)));

  screen([
    topbar(m.title, '#/stage/' + stageId),
    el('div', { class: 'detail-hero' }, [
      el('div', { class: 'db-label', text: 'MISSION' }),
      el('h2', { class: 'detail-title', text: m.title }),
      el('div', { class: 'detail-tags' }, [tag('⏱ ' + m.minutes + '分'), tag('🎯 ' + m.objectives.length + '目標'), tag(mstate.done ? '✓ クリア済み' : '未クリア')]),
    ]),
    el('div', { class: 'detail-block briefing' }, [el('div', { class: 'db-label', text: '状況' }), el('div', { class: 'db-text', text: m.briefing })]),
    el('div', { class: 'detail-block' }, [el('div', { class: 'db-label', text: '学習目標' }), objectives]),
    prereq,
    el('div', { class: 'section-label', text: '事前解説' }),
    concepts,
    el('div', { class: 'detail-cta' }, [
      el('button', { class: 'btn-primary', text: '演習を始める ▸', onclick: () => go('#/play/' + id) }),
    ]),
  ]);
}

function conceptCard(c) {
  const row = (label, text) => text ? el('div', { class: 'concept-row' }, [el('span', { class: 'cr-label', text: label }), el('span', { class: 'cr-text', text: text })]) : null;
  return el('div', { class: 'concept-card' }, [
    el('div', { class: 'concept-title', text: c.title }),
    row('なぜ必要か', c.why),
    row('解決する問題', c.problem),
    row('仕組み', c.how),
    c.example ? el('pre', { class: 'concept-example', text: c.example }) : null,
    row('今回との関係', c.relation),
  ]);
}

function tag(t) { return el('span', { class: 'tag', text: t }); }

// ---------- 演習プレイ画面 ----------
function startPlay(id) {
  const m = getMission(id);
  if (!m) return renderHome();
  store.markStarted(id);
  const { shell } = buildEnvironment(m);
  const term = new Terminal(shell, { onCommand: () => { if (play) checkCurrentTask(true); } });
  play = { mission: m, shell, term, taskIdx: 0, view: 'mission', hintLevel: 0, solved: new Array(m.tasks.length).fill(false) };
  renderPlay();
  // 既にクリア済みなら最初から復習として解き直せる（進捗は保持）
}

function renderPlay() {
  const m = play.mission;

  // タブ切り替え（ミッション説明 / ターミナル）
  const tabs = el('div', { class: 'play-tabs' }, [
    el('button', { class: 'ptab' + (play.view === 'mission' ? ' active' : ''), text: '課題', onclick: () => { play.view = 'mission'; renderPlay(); } }),
    el('button', { class: 'ptab' + (play.view === 'terminal' ? ' active' : ''), text: 'ターミナル', onclick: () => { play.view = 'terminal'; renderPlay(); setTimeout(() => play.term.focus(), 50); } }),
  ]);

  const body = play.view === 'terminal' ? renderTerminalView() : renderTaskView();

  screen([
    el('div', { class: 'play-top' }, [
      el('button', { class: 'tb-btn', text: '‹ 中断', onclick: () => { if (confirm('演習を中断してミッション一覧へ戻りますか？進捗(クリア状況)は保持されます。')) { play = null; go('#/stage/' + getStageOf(m.id)); } } }),
      el('span', { class: 'play-title', text: m.title }),
      el('span', { class: 'play-prog', text: play.solved.filter(Boolean).length + '/' + m.tasks.length }),
    ]),
    tabs,
    body,
  ]);
}

function renderTerminalView() {
  const wrap = el('div', { class: 'term-wrap' });
  wrap.appendChild(play.term.el);
  // クイックコマンドバー
  const task = play.mission.tasks[play.taskIdx];
  const quick = (play.mission.quick || []);
  const qbar = el('div', { class: 'quickbar' }, [
    el('div', { class: 'quickbar-label', text: 'よく使うコマンド（タップで入力欄へ挿入）:' }),
    el('div', { class: 'quickbar-row' }, quick.map(q =>
      el('button', { class: 'quick-cmd', text: q, onclick: () => { play.view = 'terminal'; play.term.setLine(q); } })
    )),
  ]);
  return el('div', {}, [
    el('div', { class: 'cur-task-mini' }, [
      el('span', { class: 'ctm-label', text: '現在の課題 ' + (play.taskIdx + 1) + '/' + play.mission.tasks.length }),
      el('span', { class: 'ctm-text', text: task.q }),
    ]),
    wrap, qbar,
  ]);
}

function renderTaskView() {
  const m = play.mission;
  const idx = play.taskIdx;
  const task = m.tasks[idx];
  const solved = play.solved[idx];

  // タスクナビ（ドット）
  const dots = el('div', { class: 'task-dots' }, m.tasks.map((_, i) =>
    el('button', { class: 'tdot' + (i === idx ? ' cur' : '') + (play.solved[i] ? ' done' : ''), text: play.solved[i] ? '✓' : String(i + 1), onclick: () => { play.taskIdx = i; play.hintLevel = 0; renderPlay(); } })
  ));

  const blocks = [];
  if (task.narration) blocks.push(el('div', { class: 'narration' }, [el('span', { class: 'narr-mark', text: '▎' }), document.createTextNode(task.narration)]));
  blocks.push(el('div', { class: 'task-q' }, [el('div', { class: 'tq-num', text: 'Q' + (idx + 1) }), el('div', { class: 'tq-text', text: task.q })]));

  // 入力欄（answer系タスクのみ）
  const feedback = el('div', { class: 'feedback' });
  play.feedbackEl = feedback;

  if (needsAnswer(task) && !task.noInput) {
    const input = el('input', { class: 'answer-input', type: 'text', placeholder: task.answerHint || '答えを入力', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send' });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(input.value); });
    play.answerInput = input;
    blocks.push(el('div', { class: 'answer-row' }, [
      input,
      el('button', { class: 'btn-answer', text: '提出', onclick: () => submitAnswer(input.value) }),
    ]));
    blocks.push(el('div', { class: 'hint-note', text: 'ヒント: ターミナルで調べて、分かった値をここに入力します。' }));
  } else {
    // 状態判定タスク：ターミナルで操作 → 判定ボタン
    blocks.push(el('div', { class: 'hint-note', text: 'この課題はターミナルで操作して達成します。操作後、下のボタンで判定するか、コマンド実行ごとに自動で判定されます。' }));
    blocks.push(el('div', { class: 'answer-row' }, [
      el('button', { class: 'btn-answer wide', text: '達成を判定する', onclick: () => checkCurrentTask(false) }),
    ]));
  }
  blocks.push(feedback);

  // ターミナルへ
  blocks.push(el('button', { class: 'to-term', text: '⌨ ターミナルを開いて操作する', onclick: () => { play.view = 'terminal'; renderPlay(); setTimeout(() => play.term.focus(), 50); } }));

  // ヒント（段階的）
  const hintBox = el('div', { class: 'hint-box' });
  const hints = task.hints || [];
  for (let i = 0; i < play.hintLevel && i < hints.length; i++) {
    hintBox.appendChild(el('div', { class: 'hint-item' }, [el('span', { class: 'hint-k', text: 'ヒント' + (i + 1) }), document.createTextNode(hints[i])]));
  }
  const hintBtn = play.hintLevel < hints.length
    ? el('button', { class: 'hint-btn', text: play.hintLevel === 0 ? 'ヒントを見る (' + hints.length + '段階)' : 'さらにヒント (' + (play.hintLevel) + '/' + hints.length + ')', onclick: () => { play.hintLevel++; store.incHint(m.id); renderPlay(); } })
    : el('div', { class: 'hint-done', text: 'ヒントはすべて表示されました' });

  // 解説（解けたら表示）
  let explainBlock = null;
  if (solved && task.explain) {
    explainBlock = el('div', { class: 'explain-box' }, [el('div', { class: 'eb-label', text: '解説' }), el('div', { class: 'eb-text', text: task.explain })]);
  }

  // 次へ / 完了
  let navBlock = null;
  if (solved) {
    const isLast = idx === m.tasks.length - 1;
    if (isLast && play.solved.every(Boolean)) {
      navBlock = el('button', { class: 'btn-primary', text: 'ミッション完了 — 振り返りへ ▸', onclick: () => finishMission() });
    } else {
      navBlock = el('button', { class: 'btn-primary', text: '次の課題へ ▸', onclick: () => { play.taskIdx = Math.min(idx + 1, m.tasks.length - 1); play.hintLevel = 0; renderPlay(); } });
    }
  }

  return el('div', { class: 'task-view' }, [
    dots,
    el('div', { class: 'task-card' }, blocks),
    explainBlock,
    navBlock,
    el('div', { class: 'hint-wrap' }, [hintBox, hintBtn]),
  ]);
}

function submitAnswer(value) {
  const task = play.mission.tasks[play.taskIdx];
  const r = evaluate(task.check, value, { vfs: play.shell.vfs, shell: play.shell });
  showFeedback(r.ok, r.ok ? '正解！' : (r.detail || 'もう一度試してみましょう'));
  if (r.ok) markSolved();
}

function checkCurrentTask(silent) {
  const task = play.mission.tasks[play.taskIdx];
  if (play.solved[play.taskIdx]) return;
  if (needsAnswer(task) && !task.noInput) return; // 入力系は自動判定しない
  const r = evaluate(task.check, null, { vfs: play.shell.vfs, shell: play.shell });
  if (r.ok) { markSolved(); if (silent) flashToast('課題達成 ✓'); }
  else if (!silent) showFeedback(false, r.detail || 'まだ条件を満たしていません');
}

function markSolved() {
  const idx = play.taskIdx;
  if (play.solved[idx]) return;
  play.solved[idx] = true;
  store.markTaskDone(play.mission.id, idx);
  if (play.view === 'terminal') { flashToast('課題 ' + (idx + 1) + ' 達成 ✓'); }
  renderPlay();
}

function showFeedback(ok, text) {
  const fb = play.feedbackEl;
  if (!fb) { flashToast(text); return; }
  clear(fb);
  fb.className = 'feedback show ' + (ok ? 'ok' : 'ng');
  fb.appendChild(el('span', { text: (ok ? '✓ ' : '✕ ') + text }));
}

let toastTimer = null;
function flashToast(text) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast' }); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- ミッション完了・振り返り ----------
function finishMission() {
  const m = play.mission;
  store.markMissionDone(m.id);
  store.addLearned(m.learned);
  // フラグ付与（学習済みトピックを「フラグ」としてカウント的に扱う: ミッションID）
  store.addFlag('MISSION-' + m.id.toUpperCase());
  renderReview(m);
}

function renderReview(m) {
  const rv = m.review || {};
  const steps = el('ol', { class: 'rv-steps' }, (rv.steps || []).map(s => el('li', { text: s })));
  const cmds = el('div', { class: 'rv-cmds' }, (rv.commands || []).map(c =>
    el('div', { class: 'rv-cmd' }, [el('code', { class: 'rv-code', text: c.cmd }), el('span', { class: 'rv-mean', text: c.meaning })])
  ));

  const stageId = getStageOf(m.id);
  const st = STAGES.find(s => s.id === stageId);
  const nextInStage = st.missions.find(x => !isDone(x.id));
  const ch = chapterOf(st.id);
  const stageCleared = !nextInStage;
  const gameCleared = stageCleared && STAGES.every(x => x.missions.every(mm => isDone(mm.id)));
  let nextBtn;
  if (nextInStage) nextBtn = el('button', { class: 'btn-primary', text: '次のミッションへ ▸', onclick: () => { play = null; go('#/mission/' + nextInStage.id); } });
  else {
    const stIdx = STAGES.indexOf(st);
    const nextStage = STAGES[stIdx + 1];
    if (nextStage) nextBtn = el('button', { class: 'btn-primary', text: '次のステージへ ▸', onclick: () => { play = null; go('#/stage/' + nextStage.id); } });
    else nextBtn = el('button', { class: 'btn-primary', text: '学習進捗を見る ▸', onclick: () => { play = null; go('#/progress'); } });
  }

  screen([
    topbar('クリア', '#/stage/' + stageId),
    el('div', { class: 'clear-hero' }, [
      el('div', { class: 'clear-check', text: '✓' }),
      el('h2', { class: 'clear-title', text: 'ミッション達成' }),
      el('div', { class: 'clear-flag', text: 'FLAG{' + m.id + '}' }),
      el('p', { class: 'clear-sub', text: m.title }),
    ]),
    el('div', { class: 'detail-block' }, [el('div', { class: 'db-label', text: '正しい攻略手順' }), steps]),
    el('div', { class: 'detail-block' }, [el('div', { class: 'db-label', text: '使ったコマンドと意味' }), cmds]),
    rv.why ? el('div', { class: 'detail-block' }, [el('div', { class: 'db-label', text: 'なぜこの操作が必要だったか' }), el('div', { class: 'db-text', text: rv.why })]) : null,
    rv.practice ? el('div', { class: 'detail-block' }, [el('div', { class: 'db-label', text: '実務での使いどころ' }), el('div', { class: 'db-text', text: rv.practice })]) : null,
    rv.related && rv.related.length ? el('div', { class: 'detail-block' }, [el('div', { class: 'db-label', text: '次につながる知識' }), el('div', { class: 'chips' }, rv.related.map(r => el('span', { class: 'chip', text: r })))]) : null,
    stageCleared && ch.outro.length ? el('div', { class: 'section-label', text: `第${STAGES.indexOf(st) + 1}章 クリア` }) : null,
    stageCleared ? dialogue(ch.outro) : null,
    gameCleared ? el('div', { class: 'section-label', text: EPILOGUE.title }) : null,
    gameCleared ? dialogue(EPILOGUE.lines) : null,
    el('div', { class: 'detail-cta' }, [nextBtn]),
  ]);
}

// ---------- 進捗画面 ----------
function renderProgress() {
  const db = store.load();
  const total = allMissions().length;
  const done = allMissions().filter(m => isDone(m.id)).length;

  const stageProg = el('div', { class: 'prog-stages' }, STAGES.map(st => {
    const d = st.missions.filter(m => isDone(m.id)).length;
    const pct = Math.round(d / st.missions.length * 100);
    return el('div', { class: 'prog-stage' }, [
      el('div', { class: 'ps-top' }, [el('span', { text: st.title }), el('span', { class: 'ps-num', text: d + '/' + st.missions.length })]),
      el('div', { class: 'bar' }, [el('div', { class: 'bar-fill', style: 'width:' + pct + '%' })]),
    ]);
  }));

  const learned = el('div', { class: 'chips' }, db.learned.length ? db.learned.map(t => el('span', { class: 'chip', text: t })) : [el('span', { class: 'muted-text', text: 'まだありません' })]);
  const flags = el('div', { class: 'flag-list' }, db.flags.length ? db.flags.map(f => el('div', { class: 'flag-item', text: '🚩 ' + f })) : [el('span', { class: 'muted-text', text: 'まだありません' })]);

  // 設定：フォントサイズ
  const fs = store.getSettings().fontSize;
  const fontRow = el('div', { class: 'settings-row' }, [
    el('span', { text: '文字サイズ' }),
    el('div', { class: 'seg' }, ['s', 'm', 'l'].map(s =>
      el('button', { class: 'seg-btn' + (fs === s ? ' active' : ''), text: s === 's' ? '小' : s === 'm' ? '中' : '大', onclick: () => { store.setSetting('fontSize', s); applyFontSize(); renderProgress(); } })
    )),
  ]);

  screen([
    topbar('学習進捗', '#/'),
    el('div', { class: 'stat-row' }, [
      statCard(Math.round(done / total * 100) + '%', '総合達成率'),
      statCard(done + '/' + total, 'ミッション'),
      statCard(String(db.flags.length), 'フラグ'),
    ]),
    el('div', { class: 'section-label', text: 'ステージ進捗' }), stageProg,
    el('div', { class: 'section-label', text: '習得トピック' }), learned,
    el('div', { class: 'section-label', text: '獲得フラグ' }), flags,
    el('div', { class: 'section-label', text: '設定' }), fontRow,
    el('div', { class: 'section-label', text: 'データ管理' }),
    el('div', { class: 'data-actions' }, [
      el('button', { class: 'btn-ghost', text: '進捗をエクスポート', onclick: () => store.exportData() }),
      el('label', { class: 'btn-ghost file-label' }, [document.createTextNode('インポート'), el('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: (e) => store.importData(e.target.files[0], ok => { if (ok) { flashToast('インポートしました'); route(); } else flashToast('読み込みに失敗'); }) })]),
      el('button', { class: 'btn-danger', text: 'すべてリセット', onclick: () => { if (confirm('すべての進捗を削除します。よろしいですか？')) { store.resetAll(); route(); } } }),
    ]),
    el('p', { class: 'foot-note', text: '進捗はこの端末のブラウザ内(localStorage)にのみ保存されます。機種変更前にエクスポートしてください。' }),
  ]);
}

function applyFontSize() {
  const fs = store.getSettings().fontSize;
  document.documentElement.setAttribute('data-fs', fs);
}

// ---------- 起動 ----------
applyFontSize();
route();
