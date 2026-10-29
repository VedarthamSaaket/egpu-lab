(function () {
  const { esc, diff } = window.Code;
  const App = window.App;
  const { ICON } = App;
  const W = { on: false, text: {}, result: {}, errors: {} };

  function unitOf(m) { return m.indent || 4; }

  function assemble(m, i, typedLines) {
    const lines = [];
    let start = 0;
    m.cells.forEach((c, j) => {
      if (j) lines.push("");
      if (j === i) start = lines.length;
      lines.push(...(j === i ? typedLines : c.lines));
    });
    return { code: lines.join("\n"), start };
  }

  function dataCells(m) { return m.cells.filter((c) => App.isData(c)); }

  function wholeExpected(m) {
    const lines = [], tags = [];
    m.cells.forEach((c) => {
      if (App.isData(c)) return;
      lines.push(...c.lines, "");
      tags.push(...c.tags, "blank");
    });
    return { lines, tags };
  }

  function withData(m, text) {
    const extra = dataCells(m).filter((c) => !text.includes(c.lines[c.lines.findIndex((l, k) => c.tags[k] === "py")].split("=")[0].trim() + " ="));
    if (!extra.length) return { code: text, offset: 0 };
    const head = extra.map((c) => c.lines.join("\n")).join("\n") + "\n";
    const firstCode = text.split("\n").findIndex((l) => /^(from|import)\s/.test(l));
    let lastImport = -1;
    text.split("\n").forEach((l, k) => { if (/^(from|import)\s/.test(l)) lastImport = k; });
    if (firstCode < 0) return { code: head + text, offset: head.split("\n").length - 1 };
    const lines = text.split("\n");
    lines.splice(lastImport + 1, 0, ...head.trimEnd().split("\n"));
    return { code: lines.join("\n"), offset: 0, inserted: lastImport + 1, count: head.trimEnd().split("\n").length };
  }

  function scoreClass(s) { return s >= 90 ? "good" : s >= 60 ? "mid" : "low"; }

  function diffHtml(r) {
    const rows = r.rows.map((row) => {
      if (row.status === "ok") return `<div class="drow ok"><span class="m">${ICON.check}</span><span class="t">${esc(row.typed)}</span></div>`;
      if (row.status === "extra") return `<div class="drow extra"><span class="m">+</span><span><span class="got" style="text-decoration:none;color:var(--gold)">${esc(row.typed)}</span></span></div>`;
      const label = row.status === "indent" ? " (indentation)" : "";
      return `<div class="drow ${row.status}"><span class="m">${ICON.cross}</span><span>${row.typed !== undefined ? `<span class="got">${esc(row.typed)}${label}</span>` : ""}<span class="exp">${esc(row.expected)}</span></span></div>`;
    }).join("");
    return `<div class="diff">${rows}</div>`;
  }

  function errorsHtml(errs) {
    if (!errs) return "";
    if (errs.pending) return `<div class="errs">${ICON.spin} Checking syntax...</div>`;
    if (!errs.list.length) return `<div class="errs"><span class="okmsg">No syntax errors.</span> Python and the kernel both compile.</div>`;
    return `<div class="errs">${errs.list.map((e) => `<div class="e">${e.where} line ${e.line}: ${esc(e.msg)}${e.source === "kernel" ? " (kernel)" : ""}</div>`).join("")}</div>`;
  }

  function editor(id, text, rows) {
    const n = Math.max(rows, text.split("\n").length);
    return `<div class="editor"><div class="nums">${Array.from({ length: n }, (_, k) => k + 1).join("\n")}</div>
      <textarea data-ed="${id}" rows="${n}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Write it from memory...">${esc(text)}</textarea></div>`;
  }

  function hintList(lines, glosses, tags) {
    const items = lines.map((l, k) => (tags[k] === "py" || tags[k] === "c" ? glosses[k] : null)).filter(Boolean);
    return `<div class="code" style="font-family:var(--sans);font-size:13px;padding:8px 16px 8px 50px;color:var(--ink-2)">${items.map((g, k) => `<div>${k + 1}. ${esc(g)}</div>`).join("")}</div>`;
  }

  function body(m, i, u) {
    const c = m.cells[i];
    u.t = u.t || { text: "", result: null, errors: null };
    const best = App.cellStore(m, i).test;
    const res = u.t.result;
    return `${u.bulb ? hintList(c.lines, c.glosses, c.tags) : ""}
      ${editor("cell", u.t.text, Math.max(3, c.lines.length))}
      ${res ? diffHtml(res) : ""}
      ${errorsHtml(u.t.errors)}
      <div class="cell-foot">
        <button class="btn primary small" data-act="tcheck">${ICON.check}Check</button>
        <button class="btn small" data-act="tsyntax">${ICON.code}Syntax</button>
        ${m.excerpt ? "" : `<button class="btn small" data-act="trun">${ICON.play}Run with mine</button>`}
        <button class="btn ghost small" data-act="tclear">${ICON.redo}Clear</button>
        ${res ? `<span class="score ${scoreClass(res.score)}">${res.ok}/${res.total} lines, ${res.score}%</span>` : best ? `<span class="score" style="color:var(--faint);font-weight:400">Best ${best}%</span>` : ""}
        <span style="margin-left:auto;color:var(--faint);font-size:12px"><kbd>Tab</kbd> indents ${unitOf(m)} spaces &middot; comments optional &middot; bulb shows line prompts</span>
      </div>`;
  }

  function bindEditor(ta, m, onChange) {
    const unit = unitOf(m);
    const nums = ta.parentElement.querySelector(".nums");
    const sync = () => {
      const n = Math.max(Number(ta.getAttribute("rows")), ta.value.split("\n").length);
      nums.textContent = Array.from({ length: n }, (_, k) => k + 1).join("\n");
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    ta.addEventListener("input", () => { onChange(ta.value); sync(); });
    ta.addEventListener("keydown", (e) => {
      const { selectionStart: a, selectionEnd: b, value: v } = ta;
      if (e.key === "Tab") {
        e.preventDefault();
        const lineStart = v.lastIndexOf("\n", a - 1) + 1;
        if (e.shiftKey) {
          const lead = v.slice(lineStart).match(/^ */)[0].length;
          const cut = Math.min(unit, lead);
          ta.setRangeText("", lineStart, lineStart + cut, "end");
          ta.selectionStart = ta.selectionEnd = Math.max(lineStart, a - cut);
        } else ta.setRangeText(" ".repeat(unit), a, b, "end");
        onChange(ta.value); sync();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const lineStart = v.lastIndexOf("\n", a - 1) + 1;
        const cur = v.slice(lineStart, a);
        let lead = cur.match(/^ */)[0];
        if (/[:{]\s*$/.test(cur)) lead += " ".repeat(unit);
        ta.setRangeText("\n" + lead, a, b, "end");
        onChange(ta.value); sync();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.preventDefault();
    });
    sync();
  }

  function mount(m, i, el, u) {
    const ta = el.querySelector("textarea[data-ed=cell]");
    if (!ta) return;
    bindEditor(ta, m, (v) => (u.t.text = v));
    if (!u.t.text && u.t.focus !== false) ta.focus({ preventScroll: true });
  }

  function checkCell(m, i, u) {
    const c = m.cells[i];
    const r = diff(c.lines, c.tags, u.t.text, unitOf(m));
    u.t.result = r;
    const st = App.cellStore(m, i);
    st.test = Math.max(st.test || 0, r.score);
    App.save();
    u.t.focus = false;
    App.rerenderKeepScroll();
    if (r.score === 100) App.toast("Every line matches.");
  }

  async function syntax(m, code, mapLine, setErr) {
    setErr({ pending: true });
    try {
      const r = await App.api("/api/check", { module: m.id, code });
      setErr({ list: r.errors.map((e) => mapLine(e)) });
    } catch (e) {
      setErr({ list: [{ where: "", line: 0, msg: "Could not reach the local checker (" + e.message + ")" }] });
    }
  }

  function act(name, el, m, i, u) {
    if (!u.t) return;
    const typed = u.t.text.replace(/\r/g, "").split("\n");
    if (name === "tcheck") checkCell(m, i, u);
    else if (name === "tclear") { u.t = { text: "", result: null, errors: null }; App.rerenderKeepScroll(); }
    else if (name === "tsyntax") {
      const { code, start } = assemble(m, i, typed);
      const end = start + typed.length;
      syntax(m, code, (e) => {
        const inside = e.line - 1 >= start && e.line - 1 < end;
        return { ...e, where: inside ? "Your cell," : "Elsewhere in the program,", line: inside ? e.line - start : e.line };
      }, (v) => { u.t.errors = v; u.t.focus = false; App.rerenderKeepScroll(); });
    } else if (name === "trun") App.runCode(m, assemble(m, i, typed).code, `Program with your cell [${i + 1}]`);
  }

  function bar(m) {
    return `<div class="seg"><button data-act="twhole" data-v="0" class="${W.on ? "" : "on"}">One cell</button><button data-act="twhole" data-v="1" class="${W.on ? "on" : ""}">Whole program</button></div>`;
  }

  function wholeBody(m) {
    const text = W.text[m.id] || "";
    const res = W.result[m.id];
    const best = App.store.whole[m.id];
    const data = dataCells(m).length ? `<div class="note">Skip the data cell (${dataCells(m).map((c) => esc(c.title)).join(", ")}). It is filled in for you when you check or run.</div>` : "";
    return `<section class="cell active" style="margin-top:16px;grid-template-columns:1fr"><div class="cell-main">
      <div class="cell-head"><span class="kind">test</span><span class="cell-title">Write the whole program</span></div>
      <div class="cell-summary">All ${m.cells.length} cells, top to bottom, from memory.</div>
      ${data}
      ${editor("whole", text, 12)}
      ${res ? diffHtml(res) : ""}
      ${errorsHtml(W.errors[m.id])}
      <div class="cell-foot">
        <button class="btn primary small" data-act="wcheck">${ICON.check}Check</button>
        <button class="btn small" data-act="wsyntax">${ICON.code}Syntax</button>
        ${m.excerpt ? "" : `<button class="btn small" data-act="wrun">${ICON.play}Run mine</button>`}
        <button class="btn ghost small" data-act="wclear">${ICON.redo}Clear</button>
        ${res ? `<span class="score ${scoreClass(res.score)}">${res.ok}/${res.total} lines, ${res.score}%</span>` : best ? `<span class="score" style="color:var(--faint);font-weight:400">Best ${best}%</span>` : ""}
      </div></div></section>`;
  }

  function mountWhole(m, root) {
    const ta = root.querySelector("textarea[data-ed=whole]");
    if (!ta) return;
    bindEditor(ta, m, (v) => (W.text[m.id] = v));
    if (!W.text[m.id] && !W.result[m.id]) ta.focus({ preventScroll: true });
  }

  function wholeAct(name, m) {
    const text = (W.text[m.id] || "").replace(/\r/g, "");
    if (name === "wcheck") {
      const exp = wholeExpected(m);
      const r = diff(exp.lines, exp.tags, text, unitOf(m));
      W.result[m.id] = r;
      App.store.whole[m.id] = Math.max(App.store.whole[m.id] || 0, r.score);
      App.save();
      App.rerenderKeepScroll();
      if (r.score === 100) App.toast("The whole program, line for line.");
    } else if (name === "wclear") {
      W.text[m.id] = ""; W.result[m.id] = null; W.errors[m.id] = null;
      App.rerenderKeepScroll();
    } else if (name === "wsyntax") {
      const d = withData(m, text);
      syntax(m, d.code, (e) => {
        let line = e.line - d.offset;
        if (d.inserted !== undefined && e.line - 1 >= d.inserted) line = e.line - 1 >= d.inserted + d.count ? e.line - d.count : d.inserted + 1;
        return { ...e, where: "", line };
      }, (v) => { W.errors[m.id] = v; App.rerenderKeepScroll(); });
    } else if (name === "wrun") App.runCode(m, withData(m, text).code, "Your whole program");
  }

  const baseAct = act;
  App.modes.test = {
    body, mount, bar, wholeBody, mountWhole,
    whole: () => W.on,
    act(name, el, m, i, u) {
      if (name === "twhole") { W.on = el.dataset.v === "1"; App.rerenderKeepScroll(); return; }
      if (name[0] === "w" && ["wcheck", "wclear", "wsyntax", "wrun"].includes(name)) return wholeAct(name, m);
      baseAct(name, el, m, i, u);
    },
  };
})();
