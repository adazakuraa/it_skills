// ============================================================
// 進捗・学習履歴・設定の永続化（localStorage）。読み込み時にスキーマ検証。
// ============================================================
const KEY = 'cyberlab_v1';

const DEFAULT = {
  version: 1,
  missions: {},   // missionId -> { done, tasksDone, started, completedAt, usedHints }
  flags: [],      // 取得したフラグ文字列
  learned: [],    // 学習済みトピック
  settings: { fontSize: 'm' },
  storySeen: false, // プロローグ既読
};

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? validate(JSON.parse(raw)) : structuredCloneSafe(DEFAULT);
  } catch { cache = structuredCloneSafe(DEFAULT); }
  return cache;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable */ }
}

function validate(obj) {
  const out = structuredCloneSafe(DEFAULT);
  if (!obj || typeof obj !== 'object') return out;
  if (obj.missions && typeof obj.missions === 'object') {
    for (const [k, v] of Object.entries(obj.missions)) {
      if (typeof k !== 'string' || k.length > 100 || !v || typeof v !== 'object') continue;
      out.missions[k] = {
        done: !!v.done,
        tasksDone: Array.isArray(v.tasksDone) ? v.tasksDone.filter(n => Number.isInteger(n)).slice(0, 100) : [],
        started: !!v.started,
        completedAt: typeof v.completedAt === 'number' ? v.completedAt : null,
        usedHints: Number.isInteger(v.usedHints) ? v.usedHints : 0,
      };
    }
  }
  if (Array.isArray(obj.flags)) out.flags = [...new Set(obj.flags.filter(f => typeof f === 'string' && f.length < 200))].slice(0, 500);
  if (Array.isArray(obj.learned)) out.learned = [...new Set(obj.learned.filter(f => typeof f === 'string' && f.length < 200))].slice(0, 500);
  out.storySeen = obj.storySeen === true;
  if (obj.settings && typeof obj.settings === 'object') {
    if (['s', 'm', 'l'].includes(obj.settings.fontSize)) out.settings.fontSize = obj.settings.fontSize;
  }
  return out;
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

// ---------- API ----------
export function missionState(id) {
  const db = load();
  if (!db.missions[id]) db.missions[id] = { done: false, tasksDone: [], started: false, completedAt: null, usedHints: 0 };
  return db.missions[id];
}
export function markStarted(id) { missionState(id).started = true; save(); }
export function markTaskDone(id, idx) {
  const m = missionState(id);
  if (!m.tasksDone.includes(idx)) { m.tasksDone.push(idx); save(); }
}
export function markMissionDone(id) {
  const m = missionState(id);
  if (!m.done) { m.done = true; m.completedAt = Date.now(); save(); }
}
export function addFlag(flag) {
  const db = load();
  if (!db.flags.includes(flag)) { db.flags.push(flag); save(); }
}
export function addLearned(topics) {
  const db = load();
  let changed = false;
  for (const t of (topics || [])) if (!db.learned.includes(t)) { db.learned.push(t); changed = true; }
  if (changed) save();
}
export function incHint(id) { missionState(id).usedHints++; save(); }
export function storySeen() { return load().storySeen === true; }
export function markStorySeen() { load().storySeen = true; save(); }
export function getSettings() { return load().settings; }
export function setSetting(k, v) { load().settings[k] = v; save(); }

export function exportData() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'cyberlab_progress.json'; a.click();
  URL.revokeObjectURL(url);
}
export function importData(file, done) {
  const r = new FileReader();
  r.onload = () => { try { cache = validate(JSON.parse(r.result)); save(); done(true); } catch { done(false); } };
  r.readAsText(file);
}
export function resetAll() { cache = structuredCloneSafe(DEFAULT); save(); }
