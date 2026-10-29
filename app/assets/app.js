(function () {
  const { esc, highlight } = window.Code;
  const MODULES = window.EGPU.modules;
  const KEY = "egpu-lab:v1";

  const ICON = {
    bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"/></svg>',
    simplify: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    ask: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M9.8 9.5a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 2-2.2 3.2M12 16.3v.1"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5Z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    eyeoff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6a9.6 9.6 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-3 3.6M6.3 6.9A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.3-1.1M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    spin: '<svg viewBox="0 0 24 24" class="spin"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.3v.1"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.7v.1"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
  };

  function load() {
    try {
      return Object.assign({ cells: {}, asks: {}, whole: {}, prefs: { theme: "paper" } }, JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      return { cells: {}, asks: {}, whole: {}, prefs: { theme: "paper" } };
    }
  }
  const store = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  const S = { view: "home", filter: "all", mod: null, mode: "learn", active: 0, ui: {}, console: null, running: false };
  const modes = {};

  function cellKey(m, i) { return m.id + ":" + i; }
  function cellStore(m, i) {
    const k = cellKey(m, i);
    return store.cells[k] || (store.cells[k] = { learned: false, practice: {}, test: 0 });
  }
  function ui(i) {
    return S.ui[i] || (S.ui[i] = { simple: false, bulb: false, reveal: 0, recall: false, peek: {}, fresh: -1, askOpen: false, askIndex: -1, asking: false });
  }
  function isData(cell) { return cell.kind === "numbers"; }
  function codeLines(cell) { return cell.tags.filter((t) => t === "py" || t === "c").length; }

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = store.prefs.theme;
    document.getElementById("themeBtn").innerHTML = store.prefs.theme === "ink" ? ICON.sun : ICON.moon;
  }

  function practiceScore(c) {
    const p = c.practice || {};
    return Math.max((p[1] || 0) * 0.5, (p[2] || 0) * 0.8, p[3] || 0);
  }

  function progress(m) {
    const cells = m.cells.map((c, i) => ({ c, s: cellStore(m, i) })).filter((x) => !isData(x.c));
    const n = cells.length || 1;
    const learned = cells.filter((x) => x.s.learned).length / n;
    const practice = cells.reduce((a, x) => a + practiceScore(x.s), 0) / n / 100;
    const cellTest = cells.reduce((a, x) => a + (x.s.test || 0), 0) / n / 100;
    const test = Math.max(cellTest, (store.whole[m.id] || 0) / 100);
    return { learned, practice, test };
  }

  function levelBars(n) {
    return `<span class="level" title="Difficulty ${n} of 5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? "f" : ""}"></i>`).join("")}</span>`;
  }

  function langChips(m) {
    const set = new Set();
    if (m.lang === "cpp") set.add("C++");
    m.cells.forEach((c) => c.tags.forEach((t) => {
      if (t === "py") set.add("Python");
      if (t === "c" && m.lang !== "cpp") set.add(/__kernel/.test(m.program) ? "OpenCL C" : "CUDA C");
    }));
    return [...set].map((x) => `<span class="chip">${x}</span>`).join("");
  }

  function bar(v) { return `<div class="bar"><span style="width:${Math.round(v * 100)}%"></span></div>`; }

  function renderHome() {
    const groups = [
      ["common", "Start here", "Lines that repeat across weeks"],
      ["hardware", "Hardware", "Jetson Nano: GPIO, camera, jetson-inference"],
      ["software", "Software", "PyCUDA and PyOpenCL kernels"],
    ].filter(([t]) => S.filter === "all" || t === S.filter || t === "common");
    const main = document.getElementById("main");
    main.innerHTML = `
      <div class="page-head">
        <h1>Weeks</h1>
        <p>Every program from the lab record, easiest first. Open a week to see the question on the left and its code as small cells on the right.</p>
      </div>
      <div class="toolbar-row">
        <div class="seg" role="tablist">
          ${["all", "hardware", "software"].map((f) => `<button data-act="filter" data-f="${f}" class="${S.filter === f ? "on" : ""}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}
        </div>
      </div>
      ${groups.map(([track, title, sub]) => `
        <section class="group">
          <h2 class="group-title">${title} <span style="text-transform:none;letter-spacing:0;font-weight:400">${sub}</span></h2>
          <div class="cards">
            ${MODULES.filter((m) => m.track === track).map((m) => {
              const p = progress(m);
              return `<button class="card" data-act="open" data-id="${m.id}">
                <span class="card-top"><span class="card-week">${m.week ? `Week ${m.week}` : "Start here"}</span>${levelBars(m.level)}</span>
                <span class="card-title">${esc(m.title)}</span>
                <span class="card-theme">${esc(m.theme)}</span>
                <span class="mod-sub">${langChips(m)}<span>${m.cells.length} cells</span></span>
                <span class="prog"><div>Learn${bar(p.learned)}</div><div>Practice${bar(p.practice)}</div><div>Test${bar(p.test)}</div></span>
              </button>`;
            }).join("")}
          </div>
        </section>`).join("")}`;
  }

  function lineRow(no, line, tag, opts) {
    const cls = ["ln"];
    if (opts.gloss !== undefined) cls.push("with-gloss");
    if (opts.fresh) cls.push("fresh");
    if (opts.hidden) cls.push("hidden");
    const rep = opts.repeat && opts.repeat.length ? `<span class="rep" title="Same line in weeks ${opts.repeat.join(", ")}">${opts.repeat.length} weeks</span>` : "";
    const src = opts.srcHtml !== undefined ? opts.srcHtml : highlight(line, tag) + rep;
    const gloss = opts.gloss !== undefined ? `<span class="gloss">${esc(opts.gloss)}</span>` : "";
    return `<div class="${cls.join(" ")}" ${opts.hidden ? `data-act="peek" data-l="${no - 1}"` : ""}><span class="no">${no}</span><span class="src">${src}</span>${gloss}</div>`;
  }

  function codeView(lines, tags, glosses, opts) {
    const rows = [];
    const limit = opts.limit === undefined ? lines.length : opts.limit;
    for (let k = 0; k < Math.min(limit, lines.length); k++) {
      rows.push(lineRow(k + 1, lines[k], tags[k], {
        gloss: opts.bulb ? glosses[k] || "" : undefined,
        fresh: opts.freshFrom !== undefined && k >= opts.freshFrom,
        hidden: opts.recall && tags[k] !== "blank" && !(opts.peek || {})[k],
        repeat: opts.repeats ? opts.repeats[k] : null,
      }));
    }
    const left = lines.slice(limit).filter((l) => l.trim()).length;
    const more = left > 0 ? `<div class="more">${left} more line${left > 1 ? "s" : ""}</div>` : "";
    return `<div class="code">${rows.join("")}${more}</div>`;
  }

  function verdict(kind, icon, text) {
    return `<div class="verdict ${kind}">${ICON[icon]}<span>${text}</span></div>`;
  }

  function simpleVerdicts(s) {
    const flags = s.flags || [];
    const check = s.check || {};
    const parts = [];
    if (flags.includes("warn")) {
      const seen = check.status === "differs" ? ` Output changes: the PDF version prints <code>${esc(check.expected)}</code>, this one prints <code>${esc(check.got)}</code>.` : " The simulator cannot show this difference, so it only shows up on real hardware.";
      parts.push(verdict("warn", "alert", `<b>Changes behaviour.</b> ${esc(s.note)}${seen}`));
    } else if (check.status === "same") {
      parts.push(verdict("ok", "check", "<b>Works the same.</b> The whole program prints exactly the same output with this version. Checked by running it."));
    } else if (check.status === "excerpt") {
      parts.push(verdict("info", "info", "This is a piece, not a full program, so it was checked for being simpler but not run."));
    }
    if (!flags.includes("warn") && s.note) parts.push(verdict("info", "info", esc(s.note)));
    if (flags.includes("helper")) parts.push(verdict("info", "info", "This cell gets a little longer so the next cells can be much shorter."));
    if (s.better && s.better.length) parts.push(verdict("info", "info", `Simpler because it has ${esc(s.better.join(", "))}.`));
    parts.push(verdict("info", "check", "This is as far as it simplifies. Tap Simplify again to go back to the PDF version."));
    return parts.join("");
  }

  function simpleBody(m, i) {
    const c = m.cells[i], s = c.simple, u = ui(i);
    if (s.mode === "same") return `${codeView(c.lines, c.tags, c.glosses, { bulb: u.bulb })}${verdict("ok", "check", "<b>Already as simple as it gets.</b> Any shorter version would be harder to read or would change what the code does, so this is the PDF version.")}`;
    if (s.mode === "drop") return `${verdict("ok", "check", `<b>Can be left out.</b> ${esc(s.note)}${s.check && s.check.status === "same" ? " The program prints exactly the same without it. Checked by running it." : ""}`)}`;
    return codeView(s.lines, s.tags, s.glosses, { bulb: u.bulb }) + simpleVerdicts(s);
  }

  function groupEnds(cell) {
    const ends = [];
    cell.lines.forEach((l, k) => {
      const blank = !l.trim();
      const nextBlank = k + 1 >= cell.lines.length || !cell.lines[k + 1].trim();
      if (!blank && nextBlank) ends.push(k + 1);
    });
    return ends.length ? ends : [cell.lines.length];
  }

  function learnBody(m, i) {
    const c = m.cells[i], u = ui(i);
    if (u.simple) return simpleBody(m, i);
    const ends = groupEnds(c);
    if (!u.reveal) u.reveal = ends[0];
    const done = u.reveal >= ends[ends.length - 1];
    const shown = ends.filter((e) => e <= u.reveal).length;
    const nextEnd = ends.find((e) => e > u.reveal);
    const nextCount = nextEnd ? c.lines.slice(u.reveal, nextEnd).filter((l) => l.trim()).length : 0;
    const view = codeView(c.lines, c.tags, c.glosses, {
      limit: u.reveal, bulb: u.bulb, freshFrom: u.fresh >= 0 ? u.fresh : undefined,
      recall: u.recall, peek: u.peek, repeats: c.repeats,
    });
    u.fresh = -1;
    const learned = cellStore(m, i).learned;
    return `${view}
      <div class="cell-foot">
        ${done
          ? `<button class="btn primary small" data-act="learned">${ICON.check}${learned ? "Learned, next cell" : "Got it, next cell"}</button>
             <button class="btn small" data-act="recall">${u.recall ? ICON.eye : ICON.eyeoff}${u.recall ? "Show lines" : "Hide and recall"}</button>
             <button class="btn ghost small" data-act="restart">${ICON.redo}From the top</button>`
          : `<button class="btn primary small" data-act="reveal">${ICON.next}Next group (${nextCount} line${nextCount > 1 ? "s" : ""})</button>
             <span class="stepper">Group <b>${shown}</b> of ${ends.length}</span>`}
        <span class="hint" style="margin-left:auto;color:var(--faint);font-size:12px"><kbd>Space</kbd> ${done ? "next cell" : "next group"} &middot; <kbd>R</kbd> recall</span>
      </div>`;
  }

  function askBlock(m, i) {
    const u = ui(i);
    const list = store.asks[cellKey(m, i)] || [];
    const idx = u.askIndex < 0 ? list.length - 1 : u.askIndex;
    const a = list[idx];
    const answer = u.asking
      ? `<div class="answer">${ICON.spin}<span>Thinking...</span></div>`
      : a ? `<div class="answer"><span class="nav">
            <button data-act="askprev" ${idx <= 0 ? "disabled" : ""} aria-label="Earlier">${ICON.left}</button>${idx + 1}/${list.length}
            <button data-act="asknext" ${idx >= list.length - 1 ? "disabled" : ""} aria-label="Later">${ICON.right}</button></span>
          <span><span class="q">${esc(a.q)}</span><br>${esc(a.a)}</span></div>` : "";
    if (!u.askOpen && !a && !u.asking) return "";
    return `${u.askOpen ? `<form class="ask" data-form="ask"><input name="q" maxlength="300" placeholder="Doubt about this cell, e.g. why blockDim.x?" autocomplete="off"><button class="btn small" type="submit">${ICON.send}Ask</button></form>` : ""}${answer}`;
  }

  function renderCell(m, i) {
    const c = m.cells[i], u = ui(i), active = S.active === i;
    const st = cellStore(m, i);
    const done = S.mode === "learn" ? st.learned : S.mode === "practice" ? practiceScore(st) >= 80 : st.test >= 80;
    const tools = `<span class="cell-tools">
        <button class="icon-btn ${u.simple ? "on" : ""}" data-act="simple" title="Simplify this cell (S)" aria-label="Simplify">${ICON.simplify}</button>
        <button class="icon-btn ${u.bulb ? "on" : ""}" data-act="bulb" title="Explain each line (B)" aria-label="Explain lines">${ICON.bulb}</button>
        <button class="icon-btn ${u.askOpen ? "on" : ""}" data-act="ask" title="Ask a doubt" aria-label="Ask a doubt">${ICON.ask}</button>
      </span>`;
    let body = "";
    if (active) {
      if (isData(c) && S.mode !== "learn") body = `${codeView(c.lines, c.tags, c.glosses, { bulb: u.bulb })}<div class="note">This is just data. No need to memorise the numbers.</div>`;
      else if (u.simple && S.mode !== "learn") body = `<div class="note">Peeking at the simplified version. Turn Simplify off to continue.</div>${simpleBody(m, i)}`;
      else body = S.mode === "learn" ? learnBody(m, i) : modes[S.mode].body(m, i, u);
      body = `<div class="cell-summary">${esc(c.summary)}</div>${body}${askBlock(m, i)}`;
    }
    const meta = active ? "" : `<span class="meta">${codeLines(c)} line${codeLines(c) === 1 ? "" : "s"}</span>`;
    return `<article class="cell ${active ? "active" : ""} ${done ? "done" : ""}" data-cell="${i}">
      <div class="gutter" data-act="focus"><span class="n">[${i + 1}]</span>${done ? `<div class="tick">${ICON.check}</div>` : ""}</div>
      <div class="cell-main">
        <div class="cell-head" data-act="focus">
          <span class="kind">${esc(c.kind)}</span><span class="cell-title">${esc(c.title)}</span>${u.simple ? `<span class="ver-tag">${c.simple.mode === "same" ? "Already simple" : "Simplified"}</span>${(c.simple.flags || []).includes("warn") ? `<span class="ver-tag warn" title="Changes behaviour">${ICON.alert}</span>` : ""}` : ""}${meta}
          ${active ? tools : ""}
        </div>
        ${body}
      </div>
    </article>`;
  }

  function renderConsole(m) {
    if (!S.console) return "";
    const r = S.console;
    const out = (r.stdout || "").split("\n").map((l) => l.startsWith("\x1e") ? `<span class="sim">${esc(l.slice(1))}</span>` : esc(l)).join("\n");
    const err = r.stderr ? `<span class="err">${esc(r.stderr)}</span>` : "";
    return `<section class="console">
      <div class="console-head">${ICON.code}<b>${esc(r.label)}</b><span>Grey lines are the simulator talking. Kernels really run, on the CPU.</span>
        <button class="btn ghost small" data-act="closeconsole" style="margin-left:auto">${ICON.cross}Close</button></div>
      <div class="console-body ${m.output ? "" : "single"}">
        <pre><span class="lbl">Your run</span>${r.pending ? "Running..." : out + err}</pre>
        ${m.output ? `<pre><span class="lbl">PDF result</span>${esc(m.output)}</pre>` : ""}
      </div>
    </section>`;
  }

  function renderModule() {
    const m = S.mod;
    const main = document.getElementById("main");
    const runBtns = m.excerpt ? "" : `
      <button class="btn small" data-act="run" data-v="original">${ICON.play}Run program</button>
      <button class="btn ghost small" data-act="run" data-v="simple">${ICON.play}Run simplified</button>`;
    main.classList.add("wide");
    const outline = m.cells.map((c, i) => {
      const st = cellStore(m, i);
      const done = S.mode === "learn" ? st.learned : S.mode === "practice" ? practiceScore(st) >= 80 : st.test >= 80;
      return `<button class="toc ${S.active === i ? "on" : ""} ${done ? "done" : ""}" data-act="toc" data-i="${i}"><span>[${i + 1}]</span>${esc(c.title)}${done ? ICON.check : ""}</button>`;
    }).join("");
    main.innerHTML = `<div class="split">
      <aside class="qpane">
        <button class="back" data-act="home">${ICON.back}All weeks</button>
        <div class="eyebrow">${m.week ? `Week ${m.week} &middot; ` : ""}${m.track === "common" ? "Shared pieces" : m.track === "hardware" ? "Hardware" : "Software"}</div>
        <h1>${esc(m.title)}</h1>
        <div class="card-theme">${esc(m.theme)}</div>
        <div class="qblock"><span class="qlabel">Question</span><p>${esc(m.experiment)}</p></div>
        <div class="qblock"><span class="qlabel">Aim</span><p>${esc(m.aim)}</p></div>
        <div class="qblock"><span class="qlabel">Requirements</span><p>${esc(m.requirements)}</p></div>
        ${m.note ? `<div class="qblock"><span class="qlabel">Note</span><p>${esc(m.note)}</p></div>` : ""}
        ${m.caveat ? `<div class="caveat">${esc(m.caveat)}</div>` : ""}
        <div class="qblock"><span class="qlabel">Result</span><p>${esc(m.result)}</p>${m.output ? `<pre class="qout">${esc(m.output)}</pre>` : ""}</div>
        <div class="qblock toc-block"><span class="qlabel">Cells</span><div class="tocs">${outline}</div></div>
      </aside>
      <section class="nbpane">
      <div class="modebar">
        <div class="seg">
          ${["learn", "practice", "test"].map((k) => `<button data-act="mode" data-m="${k}" class="${S.mode === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}
        </div>
        ${S.mode === "test" && modes.test.bar ? modes.test.bar(m) : ""}
        ${S.mode === "practice" && modes.practice.bar ? modes.practice.bar(m) : ""}
        ${S.mode === "learn" ? `<button class="btn ghost small" data-act="relearn" title="Clear learned ticks for this week and start again at cell 1">${ICON.redo}Relearn from start</button>` : ""}
        <span class="spacer"></span>
        ${runBtns}
      </div>
      ${S.mode === "test" && modes.test.whole && modes.test.whole(m) ? modes.test.wholeBody(m) : `<div class="nb">${m.cells.map((_, i) => renderCell(m, i)).join("")}</div>`}
      ${renderConsole(m)}
      </section></div>`;
    const active = main.querySelector(".cell.active");
    if (active && modes[S.mode] && modes[S.mode].mount && S.mode !== "learn") modes[S.mode].mount(m, S.active, active, ui(S.active));
    if (S.mode === "test" && modes.test.whole && modes.test.whole(m)) modes.test.mountWhole(m, main);
  }

  function render() {
    document.getElementById("main").classList.remove("wide");
    if (S.view === "home") renderHome();
    else renderModule();
  }

  function rerenderKeepScroll() {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function scrollToActive() {
    const el = document.querySelector(".cell.active");
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 130 || r.top > window.innerHeight * 0.55) window.scrollTo({ top: window.scrollY + r.top - 140, behavior: "smooth" });
  }

  function setActive(i) {
    if (i < 0 || i >= S.mod.cells.length) return;
    S.active = i;
    rerenderKeepScroll();
    scrollToActive();
  }

  function go(hash) {
    if (location.hash !== hash) location.hash = hash;
    else route();
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, "").split("/");
    if (h[0] === "m" && MODULES.find((m) => m.id === h[1])) {
      const m = MODULES.find((x) => x.id === h[1]);
      const mode = ["learn", "practice", "test"].includes(h[2]) ? h[2] : "learn";
      if (S.mod !== m) { S.ui = {}; S.active = 0; S.console = null; }
      if (S.mode !== mode) S.ui = {};
      S.view = "module"; S.mod = m; S.mode = mode;
      if (S.mode === "learn" && S.active === 0) {
        const first = m.cells.findIndex((c, i) => !cellStore(m, i).learned);
        if (first > 0) S.active = first;
      }
    } else {
      S.view = "home"; S.mod = null;
    }
    render();
    if (S.view === "module") setTimeout(scrollToActive, 30);
    else window.scrollTo(0, 0);
  }

  async function api(path, payload) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({ error: "bad reply" }));
    if (!r.ok) throw new Error(data.error || "request failed");
    return data;
  }

  async function runCode(m, code, label) {
    S.console = { label, pending: true };
    rerenderKeepScroll();
    try {
      const r = await api("/api/run", { module: m.id, code });
      S.console = { label, stdout: r.stdout, stderr: r.stderr };
    } catch (e) {
      S.console = { label, stdout: "", stderr: "Could not reach the local runner. Start the app with run.sh. (" + e.message + ")" };
    }
    rerenderKeepScroll();
    const c = document.querySelector(".console");
    if (c) c.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function ask(m, i, q) {
    const u = ui(i), c = m.cells[i];
    const lines = u.simple && c.simple.mode === "code" ? c.simple.lines : c.lines;
    u.asking = true;
    rerenderKeepScroll();
    let text;
    try {
      const r = await api("/api/ask", { module: m.id, cell: i, version: u.simple ? "simple" : "original", question: q, code: lines.join("\n") });
      text = r.text;
    } catch (e) {
      text = "Could not get an answer right now (" + e.message + ").";
    }
    const k = cellKey(m, i);
    const list = store.asks[k] || (store.asks[k] = []);
    list.push({ q, a: text });
    if (list.length > 12) list.shift();
    save();
    u.asking = false; u.askIndex = -1; u.askOpen = false;
    rerenderKeepScroll();
  }

  function revealMore(m, i) {
    const u = ui(i);
    if (u.simple) return;
    const ends = groupEnds(m.cells[i]);
    if (!u.reveal) u.reveal = ends[0];
    const next = ends.find((e) => e > u.reveal);
    if (next === undefined) return markLearned(m, i);
    u.fresh = u.reveal;
    u.reveal = next;
    rerenderKeepScroll();
  }

  function markLearned(m, i) {
    cellStore(m, i).learned = true;
    save();
    if (i < m.cells.length - 1) setActive(i + 1);
    else { toast("All cells learned. Try Practice next."); rerenderKeepScroll(); }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const cellEl = el.closest("[data-cell]");
    const i = cellEl ? Number(cellEl.dataset.cell) : S.active;
    const m = S.mod;
    if (cellEl && i !== S.active && !["focus"].includes(act)) return;
    switch (act) {
      case "home": go("#/"); break;
      case "filter": S.filter = el.dataset.f; renderHome(); break;
      case "open": go(`#/m/${el.dataset.id}/learn`); break;
      case "mode": go(`#/m/${m.id}/${el.dataset.m}`); break;
      case "theme": store.prefs.theme = store.prefs.theme === "ink" ? "paper" : "ink"; save(); applyTheme(); break;
      case "focus": if (i !== S.active) setActive(i); break;
      case "toc": setActive(Number(el.dataset.i)); break;
      case "reveal": revealMore(m, i); break;
      case "learned": markLearned(m, i); break;
      case "relearn":
        m.cells.forEach((_, k) => { cellStore(m, k).learned = false; });
        save();
        S.ui = {};
        S.active = 0;
        rerenderKeepScroll();
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast("Starting this week over from cell 1.");
        break;
      case "restart": ui(i).reveal = 0; ui(i).recall = false; ui(i).peek = {}; rerenderKeepScroll(); break;
      case "recall": ui(i).recall = !ui(i).recall; ui(i).peek = {}; rerenderKeepScroll(); break;
      case "peek": ui(i).peek[Number(el.dataset.l)] = true; rerenderKeepScroll(); break;
      case "simple": ui(i).simple = !ui(i).simple; rerenderKeepScroll(); break;
      case "bulb": ui(i).bulb = !ui(i).bulb; rerenderKeepScroll(); break;
      case "ask": {
        const u = ui(i);
        u.askOpen = !u.askOpen;
        rerenderKeepScroll();
        if (u.askOpen) setTimeout(() => { const inp = document.querySelector(".cell.active .ask input"); if (inp) inp.focus(); }, 0);
        break;
      }
      case "askprev": case "asknext": {
        const u = ui(i), list = store.asks[cellKey(m, i)] || [];
        const cur = u.askIndex < 0 ? list.length - 1 : u.askIndex;
        u.askIndex = Math.max(0, Math.min(list.length - 1, cur + (act === "askprev" ? -1 : 1)));
        rerenderKeepScroll();
        break;
      }
      case "run": runCode(m, el.dataset.v === "simple" ? m.simpleProgram : m.program, el.dataset.v === "simple" ? "Simplified program" : "Original program"); break;
      case "closeconsole": S.console = null; rerenderKeepScroll(); break;
      default:
        if (modes[S.mode] && modes[S.mode].act) modes[S.mode].act(act, el, m, i, ui(i), e);
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-form=ask]");
    if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim();
    if (q) ask(S.mod, S.active, q);
  });

  document.addEventListener("keydown", (e) => {
    if (S.view !== "module" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea")) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const m = S.mod, i = S.active;
    const k = e.key.toLowerCase();
    if (S.mode === "learn" && (e.key === " " || e.key === "Enter")) { e.preventDefault(); revealMore(m, i); }
    else if (S.mode === "learn" && k === "r") { ui(i).recall = !ui(i).recall; ui(i).peek = {}; rerenderKeepScroll(); }
    else if (k === "b") { ui(i).bulb = !ui(i).bulb; rerenderKeepScroll(); }
    else if (k === "s") { ui(i).simple = !ui(i).simple; rerenderKeepScroll(); }
    else if (e.key === "ArrowDown" || k === "j") { e.preventDefault(); setActive(i + 1); }
    else if (e.key === "ArrowUp" || k === "k") { e.preventDefault(); setActive(i - 1); }
  });

  window.addEventListener("hashchange", route);

  window.App = { S, store, save, ui, cellStore, cellKey, isData, ICON, modes, api, toast, rerenderKeepScroll, setActive, codeView, runCode, esc };
  applyTheme();
  document.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") setTimeout(route, 0);
})();
