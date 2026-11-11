// コンテンツ品質監査（node tests/audit.mjs）
// 機械的に検出できる品質問題を一覧化する。テスト(run.mjs)と違い失敗で終了しない。
import { buildEnvironment } from '../js/env.js';
import { needsAnswer } from '../js/checker.js';
import { STAGES, allMissions, getMission } from '../js/missions/index.js';

const issues = [];
const add = (sev, id, msg) => issues.push({ sev, id, msg });

function isMcq(task) { return /\n1\) /.test(task.q || ''); }

for (const m of allMissions()) {
  // --- 構造・メタ情報 ---
  for (const p of (m.prereq || [])) if (!getMission(p)) add('HIGH', m.id, `prereq "${p}" が存在しない`);
  if (!m.briefing || m.briefing.length < 40) add('MID', m.id, 'briefing が短い');
  if (!m.concepts || !m.concepts.length) add('MID', m.id, '事前解説(concepts)がない');
  for (const c of (m.concepts || [])) {
    for (const k of ['why', 'problem', 'how', 'relation']) if (!c[k]) add('LOW', m.id, `concept「${c.title}」に ${k} がない`);
  }
  const rv = m.review || {};
  if (!rv.practice) add('LOW', m.id, 'review.practice(実務での使い所)が空');
  if (!rv.related || !rv.related.length) add('LOW', m.id, 'review.related が空');

  // --- タスク ---
  const mcqCount = m.tasks.filter(isMcq).length;
  const handsOn = m.tasks.some(t => !isMcq(t));
  if (!handsOn && (m.env && (m.env.files || m.env.network))) add('MID', m.id, '環境を用意しているのに全タスクが選択式');
  m.tasks.forEach((t, i) => {
    const tag = `${m.id}#${i + 1}`;
    if ((t.hints || []).length < 3) add('MID', tag, `ヒントが${(t.hints || []).length}段階(3段階が要件)`);
    if (!t.explain || t.explain.length < 60) add('MID', tag, '解説(explain)が短い');
    if (!isMcq(t) && !t.narration) add('LOW', tag, 'narration(導入)がない');
    // mcq の既定ヒントは3段目で答えを直接言う → 1段目/2段目が汎用すぎないか
    if (isMcq(t) && (t.hints || [])[0] === '各選択肢の意味を1つずつ吟味する') add('LOW', tag, 'mcqのヒントが汎用文のまま(問題固有の方向性がない)');
  });

  // --- 模範解答の実行検査 ---
  const { shell } = buildEnvironment(m);
  for (const line of (m.solution || [])) {
    const chunks = shell.run(line);
    const err = chunks.filter(c => c.fd === 2).map(c => c.text).join('');

    if (/command not found|未対応|内部エラー|invalid option|unrecognized option/.test(err)) add('HIGH', m.id, `模範解答が失敗: ${line} → ${err.trim().slice(0, 80)}`);
  }

  // --- 学習済みトピック ---
  if (!m.learned || !m.learned.length) add('LOW', m.id, 'learned が空');
}

// --- ステージ単位 ---
for (const st of STAGES) {
  const hands = st.missions.filter(m => m.tasks.some(t => !isMcq(t))).length;
  if (hands / st.missions.length < 0.3) add('MID', st.id, `実技ミッションの割合が低い(${hands}/${st.missions.length})`);
}

const order = ['HIGH', 'MID', 'LOW'];
const counts = {};
for (const sev of order) counts[sev] = issues.filter(i => i.sev === sev).length;
console.log(`監査結果: HIGH=${counts.HIGH} MID=${counts.MID} LOW=${counts.LOW}  (全${allMissions().length}ミッション)\n`);
for (const sev of order) {
  const list = issues.filter(i => i.sev === sev);
  if (!list.length) continue;
  console.log(`## ${sev} (${list.length})`);
  for (const i of list.slice(0, 60)) console.log(`  [${i.id}] ${i.msg}`);
  if (list.length > 60) console.log(`  ... 他 ${list.length - 60} 件`);
}
