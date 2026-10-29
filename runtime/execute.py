import ast
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import kernelc

PYTHON = os.environ.get("EGPU_PYTHON", "/usr/bin/python3")
LIMIT = 40000
_site = {}


def numpy_path():
    if "path" not in _site:
        r = subprocess.run([PYTHON, "-c", "import numpy, os; print(os.path.dirname(os.path.dirname(numpy.__file__)))"],
                           capture_output=True, text=True)
        _site["path"] = r.stdout.strip()
    return _site["path"]


def clip(text):
    return text if len(text) <= LIMIT else text[:LIMIT] + "\n... output cut off ..."


def kernel_strings(tree):
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        value = node.value
        text = None
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            text = value.value
        elif isinstance(value, ast.JoinedStr) and all(isinstance(v, ast.Constant) for v in value.values):
            text = "".join(v.value for v in value.values)
        if text and re.search(r"__global__|__kernel", text):
            yield value.lineno, text


def check_python(code):
    try:
        tree = ast.parse(code)
        compile(code, "program.py", "exec")
    except SyntaxError as e:
        return [{"line": e.lineno or 1, "col": e.offset or 1, "msg": e.msg, "source": "python"}]
    errors = []
    for start, text in kernel_strings(tree):
        try:
            for err in kernelc.check(text):
                errors.append({"line": start + err["line"] - 1, "col": err["col"], "msg": err["msg"], "source": "kernel"})
        except kernelc.KernelError as e:
            errors.append({"line": start, "col": 1, "msg": str(e), "source": "kernel"})
    return errors


def cpp_errors(stderr, name):
    out = []
    for m in re.finditer(rf"^.*{re.escape(name)}:(\d+):(\d+): error: (.*)$", stderr, re.M):
        out.append({"line": int(m.group(1)), "col": int(m.group(2)), "msg": m.group(3), "source": "c++"})
    return out


def check_cpp(code):
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "main.cpp"
        src.write_text(code)
        r = subprocess.run(["/usr/bin/clang++", "-std=c++17", "-fsyntax-only", "-w", "-I", str(HERE / "include"), str(src)],
                           capture_output=True, text=True, timeout=60)
    errors = cpp_errors(r.stderr, "main.cpp")
    if r.returncode and not errors:
        errors = [{"line": 1, "col": 1, "msg": r.stderr.strip()[-300:] or "compile failed", "source": "c++"}]
    return errors


def check(code, lang):
    return check_cpp(code) if lang == "cpp" else check_python(code)


def run_python(code, seconds=None):
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "program.py"
        path.write_text(code)
        env = {"PATH": "/usr/bin:/bin", "HOME": d, "PYTHONDONTWRITEBYTECODE": "1",
               "EGPU_KERNEL_CACHE": os.environ.get("EGPU_KERNEL_CACHE", str(Path(tempfile.gettempdir()) / "egpu-lab-kernels"))}
        env["EGPU_EXTRA_PATH"] = numpy_path()
        if os.environ.get("EGPU_SEED"):
            env["EGPU_SEED"] = os.environ["EGPU_SEED"]
        if seconds:
            env["EGPU_SIM_SECONDS"] = str(seconds)
        try:
            r = subprocess.run([PYTHON, "-E", "-s", str(HERE / "runner.py"), str(path)], cwd=d, env=env,
                               capture_output=True, text=True, timeout=60)
        except subprocess.TimeoutExpired:
            return {"stdout": "", "stderr": "Stopped: the program ran for more than 60 seconds.", "code": -1}
    stderr = r.stderr
    if r.returncode < 0:
        stderr += "\nThe program crashed (a kernel probably read or wrote outside its arrays)."
    return {"stdout": clip(r.stdout), "stderr": clip(tidy_traceback(stderr)), "code": r.returncode}


def tidy_traceback(text):
    lines = text.splitlines()
    if not lines or not lines[0].startswith("Traceback"):
        return text
    keep = [lines[0]]
    skip = False
    for line in lines[1:]:
        if line.startswith("  File "):
            skip = 'File "program.py"' not in line
            if not skip:
                keep.append(line)
            continue
        if line.startswith("    ") and skip:
            continue
        keep.append(line)
    return "\n".join(keep)


def run_cpp(code):
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "main.cpp"
        exe = Path(d) / "main"
        src.write_text(code)
        r = subprocess.run(["/usr/bin/clang++", "-std=c++17", "-O1", "-w", "-I", str(HERE / "include"), str(src), "-o", str(exe)],
                           capture_output=True, text=True, timeout=120)
        if r.returncode:
            errors = cpp_errors(r.stderr, "main.cpp")
            msg = "\n".join(f"line {e['line']}: {e['msg']}" for e in errors) or r.stderr[-600:]
            return {"stdout": "", "stderr": "Compile error:\n" + msg, "code": 1}
        header = "\x1e$ ./classify model.engine labels.txt input_image.jpg\n"
        try:
            p = subprocess.run([str(exe), "model.engine", "labels.txt", "input_image.jpg"], cwd=d, capture_output=True, text=True, timeout=20)
        except subprocess.TimeoutExpired:
            return {"stdout": header, "stderr": "Stopped after 20 seconds.", "code": -1}
    return {"stdout": clip(header + p.stdout), "stderr": clip(p.stderr) + ("" if p.returncode >= 0 else "\nThe program crashed."),
            "code": p.returncode}


def run(code, lang):
    return run_cpp(code) if lang == "cpp" else run_python(code)
