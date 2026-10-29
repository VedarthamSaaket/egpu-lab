(function () {
  const PY_KW = new Set("import from as while True False None if else elif try except finally pass break for in def return and or not with lambda".split(" "));
  const C_KW = new Set("int float double char void unsigned const return if else for while struct delete new NULL __global__ __shared__ __kernel __global __local true false".split(" "));
  const BUILTINS = new Set("print len ord range printf get_global_id __syncthreads atomicAdd atomicMin atomic_add_global cudaFree".split(" "));
  const PUNCT = "()[]{},.:;=+-*/<>&|!%^~?";

  const PY_RE = /(\s+)|(#.*$)|([fF]?"""|[fF]?"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\d+\.?\d*(?:e\d+)?[fu]?|0x[0-9a-fA-F]+)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|\/\/|==|!=|<=|>=|>>=|<<|>>|->|::|&&|\|\||\+=|-=|\*=|\/=|\+\+|.)/gy;
  const C_RE = /(\s+)|(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\d+\.?\d*(?:e\d+)?[fu]?|0x[0-9a-fA-F]+)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|\/\/|==|!=|<=|>=|>>=|<<|>>|->|::|&&|\|\||\+=|-=|\*=|\/=|\+\+|.)/gy;

  function tokenize(line, lang) {
    const re = lang === "c" ? C_RE : PY_RE;
    const kw = lang === "c" ? C_KW : PY_KW;
    re.lastIndex = 0;
    const out = [];
    let m;
    while (re.lastIndex < line.length && (m = re.exec(line))) {
      const t = m[0];
      let type = "op";
      if (m[1]) type = "ws";
      else if (m[2]) type = "comment";
      else if (m[3]) type = "str";
      else if (m[4]) type = "num";
      else if (m[5]) type = kw.has(t) ? "kw" : BUILTINS.has(t) ? "fn" : "id";
      out.push({ t, type });
    }
    return out;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function langOf(tag) {
    return tag === "c" ? "c" : "py";
  }

  function highlight(line, tag) {
    if (tag === "comment") return `<span class="tk-comment">${esc(line)}</span>`;
    if (tag === "blank") return "";
    const toks = tokenize(line, langOf(tag));
    return toks.map((k, i) => {
      if (k.type === "ws") return esc(k.t);
      let cls = "tk-" + k.type;
      if (k.type === "id") {
        const next = toks.slice(i + 1).find((x) => x.type !== "ws");
        if (next && next.t === "(") cls = "tk-call";
      }
      return `<span class="${cls}">${esc(k.t)}</span>`;
    }).join("");
  }

  function stripPyComment(line) {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === "\\") i++;
        else if (ch === q) q = null;
      } else if (ch === '"' || ch === "'") q = ch;
      else if (ch === "#") return line.slice(0, i);
    }
    return line;
  }

  function squash(s) {
    let out = s.replace(/\s+/g, " ").trim();
    for (const p of PUNCT) {
      const e = p.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&");
      out = out.replace(new RegExp(`\\s*${e}\\s*`, "g"), p);
    }
    return out;
  }

  function indentWidth(line, unit) {
    const lead = line.match(/^[ \t]*/)[0];
    return lead.replace(/\t/g, " ".repeat(unit)).length;
  }

  function prepare(lines, tags, unit) {
    const out = [];
    lines.forEach((raw, i) => {
      const tag = tags ? tags[i] : guessTag(raw);
      if (!raw.trim() || tag === "comment" || tag === "blank") return;
      const c = tag === "c";
      const body = c ? raw.replace(/\/\/.*$/, "") : stripPyComment(raw);
      if (!body.trim()) return;
      const level = c ? 0 : Math.round(indentWidth(raw, unit) / unit);
      out.push({ raw, index: i, key: (c ? "" : level + "|") + squash(body), level, c });
    });
    return out;
  }

  function guessTag(raw) {
    const s = raw.trim();
    if (!s) return "blank";
    if (s.startsWith("#") && !s.startsWith("#include")) return "comment";
    if (s.startsWith("//")) return "comment";
    return "py";
  }

  function typedTags(lines, expectedTags) {
    const anyC = expectedTags.includes("c");
    const anyPy = expectedTags.includes("py");
    if (anyC && !anyPy) return lines.map((l) => (l.trim().startsWith("//") ? "comment" : l.trim() ? "c" : "blank"));
    let inside = false;
    return lines.map((l) => {
      const s = l.trim();
      const q = (s.match(/"""/g) || []).length;
      let tag;
      if (!s) tag = "blank";
      else if (inside && q === 0) tag = s.startsWith("//") ? "comment" : "c";
      else if (!inside && s.startsWith("#")) tag = "comment";
      else tag = "py";
      if (q % 2) inside = !inside;
      return tag;
    });
  }

  function cellStartsInside(expectedTags) {
    const first = expectedTags.findIndex((t) => t !== "blank" && t !== "comment");
    return first >= 0 && expectedTags[first] === "c";
  }

  function diff(expectedLines, expectedTags, typedText, unit) {
    const typedLines = typedText.replace(/\r/g, "").split("\n");
    let tTags = typedTags(typedLines, expectedTags);
    if (cellStartsInside(expectedTags)) {
      let inside = true;
      tTags = typedLines.map((l) => {
        const s = l.trim();
        const q = (s.match(/"""/g) || []).length;
        let tag = !s ? "blank" : inside && q === 0 ? (s.startsWith("//") ? "comment" : "c") : !inside && s.startsWith("#") ? "comment" : "py";
        if (q % 2) inside = !inside;
        return tag;
      });
    }
    const exp = prepare(expectedLines, expectedTags, unit);
    const got = prepare(typedLines, tTags, unit);
    const n = exp.length, m = got.length;
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        L[i][j] = exp[i].key === got[j].key ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const rows = [];
    let i = 0, j = 0;
    const pendE = [], pendG = [];
    const flush = () => {
      while (pendE.length || pendG.length) {
        const e = pendE.shift(), g = pendG.shift();
        if (e && g) {
          const sameText = squash(e.c ? e.raw : stripPyComment(e.raw)) === squash(g.c ? g.raw : stripPyComment(g.raw));
          rows.push({ status: sameText ? "indent" : "changed", expected: e.raw, typed: g.raw });
        } else if (e) rows.push({ status: "missing", expected: e.raw });
        else rows.push({ status: "extra", typed: g.raw });
      }
    };
    while (i < n || j < m) {
      if (i < n && j < m && exp[i].key === got[j].key) {
        flush();
        rows.push({ status: "ok", expected: exp[i].raw, typed: got[j].raw });
        i++; j++;
      } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) pendG.push(got[j++]);
      else pendE.push(exp[i++]);
    }
    flush();
    const ok = rows.filter((r) => r.status === "ok").length;
    const extra = rows.filter((r) => r.status === "extra").length;
    const score = n ? Math.max(0, Math.round((100 * (ok - extra * 0.5)) / n)) : 100;
    return { rows, score, total: n, ok };
  }

  function shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [b[i], b[k]] = [b[k], b[i]];
    }
    return b;
  }

  const SKIP_ID = new Set(["np", "cl", "cuda", "GPIO", "self"]);

  function blankable(line, tag) {
    if (tag !== "py" && tag !== "c") return false;
    const s = line.trim();
    if (!s || /^("""|f"""|[{}]+|\}\s*else\s*\{|else:|try:|finally:|pass|break)$/.test(s)) return false;
    return true;
  }

  function makeBlanks(line, tag, level) {
    const lang = langOf(tag);
    const toks = tokenize(line, lang);
    if (level === 3) {
      const lead = line.match(/^\s*/)[0];
      const body = line.slice(lead.length);
      if (tag === "c") {
        const parts = tokenize(body, "c");
        const solid = parts.filter((k) => k.type !== "ws");
        return { whole: true, lead, answer: body, chips: solid.map((k) => k.t), parts };
      }
      return { whole: true, lead, answer: body };
    }
    const cands = [];
    toks.forEach((k, idx) => {
      if (k.type === "num" || k.type === "kw" || k.type === "fn" || k.type === "call" || (k.type === "id" && !SKIP_ID.has(k.t))) cands.push(idx);
    });
    if (!cands.length) return null;
    const scored = cands.map((idx) => ({ idx, w: toks[idx].t.length + Math.random() * 4 }));
    scored.sort((a, b) => b.w - a.w);
    const count = level === 1 ? 1 : Math.max(1, Math.ceil(cands.length / 2));
    const pick = new Set(scored.slice(0, count).map((x) => x.idx));
    return { whole: false, toks: toks.map((k, idx) => ({ ...k, blank: pick.has(idx) })) };
  }

  window.Code = { tokenize, highlight, esc, diff, squash, shuffle, makeBlanks, blankable, stripPyComment, langOf };
})();
