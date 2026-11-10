// ============================================================
// ミッション達成判定（宣言的）。実行履歴ではなく「結果の状態」で判定する。
// ============================================================
import { nodeSize } from './vfs.js';

function norm(s) { return String(s == null ? '' : s).trim(); }

/**
 * task.check を評価して { ok, detail } を返す。
 * @param check  判定定義（下記のいずれか）
 * @param answer プレイヤーの入力（answer系チェック用）。null可。
 * @param runtime { vfs, shell }
 *
 * check の種類:
 *  { type:'answer', equals:'...', any:['..'], regex:'..', ci:true, normalizeIp:true }
 *  { type:'state', path, mode:'640' }                 権限が一致
 *  { type:'state', path, exists:true|false }
 *  { type:'state', path, owner:'alice', group:'dev' }
 *  { type:'state', path, contains:'...', notContains:'..', ci:true }
 *  { type:'state', path, empty:true }
 *  { type:'process', absent:'cmdパターン' }           該当プロセスが存在しない
 *  { type:'process', present:'cmdパターン' }
 *  { type:'service', name:'ssh', active:false }
 *  { type:'all', of:[...] }                            すべて満たす
 *  { type:'any', of:[...] }                            いずれか満たす
 */
export function evaluate(check, answer, runtime) {
  if (!check) return { ok: false, detail: 'チェック未定義' };
  const { vfs, shell } = runtime;
  switch (check.type) {
    case 'answer': {
      let a = norm(answer);
      let targets = check.any ? check.any.slice() : (check.equals != null ? [check.equals] : []);
      if (check.ci) { a = a.toLowerCase(); targets = targets.map(t => String(t).toLowerCase()); }
      if (check.normalizeIp) a = a.replace(/[^\d.]/g, '');
      if (check.stripFlag) a = a.replace(/^FLAG\{|\}$/gi, '');
      if (check.regex) {
        try { if (new RegExp(check.regex, check.ci ? 'i' : '').test(a)) return { ok: true }; }
        catch { /* ignore */ }
      }
      if (targets.some(t => norm(t) === a || (check.ci && norm(t).toLowerCase() === a))) return { ok: true };
      return { ok: false, detail: '入力が一致しません' };
    }
    case 'state': {
      let node;
      try { node = vfs.lookup(check.path, '/', null, { allowMissing: true }); } catch { node = null; }
      if (check.exists === false) return node ? { ok: false, detail: `${check.path} がまだ存在します` } : { ok: true };
      if (check.exists === true || check.exists == null) { if (!node) return { ok: false, detail: `${check.path} が見つかりません` }; }
      if (!node) return { ok: false, detail: `${check.path} が見つかりません` };
      if (check.mode != null) {
        const want = typeof check.mode === 'string' ? parseInt(check.mode, 8) : check.mode;
        if ((node.mode & 0o7777) !== want) return { ok: false, detail: `${check.path} の権限が ${(node.mode & 0o7777).toString(8)} です（目標 ${want.toString(8)}）` };
      }
      if (check.modeHas != null) {
        const bits = typeof check.modeHas === 'string' ? parseInt(check.modeHas, 8) : check.modeHas;
        if ((node.mode & bits) !== bits) return { ok: false, detail: `${check.path} に必要な権限ビットが足りません` };
      }
      if (check.maxMode != null) {
        const max = typeof check.maxMode === 'string' ? parseInt(check.maxMode, 8) : check.maxMode;
        if ((node.mode & 0o7777) & ~max) return { ok: false, detail: `${check.path} に余分な権限ビットがあります` };
      }
      if (check.owner != null) { const u = vfs.userByName(check.owner); if (!u || node.uid !== u.uid) return { ok: false, detail: `${check.path} の所有者が違います` }; }
      if (check.group != null) { const g = vfs.groupByName(check.group); if (!g || node.gid !== g.gid) return { ok: false, detail: `${check.path} のグループが違います` }; }
      if (check.type2 != null) { if ((check.type2 === 'd') !== (node.type === 'd')) return { ok: false, detail: `${check.path} の種別が違います` }; }
      if (check.empty === true && node.type === 'f' && node.content !== '') return { ok: false, detail: `${check.path} が空ではありません` };
      if (check.contains != null) { const hay = check.ci ? node.content.toLowerCase() : node.content; const needle = check.ci ? check.contains.toLowerCase() : check.contains; if (!hay.includes(needle)) return { ok: false, detail: `${check.path} に必要な内容が含まれていません` }; }
      if (check.regex != null) { try { if (!new RegExp(check.regex, check.ci ? 'i' : '').test(node.content)) return { ok: false, detail: `${check.path} が条件を満たしません` }; } catch { } }
      if (check.notContains != null) { const hay = check.ci ? node.content.toLowerCase() : node.content; const needle = check.ci ? check.notContains.toLowerCase() : check.notContains; if (hay.includes(needle)) return { ok: false, detail: `${check.path} にまだ「${check.notContains}」が残っています` }; }
      if (check.minSize != null && nodeSize(node) < check.minSize) return { ok: false, detail: `${check.path} の内容が不足しています` };
      return { ok: true };
    }
    case 'process': {
      const list = shell.processes;
      if (check.absent != null) return list.some(p => p.cmd.includes(check.absent)) ? { ok: false, detail: `「${check.absent}」のプロセスがまだ動いています` } : { ok: true };
      if (check.present != null) return list.some(p => p.cmd.includes(check.present)) ? { ok: true } : { ok: false, detail: `「${check.present}」のプロセスが見つかりません` };
      return { ok: false, detail: 'process チェック定義が不正です' };
    }
    case 'service': {
      const s = shell.services.find(x => x.name === check.name);
      if (!s) return { ok: false, detail: `サービス ${check.name} が見つかりません` };
      if (check.active != null && s.active !== check.active) return { ok: false, detail: `サービス ${check.name} の状態が目標と違います` };
      if (check.enabled != null && s.enabled !== check.enabled) return { ok: false, detail: `サービス ${check.name} の自動起動設定が目標と違います` };
      return { ok: true };
    }
    case 'env': {
      const v = shell.env[check.name];
      if (check.equals != null) return norm(v) === norm(check.equals) ? { ok: true } : { ok: false, detail: `環境変数 ${check.name} が目標と違います` };
      if (check.contains != null) return (v || '').includes(check.contains) ? { ok: true } : { ok: false, detail: `環境変数 ${check.name} に ${check.contains} が含まれていません` };
      return v != null ? { ok: true } : { ok: false, detail: `環境変数 ${check.name} が未設定です` };
    }
    case 'all': {
      for (const sub of check.of) { const r = evaluate(sub, answer, runtime); if (!r.ok) return r; }
      return { ok: true };
    }
    case 'any': {
      let last = { ok: false, detail: '条件を満たしていません' };
      for (const sub of check.of) { const r = evaluate(sub, answer, runtime); if (r.ok) return { ok: true }; last = r; }
      return last;
    }
    default:
      return { ok: false, detail: `未知のチェック種別: ${check.type}` };
  }
}

/** タスクが入力欄を必要とするか */
export function needsAnswer(task) {
  const walk = c => {
    if (!c) return false;
    if (c.type === 'answer') return true;
    if (c.of) return c.of.some(walk);
    return false;
  };
  return walk(task.check);
}
