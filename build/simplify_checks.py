import hashlib
import json
import os
import re
from pathlib import Path

CACHE = Path(__file__).resolve().parent.parent / "content" / "simplify-checks.json"
TOKEN = re.compile(r'[A-Za-z_]\w*|\d+\.?\d*[fu]?|"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|>>=|==|!=|<=|>=|//|\*\*|&&|\|\||\+=|-=|->|::|\+\+|[^\sA-Za-z0-9_]')
OPERATORS = set("= + - * / // % ** == != < > <= >= && || += -= >>= ++ ! & | ? ->".split())
TIMING = re.compile(r"((?:Time|Throughput|Performance): )[\d.]+")


def _code(lines, tags):
    out = []
    for line, tag in zip(lines, tags):
        if tag == "py":
            out.append(re.sub(r"\s+#.*$", "", line))
        elif tag == "c":
            out.append(re.sub(r"//.*$", "", line))
    return [line for line in out if line.strip()]


def metrics(lines, tags):
    code = _code(lines, tags)
    tokens = [token for line in code for token in TOKEN.findall(line)]
    widths = [len(line) - len(line.lstrip()) for line in code]
    depth, deepest = 0, 0
    for line in code:
        depth += line.count("{") - line.count("}")
        deepest = max(deepest, depth)
    normal = [re.sub(r"\s+", "", line) for line in code]
    return {
        "tokens": len(tokens),
        "operators": sum(token in OPERATORS for token in tokens),
        "nesting": (max(widths) - min(widths)) // 4 + deepest if widths else 0,
        "repeats": len(normal) - len(set(normal)),
        "lines": len(code),
    }


def simpler(original, simplified):
    improved = [key for key in ("tokens", "operators", "nesting", "repeats") if simplified[key] < original[key]]
    return improved, simplified["tokens"] <= original["tokens"] + 3


def _program(cells):
    lines = []
    for cell in cells:
        if not cell:
            continue
        if lines:
            lines.append("")
        lines.extend(cell)
    return "\n".join(lines)


def _normal(result):
    stdout = "\n".join(line for line in result.get("stdout", "").splitlines() if "the simulator uses its reference" not in line)
    text = TIMING.sub(r"\1#", stdout) + "\n--stderr--\n" + result.get("stderr", "")
    return text.strip()


def _load():
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def check_module(module, simple, allow_run):
    if module["excerpt"]:
        return {index: {"status": "excerpt"} for index in simple}
    cache = _load()
    import execute

    os.environ["EGPU_SEED"] = "7"

    def output(cells):
        code = _program(cells)
        key = hashlib.sha256((module["lang"] + "\n" + code).encode()).hexdigest()
        if key not in cache:
            if not allow_run:
                raise SystemExit(f"{module['id']}: simplify check not cached, rebuild with --run-simplify")
            cache[key] = _normal(execute.run(code, module["lang"]))
            CACHE.write_text(json.dumps(cache, indent=0, sort_keys=True))
        return cache[key]

    current = [list(cell["lines"]) for cell in module["cells"]]
    previous = output(current)
    results = {}
    for index in sorted(simple):
        entry = simple[index]
        if entry["mode"] == "same":
            continue
        current[index - 1] = [] if entry["mode"] == "drop" else list(entry["lines"])
        now = output(current)
        if now == previous:
            results[index] = {"status": "same"}
        else:
            before, after = previous.splitlines(), now.splitlines()
            first = next((i for i in range(max(len(before), len(after))) if (before[i:i + 1] or [""])[0] != (after[i:i + 1] or [""])[0]), 0)
            results[index] = {
                "status": "differs",
                "expected": (before[first:first + 1] or ["(nothing)"])[0].replace("\x1e", ""),
                "got": (after[first:first + 1] or ["(nothing)"])[0].replace("\x1e", ""),
            }
        previous = now
    return results
