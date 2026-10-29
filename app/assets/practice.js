(function () {
  const { esc, highlight, makeBlanks, blankable, shuffle, squash, tokenize } = window.Code;
  const App = window.App;
  const { ICON } = App;
  const LEVELS = { 1: "Few blanks", 2: "Half", 3: "Whole lines" };

  function decoys(cell, answers, count) {
    const pool = new Set();
    cell.lines.forEach((l, k) => {
      if (cell.tags[k] !== "c") return;
      tokenize(l, "c").forEach((t) => {
        if ((t.type === "id" || t.type === "num" || t.type === "fn" || t.type === "kw") && !answers.includes(t.t)) pool.add(t.t);
      });
    });
    return shuffle([...pool]).slice(0, count);
  }

  function newRound(m, i, u, level) {
    const cell = m.cells[i];
    const lines = cell.lines.map((line, k) => {
      const tag = cell.tags[k];
      if (!blankable(line, tag)) return null;
      const b = makeBlanks(line, tag, level);
      if (!b) return null;
      if (tag === "c") {
        const answers = b.whole ? b.chips : b.toks.filter((t) => t.blank).map((t) => t.t);
        const chips = shuffle(answers.concat(b.whole ? [] : decoys(cell, answers, 2))).map((t, n) => ({ t, n, used: false }));
        return { tag, b, chips, filled: {}, checked: false };
      }
      return { tag, b, typed: {}, marks: {} };
    });
    u.p = { level, lines, result: null, revealed: false };
  }

  function slotsOf(line) {
    if (line.b.whole) return line.b.chips.map((_, n) => n);
    return line.b.toks.map((t, n) => (t.blank ? n : -1)).filter((n) => n >= 0);
  }

  function answerOf(line, slot) {
    return line.b.whole ? line.b.chips[slot] : line.b.toks[slot].t;
  }

  function slotHtml(k, line, slot) {
    const f = line.filled[slot];
    const mark = line.checked ? (f && f.t === answerOf(line, slot) ? "ok" : "bad") : "";
    return `<span class="slot ${f ? "filled" : ""} ${mark}" data-act="slot" data-l="${k}" data-s="${slot}">${f ? esc(f.t) : "&nbsp;"}</span>`;
  }

  function lineSrc(k, line, raw, u) {
    if (line.tag === "c") {
      if (line.b.whole) {
        let s = 0;
        const parts = line.b.parts.map((p) => (p.type === "ws" ? esc(p.t) : slotHtml(k, line, s++)));
        return esc(line.b.lead) + parts.join("");
      }
      return line.b.toks.map((t, n) => (t.blank ? slotHtml(k, line, n) : `<span class="tk-${t.type === "ws" ? "" : t.type}">${esc(t.t)}</span>`)).join("");
    }
    const input = (key, answer, whole) => {
      const val = line.typed[key] || "";
      const w = whole ? "" : `style="width:${Math.max(answer.length, 2) + 1.5}ch"`;
      return `<input class="blank-in ${whole ? "whole" : ""} ${line.marks[key] || ""}" data-l="${k}" data-k="${key}" value="${esc(val)}" ${w} autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="blank">`;
    };
    if (line.b.whole) return esc(line.b.lead) + input("w", line.b.answer, true);
    return line.b.toks.map((t, n) => (t.blank ? input(String(n), t.t, false) : t.type === "ws" ? esc(t.t) : `<span class="tk-${t.type}">${esc(t.t)}</span>`)).join("");
  }

  function body(m, i, u) {
    const cell = m.cells[i];
    if (!u.p) newRound(m, i, u, (App.store.prefs.plevel || 1));
    const rows = cell.lines.map((raw, k) => {
      const line = u.p.lines[k];
      const gloss = u.bulb ? `<span class="gloss">${esc(cell.glosses[k] || "")}</span>` : "";
      const cls = "ln" + (u.bulb ? " with-gloss" : "");
      const src = line ? lineSrc(k, line, raw, u) : highlight(raw, cell.tags[k]);
      let tray = "";
      if (line && line.tag === "c" && !line.checked) {
        tray = `<div class="tray">${line.chips.map((c, n) => `<button class="${c.used ? "used" : ""}" data-act="chip" data-l="${k}" data-c="${n}">${esc(c.t)}</button>`).join("")}</div>`;
      }
      return `<div class="${cls}"><span class="no">${k + 1}</span><span class="src">${src}</span>${gloss}</div>${tray}`;
    }).join("");
    const r = u.p.result;
    const best = App.cellStore(m, i).practice[u.p.level];
    const scoreHtml = r ? `<span class="score ${r.pct >= 90 ? "good" : r.pct >= 60 ? "mid" : "low"}">${r.right}/${r.total} right</span>` : best !== undefined ? `<span class="score" style="color:var(--faint);font-weight:400">Best ${best}%</span>` : "";
    return `<div class="code">${rows}</div>
      <div class="cell-foot">
        <div class="seg">${[1, 2, 3].map((l) => `<button data-act="plevel" data-v="${l}" class="${u.p.level === l ? "on" : ""}">${LEVELS[l]}</button>`).join("")}</div>
        <button class="btn primary small" data-act="pcheck">${ICON.check}Check</button>
        <button class="btn small" data-act="preveal">${ICON.eye}Show answers</button>
        <button class="btn ghost small" data-act="pnew">${ICON.redo}New round</button>
        ${scoreHtml}
        <span style="margin-left:auto;color:var(--faint);font-size:12px">Type in the gaps for Python, tap the pieces for C</span>
      </div>`;
  }

  function mount(m, i, el, u) {
    el.querySelectorAll("input.blank-in").forEach((inp) => {
      inp.addEventListener("input", () => {
        const line = u.p.lines[Number(inp.dataset.l)];
        line.typed[inp.dataset.k] = inp.value;
        delete line.marks[inp.dataset.k];
        inp.classList.remove("ok", "bad");
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const all = [...el.querySelectorAll("input.blank-in")];
        const next = all[all.indexOf(inp) + 1];
        if (next) next.focus();
        else check(m, i, u);
      });
    });
    if (!el.querySelector("input.blank-in:focus")) {
      const first = [...el.querySelectorAll("input.blank-in")].find((x) => !x.value);
      if (first && u.p.focus !== false) first.focus({ preventScroll: true });
    }
  }

  function check(m, i, u) {
    let right = 0, total = 0;
    u.p.lines.forEach((line) => {
      if (!line) return;
      if (line.tag === "c") {
        slotsOf(line).forEach((s) => {
          total++;
          if (line.filled[s] && line.filled[s].t === answerOf(line, s)) right++;
        });
        line.checked = true;
        return;
      }
      if (line.b.whole) {
        total++;
        const ok = squash(line.typed.w || "") === squash(line.b.answer);
        line.marks.w = ok ? "ok" : "bad";
        if (ok) right++;
        return;
      }
      line.b.toks.forEach((t, n) => {
        if (!t.blank) return;
        total++;
        const ok = (line.typed[n] || "").trim() === t.t;
        line.marks[n] = ok ? "ok" : "bad";
        if (ok) right++;
      });
    });
    const pct = total ? Math.round((100 * right) / total) : 100;
    u.p.result = { right, total, pct };
    if (!u.p.revealed) {
      const st = App.cellStore(m, i);
      st.practice[u.p.level] = Math.max(st.practice[u.p.level] || 0, pct);
      App.save();
    }
    u.p.focus = false;
    App.rerenderKeepScroll();
    if (pct === 100) App.toast(u.p.level < 3 ? "All right. Try the next level." : "Whole cell from memory. Nice.");
  }

  function reveal(m, i, u) {
    u.p.revealed = true;
    u.p.lines.forEach((line) => {
      if (!line) return;
      if (line.tag === "c") {
        line.chips.forEach((c) => (c.used = true));
        slotsOf(line).forEach((s) => (line.filled[s] = { t: answerOf(line, s), n: -1 }));
        line.checked = true;
      } else if (line.b.whole) {
        line.typed.w = line.b.answer;
        line.marks.w = "ok";
      } else {
        line.b.toks.forEach((t, n) => {
          if (t.blank) { line.typed[n] = t.t; line.marks[n] = "ok"; }
        });
      }
    });
    u.p.result = null;
    u.p.focus = false;
    App.rerenderKeepScroll();
  }

  function act(name, el, m, i, u) {
    if (!u.p) return;
    const k = Number(el.dataset.l);
    const line = u.p.lines[k];
    if (name === "plevel") {
      App.store.prefs.plevel = Number(el.dataset.v);
      App.save();
      newRound(m, i, u, Number(el.dataset.v));
      App.rerenderKeepScroll();
    } else if (name === "pnew") {
      newRound(m, i, u, u.p.level);
      App.rerenderKeepScroll();
    } else if (name === "pcheck") check(m, i, u);
    else if (name === "preveal") reveal(m, i, u);
    else if (name === "chip" && line) {
      const chip = line.chips[Number(el.dataset.c)];
      const slot = slotsOf(line).find((s) => !line.filled[s]);
      if (slot === undefined || chip.used) return;
      line.filled[slot] = { t: chip.t, n: Number(el.dataset.c) };
      chip.used = true;
      if (slotsOf(line).every((s) => line.filled[s])) line.checked = true;
      u.p.focus = false;
      App.rerenderKeepScroll();
    } else if (name === "slot" && line && !line.checked) {
      const s = Number(el.dataset.s);
      const f = line.filled[s];
      if (!f) return;
      if (f.n >= 0) line.chips[f.n].used = false;
      delete line.filled[s];
      App.rerenderKeepScroll();
    } else if (name === "slot" && line && line.checked && !u.p.revealed) {
      line.checked = false;
      slotsOf(line).forEach((s) => {
        const f = line.filled[s];
        if (f && f.t !== answerOf(line, s)) {
          if (f.n >= 0) line.chips[f.n].used = false;
          delete line.filled[s];
        }
      });
      App.rerenderKeepScroll();
    }
  }

  App.modes.practice = { body, mount, act };
})();
