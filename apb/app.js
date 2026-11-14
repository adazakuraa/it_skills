/* AP科目B 過去問ノート — Vanilla JS / ハッシュルーティング / localStorage */
(() => {
  'use strict';

  const KEY = 'apb_progress_v1';
  const PREF = 'apb_pref_v1';
  const STATUS = ['未学習', '要復習', '理解した'];
  const $app = document.getElementById('app');

  // ---------- storage ----------
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
  let prog = load(KEY, { q: {}, last: null });
  let pref = load(PREF, { hide: true, ratio: 55, zoom: 1, theme: 'auto', paper: 'normal', homeTab: 'field' });
  const qp = id => (prog.q[id] ||= { s: 0, star: false, memo: '' });
  const getQ = id => prog.q[id] || { s: 0, star: false, memo: '' };
  const commit = () => save(KEY, prog);
  const setPref = (k, v) => { pref[k] = v; save(PREF, pref); };

  const applyTheme = () => {
    const r = document.documentElement;
    if (pref.theme === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = pref.theme;
    r.dataset.paper = pref.paper;
  };
  applyTheme();

  // ---------- data ----------
  const DB = { fields: [], exams: [], cat: [], byId: {}, content: {} };
  const getJSON = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(url); return r.json(); });

  async function boot() {
    const [fields, exams, cat] = await Promise.all([
      getJSON('data/fields.json'),
      getJSON('data/exams.json').catch(() => []),
      getJSON('data/catalog.json').catch(() => []),
    ]);
    DB.fields = fields;
    DB.exams = exams;
    const order = Object.fromEntries(exams.map(e => [e.id, e.order]));
    DB.cat = cat.sort((a, b) => (order[b.exam] || 0) - (order[a.exam] || 0) || a.no - b.no);
    DB.cat.forEach(q => { DB.byId[q.id] = q; });
    window.addEventListener('hashchange', route);
    route();
  }

  const examLabel = id => (DB.exams.find(e => e.id === id) || { label: id }).label;
  const fieldOf = no => DB.fields.find(f => f.no === no);
  const inField = no => DB.cat.filter(q => q.no === no);
  let bundleP = null;
  const bundle = () => (bundleP ||= getJSON('data/bundle.json').catch(() => ({ content: {}, text: {} })));
  async function content(id) {
    const b = await bundle();
    return b.content[id] || null;
  }

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // **太字** だけ軽くサポート
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const I = {
    back: '<svg class="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg class="i" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
    star: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    starF: '<svg class="i" viewBox="0 0 24 24" style="fill:currentColor"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    chev: '<svg class="i chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    gear: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    book: '<svg class="i" viewBox="0 0 24 24"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 5v16M8 7h7"/></svg>',
  };
  const stats = list => {
    const n = list.length; let ok = 0, re = 0;
    list.forEach(q => { const s = getQ(q.id).s; if (s === 2) ok++; else if (s === 1) re++; });
    return { n, ok, re };
  };
  const track = ({ n, ok, re }) => n
    ? `<div class="bar-track"><i class="ok" style="width:${ok / n * 100}%"></i><i class="re" style="width:${re / n * 100}%"></i></div>`
    : '<div class="bar-track"></div>';
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  const bar = (title, sub, backHref, right = '') => `
    <header class="bar">
      ${backHref ? `<a class="back" href="${backHref}" aria-label="戻る">${I.back}</a>` : '<span style="width:8px"></span>'}
      <div class="ttl"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      ${right}
    </header>`;

  // ---------- router ----------
  let cleanup = null;
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    // ルート例: #f-3 / #e-r06a / #q-r06a-q01 / #q-r06a-q01-split / #prefs
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    document.body.style.overflow = '';
    let m;
    if ((m = h.match(/^f-(\d+)$/))) return viewField(+m[1]);
    if ((m = h.match(/^e-([a-z0-9]+)$/))) return viewExam(m[1]);
    if ((m = h.match(/^q-([a-z0-9]+-q\d+)(-split)?$/))) return viewQuestion(m[1], m[2] ? 'split' : 'sum');
    if (h === 'prefs') return viewSettings();
    return viewHome();
  }

  // ---------- home ----------
  function viewHome() {
    const all = stats(DB.cat);
    const last = prog.last && DB.byId[prog.last];
    const tab = pref.homeTab;
    const fieldsHtml = DB.fields.map(f => {
      const st = stats(inField(f.no));
      return `<a class="fcard" href="#f-${f.no}">
        <span class="no">問${f.no}${f.required ? '<em>必須</em>' : ''}</span>
        <span class="nm">${esc(f.name)}</span>
        <span class="ct">${st.ok}/${st.n} 理解${st.re ? ` ・ 復習${st.re}` : ''}</span>
        ${track(st)}
      </a>`;
    }).join('');
    const examsHtml = DB.exams.map(e => {
      const st = stats(DB.cat.filter(q => q.exam === e.id));
      return `<a class="erow" href="#e-${e.id}"><b>${esc(e.label)}</b><small>${st.ok}/${st.n}</small>${I.next}</a>`;
    }).join('') || '<div class="empty">まだ過去問データがありません</div>';
    const stars = DB.cat.filter(q => getQ(q.id).star);
    const reviews = DB.cat.filter(q => getQ(q.id).s === 1);

    $app.innerHTML = `
      ${bar('AP科目B 過去問ノート', '', '', `<a class="icon-btn" href="#prefs" aria-label="設定">${I.gear}</a>`)}
      <main class="wrap">
        <section class="hero">
          <div class="kicker">応用情報技術者 科目B（午後）</div>
          <h1>分野ごとに、要約→問題→解答</h1>
          <p>${DB.exams.length ? `${esc(DB.exams[DB.exams.length - 1].label)}〜${esc(DB.exams[0].label)}・${DB.cat.length}問` : '過去問データを準備中です'}</p>
        </section>
        <div class="meter">
          <div class="row"><span>理解した問題</span><span><b>${all.ok}</b> / ${all.n}</span></div>
          ${track(all)}
          <div class="legend"><span style="--c:var(--ok)">理解した ${all.ok}</span><span style="--c:var(--warn)">要復習 ${all.re}</span></div>
        </div>
        ${last ? `<a class="resume" href="#q-${last.id}">
          <div><div class="lab">続きから</div><div class="t">${esc(examLabel(last.exam))} 問${last.no}　${esc(last.title)}</div></div>${I.next}</a>` : ''}

        <div class="sec-h">
          <div class="seg" role="tablist">
            <button data-tab="field" class="${tab === 'field' ? 'on' : ''}">分野別</button>
            <button data-tab="exam" class="${tab === 'exam' ? 'on' : ''}">回別</button>
            <button data-tab="mark" class="${tab === 'mark' ? 'on' : ''}">★・復習</button>
          </div>
        </div>
        <div id="tabbody">
          ${tab === 'field' ? `<div class="fields">${fieldsHtml}</div>`
            : tab === 'exam' ? `<div class="exams">${examsHtml}</div>`
            : `<div class="sec-h" style="margin-top:4px"><h2>★ お気に入り</h2><small>${stars.length}問</small></div>
               <div class="qlist">${stars.map(qRow).join('') || '<div class="empty">問題ページの☆をタップすると追加されます</div>'}</div>
               <div class="sec-h"><h2>要復習</h2><small>${reviews.length}問</small></div>
               <div class="qlist">${reviews.map(qRow).join('') || '<div class="empty">「要復習」にした問題がここに並びます</div>'}</div>`}
        </div>
        <footer class="foot">
          出典：独立行政法人情報処理推進機構（IPA）応用情報技術者試験 午後（科目B）問題・解答例・採点講評。<br>
          要約・考え方は本アプリ独自の学習用メモです。公式の解答は解答例をご確認ください。
        </footer>
      </main>`;
    $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { setPref('homeTab', b.dataset.tab); viewHome(); });
    window.scrollTo(0, 0);
  }

  function qRow(q, showField = true) {
    const p = getQ(q.id);
    const f = fieldOf(q.no);
    return `<a class="qrow" href="#q-${q.id}">
      <span class="st s${p.s}" aria-label="${STATUS[p.s]}"></span>
      <span class="mid">
        <span class="ex">${esc(examLabel(q.exam))}　問${q.no}${showField && f ? `・${esc(f.short)}` : ''}</span>
        <span class="tt">${esc(q.title || '（要約準備中）')}</span>
        ${q.tags && q.tags.length ? `<span class="tg">${q.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
        ${p.ck && Object.keys(p.ck).length ? `<span class="ckline"><b class="ok">✓${Object.values(p.ck).filter(v => v === 1).length}</b> <b class="ng">✕${Object.values(p.ck).filter(v => v === 2).length}</b>${p.ckTotal ? ` / ${p.ckTotal}問` : ''}</span>` : ''}
      </span>
      ${p.star ? `<span class="star">${I.starF}</span>` : ''}
    </a>`;
  }

  // ---------- field ----------
  let fieldFilter = 'all';
  function viewField(no) {
    const f = fieldOf(no);
    if (!f) return viewHome();
    const list = inField(no);
    const st = stats(list);
    const filtered = list.filter(q => {
      const p = getQ(q.id);
      return fieldFilter === 'all' || (fieldFilter === 'todo' && p.s === 0) || (fieldFilter === 're' && p.s === 1)
        || (fieldFilter === 'ok' && p.s === 2) || (fieldFilter === 'star' && p.star);
    });
    const fl = [['all', `すべて ${list.length}`], ['todo', '未学習'], ['re', '要復習'], ['ok', '理解した'], ['star', '★']];
    $app.innerHTML = `
      ${bar(`問${f.no} ${f.name}`, `${st.ok}/${st.n} 理解した`, '#home')}
      <main class="wrap">
        <section class="fhead">
          <div class="no">問${f.no}${f.required ? '・必須' : '・選択'}</div>
          <h1>${esc(f.name)}</h1>
          <p>${esc(f.lead)}</p>
        </section>
        <details class="guide" ${list.length && st.ok ? '' : 'open'}>
          <summary>${I.book}この分野の攻略メモ${I.chev}</summary>
          <div class="body">
            <h3>よく出る知識</h3><ul>${f.knowledge.map(x => `<li>${rich(x)}</li>`).join('')}</ul>
            <h3>解き方の型</h3><ul>${f.howto.map(x => `<li>${rich(x)}</li>`).join('')}</ul>
          </div>
        </details>
        <div class="filters">${fl.map(([k, l]) => `<button data-f="${k}" class="${fieldFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="qlist">${filtered.map(q => qRow(q, false)).join('') || '<div class="empty">該当する問題はありません</div>'}</div>
      </main>`;
    $app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { fieldFilter = b.dataset.f; viewField(no); });
    window.scrollTo(0, 0);
  }

  function viewExam(eid) {
    const list = DB.cat.filter(q => q.exam === eid);
    $app.innerHTML = `
      ${bar(examLabel(eid), `${list.length}問`, '#home')}
      <main class="wrap" style="padding-top:14px"><div class="qlist">${list.map(q => qRow(q)).join('')}</div></main>`;
    window.scrollTo(0, 0);
  }

  // ---------- question ----------
  async function viewQuestion(id, mode) {
    const q = DB.byId[id];
    if (!q) return viewHome();
    prog.last = id; commit();
    const c = await content(id);
    const f = fieldOf(q.no);
    const p = getQ(id);
    const sibs = inField(q.no);
    const idx = sibs.findIndex(x => x.id === id);
    const prev = sibs[idx - 1], next = sibs[idx + 1];

    document.body.style.overflow = 'hidden';
    $app.innerHTML = `
      <div class="qpage">
        ${bar(`${examLabel(q.exam)} 問${q.no}`, f ? f.name : '', `#f-${q.no}`,
          `<button class="icon-btn ${p.star ? 'on' : ''}" id="star" aria-label="お気に入り">${p.star ? I.starF : I.star}</button>`)}
        <nav class="tabs">
          <button data-m="sum" class="${mode === 'sum' ? 'on' : ''}">① 要約</button>
          <button data-m="split" class="${mode === 'split' ? 'on' : ''}">② 問題＋解答</button>
        </nav>
        <div class="qbody" id="qbody"></div>
      </div>`;
    $app.querySelector('#star').onclick = e => {
      const s = qp(id); s.star = !s.star; commit();
      e.currentTarget.classList.toggle('on', s.star);
      e.currentTarget.innerHTML = s.star ? I.starF : I.star;
      toast(s.star ? '★ に追加しました' : '★ を外しました');
    };
    $app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { history.replaceState(null, '', `#q-${id}${b.dataset.m === 'split' ? '-split' : ''}`); route(); });
    const body = $app.querySelector('#qbody');
    if (mode === 'split') renderSplit(body, q, c);
    else renderSummary(body, q, c, prev, next);
  }

  function summaryBlocks(c, q) {
    if (!c || !c.summary) return '<div class="card"><p>この問題の要約はまだ準備中です。「問題＋解答」タブで原本を確認できます。</p></div>';
    const s = c.summary;
    const story = s.story && s.story.length
      ? `<div class="card story"><h3><span class="dot"></span>問題の中身</h3>${s.scene ? `<p class="lead">${rich(s.scene)}</p>` : ''}${s.story.map(x => `<section>${x.h ? `<h4>${rich(x.h)}</h4>` : ''}<p>${rich(x.p)}</p></section>`).join('')}</div>`
      : `${s.scene ? `<div class="card"><h3><span class="dot"></span>どんな問題？</h3><p>${rich(s.scene)}</p></div>` : ''}${s.flow && s.flow.length ? `<div class="card"><h3><span class="dot"></span>本文の流れ</h3><ol class="flow">${s.flow.map(x => `<li>${rich(x)}</li>`).join('')}</ol></div>` : ''}`;
    return `
      ${story}
      ${s.knowledge && s.knowledge.length ? `<div class="card know"><h3><span class="dot"></span>問われる知識</h3><ul>${s.knowledge.map(x => `<li>${rich(x)}</li>`).join('')}</ul></div>` : ''}
      ${s.thinking && s.thinking.length ? `<div class="card think"><h3><span class="dot"></span>頭の使い方・解き方</h3><ul>${s.thinking.map(x => `<li>${rich(x)}</li>`).join('')}</ul></div>` : ''}
      ${s.trap ? `<div class="card trap"><h3><span class="dot" style="background:var(--warn)"></span>つまずきポイント</h3><p>${rich(s.trap)}</p></div>` : ''}`;
  }

  // テキスト版問題文の簡易マークアップ
  //   ## 見出し / ［a］=空欄 / __①…__=下線部 / | a | b | =表 / > =図の説明
  function fmtText(t) {
    const inline = x => esc(x)
      .replace(/__(.+?)__/g, '<u class="ul">$1</u>')
      .replace(/［([^］]{1,4})］/g, '<span class="blank">$1</span>');
    const out = []; let tbl = [];
    const flush = () => {
      if (!tbl.length) return;
      out.push(`<div class="qt-table"><table>${tbl.map((r, i) => `<tr>${r.map(cl => i === 0 ? `<th>${inline(cl)}</th>` : `<td>${inline(cl)}</td>`).join('')}</tr>`).join('')}</table></div>`);
      tbl = [];
    };
    for (const raw of t.split('\n')) {
      const line = raw.trimEnd();
      if (/^\|/.test(line)) {
        if (/^\|[\s:|-]+\|$/.test(line)) continue;
        tbl.push(line.replace(/^\||\|$/g, '').split('|').map(x => x.trim()));
        continue;
      }
      flush();
      if (!line.trim()) continue;
      if (line.startsWith('## ')) out.push(`<h4>${inline(line.slice(3))}</h4>`);
      else if (line.startsWith('> ')) out.push(`<div class="qt-fig">${inline(line.slice(2))}</div>`);
      else if (line.startsWith('- ')) out.push(`<p class="qt-li">${inline(line.slice(2))}</p>`);
      else out.push(`<p>${inline(line)}</p>`);
    }
    flush();
    return out.join('');
  }

  function renderSummary(body, q, c, prev, next) {
    const p = getQ(q.id);
    body.innerHTML = `
      <div class="sumview"><div class="wrap">
        <h2 class="sum-title">${esc(q.title || '（要約準備中）')}</h2>
        ${q.tags && q.tags.length ? `<div class="sum-meta">${q.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${summaryBlocks(c, q)}
        <button class="cta" id="go">問題と解答を並べて見る ${I.next}</button>
        <div class="card">
          <h3><span class="dot" style="background:var(--text-3)"></span>理解度</h3>
          <div class="status-row">${STATUS.map((l, i) => `<button data-s="${i}" class="s${i} ${p.s === i ? 'on' : ''}">${l}</button>`).join('')}</div>
          <h3 style="margin-top:14px"><span class="dot" style="background:var(--text-3)"></span>自分用メモ</h3>
          <textarea class="memo" id="memo" placeholder="間違えた理由、覚えておきたい用語など">${esc(p.memo)}</textarea>
        </div>
        <div class="pager">
          ${prev ? `<a href="#q-${prev.id}"><small>← 新しい回</small>${esc(examLabel(prev.exam))}</a>` : '<span class="ph"></span>'}
          ${next ? `<a class="next" href="#q-${next.id}"><small>古い回 →</small>${esc(examLabel(next.exam))}</a>` : '<span class="ph"></span>'}
        </div>
        <p class="src">出典：IPA ${esc(examLabel(q.exam))} 応用情報技術者試験 午後 問${q.no}</p>
      </div></div>`;
    body.querySelector('#go').onclick = () => { history.replaceState(null, '', `#q-${q.id}-split`); route(); };
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      qp(q.id).s = +b.dataset.s; commit();
      body.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b));
    });
    const memo = body.querySelector('#memo');
    memo.oninput = () => { qp(q.id).memo = memo.value; commit(); };
  }

  function renderSplit(body, q, c) {
    const st = q.stack;
    const zoomLv = [1, 1.35, 1.7, 2.2];
    let z = Math.max(0, zoomLv.indexOf(pref.zoom));
    body.innerHTML = `
      <div class="split" id="split" style="--ratio:${pref.ratio}%">
        <div class="qwrap"><section class="pane pane-q" id="paneQ" aria-label="問題文">
          <div class="paper" id="paper" style="--zoom:${zoomLv[z]}">
            ${st ? `<figure id="stackfig"><img src="${esc(st.src)}" width="${st.w}" height="${st.h}" alt="問題文（全${st.cuts.length}ページ）">${st.cuts.map((c, i) => `<figcaption style="top:calc(${(c / st.h * 100).toFixed(3)}% + 6px)">p${i + 1}/${st.cuts.length}</figcaption>`).join('')}</figure>`
              : `<div class="noimg" id="noimg">${q.text ? '問題文（テキスト版）を読み込み中…' : 'この回の問題冊子の画像は未収録です。IPAの過去問題ページで原本PDFを確認してください。<br><a href="https://www.ipa.go.jp/shiken/mondai-kaiotu/index.html" target="_blank" rel="noopener">IPA 過去問題ページ</a>'}</div>`}
          </div>
        </section>
        <div class="zoom">
          <button id="zout" aria-label="縮小">${I.minus}</button>
          <button class="lv" id="zlv">${Math.round(zoomLv[z] * 100)}%</button>
          <button id="zin" aria-label="拡大">${I.plus}</button>
        </div></div>
        <div class="divider" id="div" role="separator" aria-label="境界をドラッグして大きさを変更">
          <div class="mini"><button data-r="85">問題を広く</button></div>
          <div class="grip"><i></i></div>
          <div class="mini"><button data-r="30">解答を広く</button><button data-sheet>要約</button></div>
        </div>
        <section class="pane pane-a" id="paneA" aria-label="設問と解答">
          ${answerList(c, q.id)}
        </section>
      </div>`;

    const split = body.querySelector('#split');
    const paneQ = body.querySelector('#paneQ');
    // zoom
    const setZoom = nz => {
      const old = zoomLv[z];
      z = Math.max(0, Math.min(zoomLv.length - 1, nz));
      const ratioY = paneQ.scrollTop / (paneQ.scrollHeight || 1);
      body.querySelector('#paper').style.setProperty('--zoom', zoomLv[z]);
      body.querySelector('#zlv').textContent = `${Math.round(zoomLv[z] * 100)}%`;
      paneQ.scrollTop = ratioY * paneQ.scrollHeight;
      paneQ.scrollLeft = paneQ.scrollLeft * (zoomLv[z] / old);
      setPref('zoom', zoomLv[z]);
    };
    body.querySelector('#zin').onclick = () => setZoom(z + 1);
    body.querySelector('#zout').onclick = () => setZoom(z - 1);
    body.querySelector('#zlv').onclick = () => setZoom(z === 0 ? 2 : 0);

    // divider drag
    const div = body.querySelector('#div');
    const horizontal = () => getComputedStyle(split).flexDirection === 'row';
    const setRatio = r => { r = Math.max(15, Math.min(88, r)); split.style.setProperty('--ratio', r + '%'); setPref('ratio', Math.round(r)); };
    div.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      div.setPointerCapture(e.pointerId);
      const rect = split.getBoundingClientRect();
      const move = ev => {
        const r = horizontal() ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
        setRatio(r * 100);
      };
      const up = () => { div.removeEventListener('pointermove', move); div.removeEventListener('pointerup', up); div.removeEventListener('pointercancel', up); };
      div.addEventListener('pointermove', move);
      div.addEventListener('pointerup', up);
      div.addEventListener('pointercancel', up);
    });
    div.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      const target = +b.dataset.r;
      setRatio(Math.abs(pref.ratio - target) < 3 ? 55 : target);
    });
    div.querySelector('[data-sheet]').onclick = () => openSheet(q, c);

    bindAnswers(body, paneQ, st, q.id);

    // 画像がない回は、テキスト版の問題文を表示する（図表は崩れている）
    if (!st && q.text) {
      bundle().then(b => b.text[q.id] || Promise.reject()).then(t => {
        const box = body.querySelector('#noimg');
        if (!box) return;
        box.className = 'qtext';
        box.innerHTML = `<p class="qtext-note">原本画像が未収録のため、問題文を書き起こしたテキストを表示しています。図は文章で説明しています。四角の枠は空欄、下線は下線部です。</p>${fmtText(t)}`;
      }).catch(() => {});
    }
  }

  function answerList(c, id) {
    const ck = getQ(id).ck || {};
    if (!c || !c.answers || !c.answers.length) {
      return `<div class="alist"><div class="empty">この問題の解答・解説はまだ準備中です</div></div>`;
    }
    return `<div class="alist">
      <div class="atool"><span class="lab">設問と解答例</span><span class="ck-sum" id="cksum"></span>
        <button class="toggle ${pref.hide ? 'on' : ''}" id="hide"><span>答えを隠す</span><span class="sw"></span></button>
      </div>
      ${c.answers.map((sq, si) => `
        <div class="sq">
          <h4>${esc(sq.q)}${sq.note ? `<span class="note">${esc(sq.note)}</span>` : ''}</h4>
          ${(sq.sub || []).map((a, ai) => `
            <div class="ans ${pref.hide ? 'hide' : ''}" data-k="${si}-${ai}">
              <div class="ans-row">
              <button class="ck s${ck[si + '-' + ai] || 0}" data-ck="${si}-${ai}" aria-label="自己採点（未・正解・不正解を切り替え）"></button>
              <button class="ans-h">
                <span class="lb">${esc(a.label || '')}</span>
                <span class="ask">${rich(a.ask || '')}</span>
                ${a.page ? `<span class="pg" data-page="${a.page}">p${a.page}</span>` : ''}
              </button>
              </div>
              <div class="ans-b">
                <div class="a">${rich(a.ans)}</div>
                ${a.why ? `<div class="why">${rich(a.why)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>`).join('')}
      ${c.comment ? `<div class="card trap peek"><h3><span class="dot" style="background:var(--warn)"></span>採点講評より</h3><p>${rich(c.comment)}</p></div>` : ''}
    </div>`;
  }

  function bindAnswers(root, paneQ, st, id) {
    const sum = root.querySelector('#cksum');
    const total = root.querySelectorAll('.ck').length;
    const showSum = () => {
      if (!sum) return;
      const ck = getQ(id).ck || {};
      const ok = Object.values(ck).filter(v => v === 1).length, ng = Object.values(ck).filter(v => v === 2).length;
      sum.innerHTML = ok || ng ? `<b class="ok">✓${ok}</b> <b class="ng">✕${ng}</b> / ${total}` : '';
    };
    showSum();
    root.querySelectorAll('.ck').forEach(b => b.onclick = () => {
      const p = qp(id); p.ck ||= {};
      const v = ((p.ck[b.dataset.ck] || 0) + 1) % 3;
      if (v) p.ck[b.dataset.ck] = v; else delete p.ck[b.dataset.ck];
      p.ckTotal = total;
      commit();
      b.className = `ck s${v}`;
      showSum();
    });
    const hideBtn = root.querySelector('#hide');
    if (hideBtn) hideBtn.onclick = () => {
      setPref('hide', !pref.hide);
      hideBtn.classList.toggle('on', pref.hide);
      root.querySelectorAll('.ans').forEach(a => a.classList.toggle('hide', pref.hide));
    };
    root.querySelectorAll('.ans-h').forEach(h => h.onclick = e => {
      const pg = e.target.closest('[data-page]');
      if (pg && paneQ) {
        const fig = paneQ.querySelector('#stackfig');
        const k = +pg.dataset.page - 1;
        if (fig && st && st.cuts[k] !== undefined) paneQ.scrollTo({ top: fig.offsetTop + fig.offsetHeight * st.cuts[k] / st.h - 8, behavior: 'smooth' });
        return;
      }
      h.closest('.ans').classList.toggle('hide');
    });
  }

  function openSheet(q, c) {
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    const sh = document.createElement('div'); sh.className = 'sheet';
    sh.innerHTML = `<div class="handle"></div><h2 class="sum-title" style="font-size:16px">${esc(q.title || '')}</h2>${summaryBlocks(c, q)}`;
    const close = () => { bg.remove(); sh.remove(); };
    bg.onclick = close;
    let y0 = null;
    sh.addEventListener('touchstart', e => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    sh.addEventListener('touchmove', e => { if (y0 !== null && e.touches[0].clientY - y0 > 80) close(); }, { passive: true });
    document.body.append(bg, sh);
    cleanup = close;
  }

  // ---------- settings ----------
  function viewSettings() {
    const opt = (k, v, l) => `<button data-k="${k}" data-v="${v}" class="${pref[k] === v ? 'on' : ''}">${l}</button>`;
    $app.innerHTML = `
      ${bar('設定', '', '#home')}
      <main class="wrap">
        <div class="card"><h3>表示テーマ</h3>
          <div class="seg">${opt('theme', 'auto', '自動')}${opt('theme', 'light', 'ライト')}${opt('theme', 'dark', 'ダーク')}</div>
          <h3 style="margin-top:14px">問題用紙の色</h3>
          <div class="seg">${opt('paper', 'normal', '白い紙')}${opt('paper', 'dim', '暗くする')}</div>
          <p style="font-size:12px;color:var(--text-3);margin-top:6px">ダークテーマで問題文がまぶしいときは「暗くする」にしてください。</p>
        </div>
        <div class="card"><h3>学習データ</h3>
          <p style="font-size:13px;color:var(--text-2)">進捗・メモはこの端末のブラウザに保存されています。機種変更やブラウザのデータ削除の前にバックアップしてください。</p>
          <div class="foot" style="border:0;margin:10px 0 0;padding:0"><div class="btns">
            <button class="chip-btn" id="exp">バックアップをコピー</button>
            <button class="chip-btn" id="impBtn">貼り付けて復元</button>
            <button class="chip-btn" id="reset" style="color:var(--red)">進捗をリセット</button>
          </div></div>
          <textarea class="memo" id="bk" placeholder="ここにバックアップのテキストが表示されます。復元するときは、保存しておいたテキストを貼り付けて「貼り付けて復元」を押してください。"></textarea>
        </div>
      </main>`;
    $app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { setPref(b.dataset.k, b.dataset.v); applyTheme(); viewSettings(); });
    const bk = $app.querySelector('#bk');
    $app.querySelector('#exp').onclick = () => {
      bk.value = JSON.stringify(prog);
      bk.select();
      try {
        navigator.clipboard.writeText(bk.value).then(() => toast('コピーしました。メモアプリなどに保存してください'), () => toast('テキストを選択しました。長押しでコピーしてください'));
      } catch { toast('テキストを選択しました。長押しでコピーしてください'); }
    };
    $app.querySelector('#impBtn').onclick = () => {
      try {
        const d = JSON.parse(bk.value);
        if (!d || typeof d.q !== 'object') throw 0;
        prog = d; commit(); toast('復元しました');
      } catch { toast('復元できませんでした。バックアップのテキストを全部貼り付けてください'); }
    };
    let armed = false;
    const rs = $app.querySelector('#reset');
    rs.onclick = () => {
      if (!armed) { armed = true; rs.textContent = 'もう一度押すと全て消去'; setTimeout(() => { armed = false; rs.textContent = '進捗をリセット'; }, 4000); return; }
      prog = { q: {}, last: null }; commit(); toast('リセットしました'); armed = false; rs.textContent = '進捗をリセット';
    };
    window.scrollTo(0, 0);
  }

  boot().catch(err => {
    $app.innerHTML = `<p class="loading">データを読み込めませんでした（${esc(err.message)}）</p>`;
  });
})();
