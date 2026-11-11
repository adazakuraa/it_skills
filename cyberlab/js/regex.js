// 依存のない葉モジュール（循環参照を避けるため commands.js から分離）
// POSIX 正規表現(BRE/ERE) → JavaScript RegExp ソース変換。
// BRE(既定): \| \( \) \{ \} \+ \? が特殊、素の | ( ) { } + ? はリテラル。ERE(-E): 逆。
const POSIX_CLASS = { alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f' };
export function posixToJs(pat, ere) {
  let out = ''; let i = 0; let inBr = false;
  const SPECIAL = '|(){}+?';
  while (i < pat.length) {
    const c = pat[i];
    if (inBr) {
      if (c === ']') { inBr = false; out += ']'; i++; continue; }
      if (c === '[' && pat[i + 1] === ':') {
        const end = pat.indexOf(':]', i + 2);
        if (end > 0) { out += POSIX_CLASS[pat.slice(i + 2, end)] ?? ''; i = end + 2; continue; }
      }
      out += c === '\\' ? '\\\\' : c; i++; continue;
    }
    if (c === '[') {
      inBr = true; out += '['; i++;
      if (pat[i] === '^') { out += '^'; i++; }
      if (pat[i] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (c === '\\') {
      const n = pat[i + 1]; i += 2;
      if (n === undefined) { out += '\\\\'; break; }
      if (SPECIAL.includes(n)) { out += ere ? '\\' + n : n; continue; }
      if (n === '<' || n === '>') { out += '\\b'; continue; }
      out += '\\' + n; continue;
    }
    if (!ere && SPECIAL.includes(c)) { out += '\\' + c; i++; continue; }
    out += c; i++;
  }
  return out;
}

