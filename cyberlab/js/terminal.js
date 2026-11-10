// ============================================================
// ターミナルUI。出力はすべて textContent（XSS対策）。
// スマホ向け：補完・履歴・クイックキー・コマンド挿入。
// ============================================================
import { el, clear } from './util.js';

export class Terminal {
  constructor(shell, { onCommand } = {}) {
    this.shell = shell;
    this.onCommand = onCommand || (() => {});
    this.histIdx = -1;
    this.draft = '';
    this.el = this.build();
    this.printMotd();
  }

  build() {
    const output = el('div', { class: 'term-output', 'aria-live': 'polite' });
    this.output = output;

    const promptSpan = el('span', { class: 'term-prompt' });
    this.promptSpan = promptSpan;
    const input = el('input', {
      class: 'term-input', type: 'text', autocapitalize: 'off', autocorrect: 'off',
      autocomplete: 'off', spellcheck: 'false', 'aria-label': 'コマンド入力',
      enterkeyhint: 'go', inputmode: 'text',
    });
    this.input = input;
    input.addEventListener('keydown', e => this.onKey(e));

    const inputRow = el('div', { class: 'term-inputrow' }, [promptSpan, input]);
    this.updatePrompt();

    // 補完候補バー
    this.comp = el('div', { class: 'term-comp' });

    // キーボード補助バー（Tab / 矢印 / 記号）
    const keybar = el('div', { class: 'term-keybar' });
    const keys = [
      ['⇥', () => this.doComplete()],
      ['↑', () => this.history(-1)],
      ['↓', () => this.history(1)],
      ['/', () => this.insert('/')],
      ['-', () => this.insert('-')],
      ['|', () => this.insert(' | ')],
      ['~', () => this.insert('~')],
      ['$', () => this.insert('$')],
      ['⌫', () => this.backspace()],
      ['⏎', () => this.submit()],
    ];
    for (const [label, fn] of keys) {
      keybar.appendChild(el('button', { class: 'kb', type: 'button', text: label, onclick: (e) => { e.preventDefault(); fn(); this.input.focus(); } }));
    }
    this.keybar = keybar;

    const term = el('div', { class: 'terminal' }, [output, this.comp, inputRow, keybar]);
    term.addEventListener('click', (e) => { if (e.target === term || e.target === output) this.input.focus(); });
    return term;
  }

  updatePrompt() { this.promptSpan.textContent = this.shell.prompt(); }

  printMotd() {
    this.write(`CyberLab 訓練用ターミナル (シミュレーター)\nホスト: ${this.shell.hostname}  ユーザー: ${this.shell.user.name}\n'help' でコマンド一覧、'man <cmd>' で使い方を表示します。\n`, 'muted');
  }

  write(text, cls) {
    if (text.includes('\u001b[CLEAR]')) { clear(this.output); return; }
    const line = el('div', { class: 'term-line' + (cls ? ' ' + cls : '') });
    line.textContent = text;
    this.output.appendChild(line);
    this.scroll();
  }

  echoCommand(cmd) {
    const line = el('div', { class: 'term-line term-echo' });
    line.appendChild(el('span', { class: 'term-prompt-inline', text: this.shell.prompt() }));
    line.appendChild(document.createTextNode(cmd));
    this.output.appendChild(line);
  }

  scroll() { requestAnimationFrame(() => { this.output.scrollTop = this.output.scrollHeight; }); }

  onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
    else if (e.key === 'Tab') { e.preventDefault(); this.doComplete(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.history(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.history(1); }
    else { this.hideComp(); }
  }

  insert(text) {
    const i = this.input;
    const start = i.selectionStart ?? i.value.length;
    const end = i.selectionEnd ?? i.value.length;
    i.value = i.value.slice(0, start) + text + i.value.slice(end);
    const pos = start + text.length;
    i.setSelectionRange(pos, pos);
  }
  backspace() {
    const i = this.input;
    const start = i.selectionStart ?? i.value.length;
    const end = i.selectionEnd ?? i.value.length;
    if (start === end && start > 0) { i.value = i.value.slice(0, start - 1) + i.value.slice(end); i.setSelectionRange(start - 1, start - 1); }
    else { i.value = i.value.slice(0, start) + i.value.slice(end); i.setSelectionRange(start, start); }
  }

  /** 外部（クイックコマンドボタン等）からの挿入 */
  setLine(text, { run = false } = {}) {
    this.input.value = text;
    this.input.focus();
    this.input.setSelectionRange(text.length, text.length);
    if (run) this.submit();
  }

  history(dir) {
    const h = this.shell.history;
    if (!h.length) return;
    if (this.histIdx === -1) { this.draft = this.input.value; this.histIdx = h.length; }
    this.histIdx += dir;
    if (this.histIdx < 0) this.histIdx = 0;
    if (this.histIdx >= h.length) { this.histIdx = -1; this.input.value = this.draft; return; }
    this.input.value = h[this.histIdx];
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
  }

  hideComp() { this.comp.classList.remove('show'); clear(this.comp); }

  doComplete() {
    const { before, cur, cands } = this.shell.complete(this.input.value);
    if (cands.length === 0) { this.hideComp(); return; }
    if (cands.length === 1) {
      this.input.value = before + cands[0];
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
      this.hideComp();
      return;
    }
    // 共通接頭辞まで補完
    const common = commonPrefix(cands);
    if (common.length > cur.length) {
      this.input.value = before + common;
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }
    // 候補をタップで選べるように表示
    clear(this.comp);
    for (const c of cands.slice(0, 40)) {
      this.comp.appendChild(el('button', { class: 'comp-item', type: 'button', text: c, onclick: (e) => { e.preventDefault(); this.input.value = before + c; this.input.focus(); this.input.setSelectionRange(this.input.value.length, this.input.value.length); this.hideComp(); } }));
    }
    this.comp.classList.add('show');
  }

  submit() {
    const line = this.input.value;
    this.input.value = '';
    this.histIdx = -1;
    this.hideComp();
    this.echoCommand(line);
    if (line.trim() === '') { this.updatePrompt(); this.scroll(); return; }
    let chunks;
    try { chunks = this.shell.run(line); }
    catch (err) { this.write('内部エラー: ' + err.message, 'err'); this.updatePrompt(); return; }
    for (const c of chunks) this.write(c.text.replace(/\n$/, ''), c.fd === 2 ? 'err' : null);
    this.updatePrompt();
    this.scroll();
    this.onCommand(line, chunks);
  }

  focus() { this.input.focus(); }
}

function commonPrefix(arr) {
  if (!arr.length) return '';
  let p = arr[0];
  for (const s of arr) { let i = 0; while (i < p.length && i < s.length && p[i] === s[i]) i++; p = p.slice(0, i); }
  return p;
}
