import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "runtime"))
sys.path.insert(0, str(ROOT / "build"))

from glosses import RULES
from simplify_checks import check_module, metrics, simpler

MODULES = ROOT / "content" / "modules"
SIMPLE = ROOT / "content" / "simple"
OUT = ROOT / "app" / "data" / "modules.js"
TRIVIAL = {"}", "{", '"""', "else:", "try:", "pass", "break", "return 0;", "return 1;", "} else {", "finally:"}


def trim(lines):
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def parse_module(path):
    meta, output, cells = {}, [], []
    target = None
    for raw in path.read_text().splitlines():
        if raw.startswith("@@cell "):
            kind, title, summary = [p.strip() for p in raw[7:].split("|", 2)]
            cells.append({"kind": kind, "title": title, "summary": summary, "lines": []})
            target = cells[-1]["lines"]
        elif raw.startswith("@@output"):
            target = output
        elif raw.startswith("@") and target is None:
            key, _, value = raw[1:].partition(" ")
            meta[key] = value.strip()
        elif target is not None:
            target.append(raw)
    for c in cells:
        trim(c["lines"])
    return meta, "\n".join(trim(output)), cells


FLAGS = {"same", "drop", "helper", "adds", "fixes", "warn", "info"}


def parse_simple(path, count):
    out = {}
    if not path.exists():
        return out
    current = None
    for raw in path.read_text().splitlines():
        m = re.match(r"^@@ (\d+)((?: [a-z]+)*)(?: \| (.*))?$", raw)
        if m:
            current = int(m.group(1))
            flags = set(m.group(2).split())
            if flags - FLAGS:
                raise SystemExit(f"{path.name}: unknown flags {flags - FLAGS} on cell {current}")
            mode = "same" if "same" in flags else "drop" if "drop" in flags else "code"
            out[current] = {"mode": mode, "note": m.group(3) or "", "flags": sorted(flags), "lines": []}
            if mode != "code":
                current = None
        elif current is not None:
            out[current]["lines"].append(raw)
    for k, v in out.items():
        if k < 1 or k > count:
            raise SystemExit(f"{path.name}: simple cell {k} out of range 1..{count}")
        if v["mode"] == "code":
            trim(v["lines"])
        if v["mode"] == "drop" and not v["note"]:
            raise SystemExit(f"{path.name}: dropped cell {k} needs a note")
        if ({"warn", "info", "fixes", "adds"} & set(v["flags"])) and not v["note"]:
            raise SystemExit(f"{path.name}: cell {k} has warn/info but no note")
    return out


def classify(lines, cpp):
    tags, inside = [], False
    for line in lines:
        s = line.strip()
        if cpp:
            tags.append("blank" if not s else "comment" if s.startswith("//") else "c")
            continue
        quotes = s.count('"""')
        if not s:
            tags.append("blank")
        elif inside and quotes == 0:
            tags.append("comment" if s.startswith("//") else "c")
        elif s.startswith("#") and not inside:
            tags.append("comment")
        else:
            tags.append("py")
        if quotes % 2:
            inside = not inside
    return tags


def gloss(line, tag):
    s = line.strip()
    if tag == "comment":
        return "A comment: " + re.sub(r"^(#|//)\s*", "", s).rstrip(".") + "."
    for pattern, text in RULES:
        m = re.fullmatch(pattern, s)
        if m:
            return text.format(*m.groups(), **m.groupdict())
    return None


def program_of(cells_lines):
    lines, starts = [], []
    for i, cl in enumerate(cells_lines):
        if i and cl:
            lines.append("")
        starts.append(len(lines))
        lines.extend(cl)
    return lines, starts


def build():
    files = sorted(MODULES.glob("*.txt"))
    modules, missing = [], []
    for path in files:
        meta, output, cells = parse_module(path)
        cpp = meta.get("lang") == "cpp"
        program, starts = program_of([c["lines"] for c in cells])
        tags = classify(program, cpp)
        simple = parse_simple(SIMPLE / path.name, len(cells))
        out_cells = []
        for i, c in enumerate(cells):
            begin = starts[i]
            ctags = tags[begin:begin + len(c["lines"])]
            glosses = []
            for line, tag in zip(c["lines"], ctags):
                if tag == "blank":
                    glosses.append("")
                    continue
                g = gloss(line, tag)
                if g is None:
                    missing.append(line.strip())
                glosses.append(g or "")
            s = simple.get(i + 1, {"mode": "same", "note": "", "flags": [], "lines": []})
            cell = {"kind": c["kind"], "title": c["title"], "summary": c["summary"], "lines": c["lines"],
                    "tags": ctags, "glosses": glosses, "start": begin, "simple": s}
            out_cells.append(cell)
        simple_cells = []
        for i, c in enumerate(cells):
            s = simple.get(i + 1, {"mode": "same", "note": "", "flags": [], "lines": []})
            simple_cells.append(c["lines"] if s["mode"] == "same" else [] if s["mode"] == "drop" else s["lines"])
        simple_program, _ = program_of([x for x in simple_cells if x])
        modules.append({
            "id": meta["id"], "week": int(meta["week"]), "title": meta["title"], "theme": meta.get("theme", ""), "track": meta["track"],
            "level": int(meta["level"]), "lang": "cpp" if cpp else "python", "excerpt": meta.get("excerpt") == "yes",
            "experiment": meta.get("experiment", ""), "aim": meta.get("aim", ""), "requirements": meta.get("requirements", ""),
            "note": meta.get("note", ""), "result": meta.get("result", ""), "caveat": meta.get("caveat", ""),
            "output": output, "cells": out_cells, "program": "\n".join(program), "simpleProgram": "\n".join(simple_program),
            "indent": 2 if meta["id"] == "w01" else 4,
        })
    if missing:
        uniq = sorted(set(missing))
        print(f"{len(uniq)} lines have no gloss:")
        for line in uniq:
            print("  " + line)
        raise SystemExit(1)
    missing = tag_simple(modules)
    allow = "--run-simplify" in sys.argv
    if missing:
        print(f"{len(missing)} simplified lines have no gloss:")
        for line in missing:
            print("  " + line)
        raise SystemExit(1)
    mark_repeats(modules)
    verify_simple(modules, allow)
    order = {"common": 0, "hardware": 1, "software": 2}
    modules.sort(key=lambda m: (order[m["track"]], m["level"], m["week"]))
    return modules


def tag_simple(modules):
    missing = []
    for m in modules:
        cpp = m["lang"] == "cpp"
        lines = m["simpleProgram"].split("\n")
        tags = classify(lines, cpp)
        pos = 0
        for c in m["cells"]:
            s = c["simple"]
            if s["mode"] != "code":
                continue
            n = len(s["lines"])
            while pos < len(lines) and lines[pos:pos + n] != s["lines"]:
                pos += 1
            s["tags"] = tags[pos:pos + n] if pos < len(lines) else classify(s["lines"], cpp)
            s["glosses"] = []
            for line, tag in zip(s["lines"], s["tags"]):
                g = "" if tag == "blank" else gloss(line, tag)
                if g is None:
                    missing.append(line.strip())
                s["glosses"].append(g or "")
            pos += n
    return sorted(set(missing))


LABELS = {"tokens": "fewer pieces", "operators": "fewer operators", "nesting": "less nesting", "repeats": "less repetition"}


def verify_simple(modules, allow_run):
    problems = []
    for m in modules:
        entries = {i + 1: c["simple"] for i, c in enumerate(m["cells"])}
        checks = check_module(m, entries, allow_run)
        original_total = simplified_total = 0
        for i, c in enumerate(m["cells"]):
            s = c["simple"]
            before = metrics(c["lines"], c["tags"])
            original_total += before["tokens"]
            if s["mode"] == "same":
                simplified_total += before["tokens"]
                continue
            if s["mode"] == "drop":
                s["check"] = checks.get(i + 1, {"status": "excerpt"})
                continue
            after = metrics(s["lines"], s["tags"])
            simplified_total += after["tokens"]
            improved, within = simpler(before, after)
            s["better"] = [LABELS[k] for k in improved]
            s["check"] = checks.get(i + 1, {"status": "excerpt"})
            flags = set(s["flags"])
            if not flags & {"helper", "adds", "fixes"} and (not improved or not within):
                problems.append(f"{m['id']} cell {i + 1} is not simpler: {before} -> {after}")
            if s["check"]["status"] == "differs" and "warn" not in flags:
                problems.append(f"{m['id']} cell {i + 1} changes the output without a warning: {s['check']}")
        if any("helper" in c["simple"]["flags"] for c in m["cells"]) and simplified_total >= original_total:
            problems.append(f"{m['id']} helper does not make the week shorter overall: {original_total} -> {simplified_total}")
    if problems:
        print("\n".join(problems))
        raise SystemExit(1)


def norm(line):
    return re.sub(r"\s+", " ", line.strip())


def mark_repeats(modules):
    seen = {}
    for m in modules:
        if m["excerpt"]:
            continue
        for c in m["cells"]:
            for line, tag in zip(c["lines"], c["tags"]):
                key = norm(line)
                if tag in ("py", "c") and key not in TRIVIAL and len(key) > 6:
                    seen.setdefault(key, set()).add(m["week"])
    for m in modules:
        for c in m["cells"]:
            c["repeats"] = [sorted(seen.get(norm(l), ())) if len(seen.get(norm(l), ())) >= 3 else [] for l in c["lines"]]


def verify(modules, run):
    import execute
    bad = 0
    for m in modules:
        if m["excerpt"]:
            continue
        for label, code in (("original", m["program"]), ("simplified", m["simpleProgram"])):
            errors = execute.check(code, m["lang"])
            if errors:
                bad += 1
                print(f"{m['id']} {label}: {errors[:3]}")
            if run and not errors:
                r = execute.run(code, m["lang"])
                visible = "\n".join(l for l in r["stdout"].splitlines() if not l.startswith("\x1e"))
                status = "ok" if r["code"] == 0 and not r["stderr"].strip() else "FAIL"
                if status == "FAIL":
                    bad += 1
                print(f"--- {m['id']} {label} [{status}]\n{visible[-700:]}\n{r['stderr'][-600:]}")
    return bad


def main():
    modules = build()
    if "--check" in sys.argv or "--run" in sys.argv:
        if verify(modules, "--run" in sys.argv):
            raise SystemExit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.EGPU = " + json.dumps({"modules": modules}, ensure_ascii=False) + ";\n")
    cells = sum(len(m["cells"]) for m in modules)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(modules)} modules, {cells} cells")


if __name__ == "__main__":
    main()
