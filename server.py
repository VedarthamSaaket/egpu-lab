import json
import os
import sys
import threading
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "runtime"))

import execute

DATA = ROOT / "app" / "data" / "modules.js"
CACHE = ROOT / "cache" / "answers.json"
MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]
SYSTEM = """You help a student memorise lab programs for an Embedded GPU course (Jetson Nano GPIO, OpenCV, PyCUDA, PyOpenCL, CUDA C and OpenCL C kernels).
Answer the student's doubt about the given block of code.
Reply in at most two short sentences, under 40 words, plain text, no markdown, no lists, no code fences.
You may quote a short piece of code inline.
If the doubt asks to rewrite or simplify, give the shortest correct idea in words.
Stay faithful to the code shown; do not invent APIs. Be precise about Python, numpy and CUDA facts, and if unsure say so in a few words."""
MAX_BODY = 20000

lock = threading.Lock()
modules_cache = {"mtime": 0, "modules": {}}


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def modules():
    mtime = DATA.stat().st_mtime
    if mtime != modules_cache["mtime"]:
        s = DATA.read_text()
        data = json.loads(s[s.index("{"):s.rindex("}") + 1])
        modules_cache["modules"] = {m["id"]: m for m in data["modules"]}
        modules_cache["mtime"] = mtime
    return modules_cache["modules"]


def read_cache():
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def write_cache(key, value):
    with lock:
        data = read_cache()
        data[key] = value
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=0))


def groq(question, context):
    last = None
    for model in MODELS:
        body = {"model": model, "temperature": 0.2, "reasoning_effort": "low", "max_completion_tokens": 700,
                "messages": [{"role": "system", "content": SYSTEM},
                             {"role": "user", "content": f"{context}\n\nDoubt: {question}"}]}
        req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {os.environ.get('GROQ_API_KEY', '')}",
                                              "Content-Type": "application/json", "User-Agent": "egpu-lab/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                text = json.load(r)["choices"][0]["message"]["content"].strip()
            if text:
                return text
        except (urllib.error.URLError, KeyError, TimeoutError, json.JSONDecodeError) as e:
            last = e
    raise RuntimeError(str(last or "empty reply"))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", "/app/")
            self.end_headers()
            return
        if not self.path.startswith("/app/"):
            self.send_error(404)
            return
        super().do_GET()

    def body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("too large")
        return json.loads(self.rfile.read(length))

    def do_POST(self):
        routes = {"/api/run": self.run, "/api/check": self.check, "/api/ask": self.ask}
        if self.path not in routes:
            self.send_error(404)
            return
        try:
            req = self.body()
        except (ValueError, json.JSONDecodeError):
            self.reply(400, {"error": "bad request"})
            return
        routes[self.path](req)

    def lang(self, req):
        m = modules().get(str(req.get("module")))
        return m["lang"] if m else "python"

    def run(self, req):
        code = str(req.get("code", ""))
        self.reply(200, execute.run(code, self.lang(req)))

    def check(self, req):
        code = str(req.get("code", ""))
        self.reply(200, {"errors": execute.check(code, self.lang(req))})

    def ask(self, req):
        m = modules().get(str(req.get("module")))
        question = " ".join(str(req.get("question", "")).split())[:300]
        code = str(req.get("code", ""))[:4000]
        if not m or not question:
            self.reply(400, {"error": "bad request"})
            return
        key = f"{m['id']}|{req.get('cell')}|{req.get('version', 'original')}|{question.lower()}"
        cached = read_cache().get(key)
        if cached:
            self.reply(200, {"text": cached, "cached": True})
            return
        context = f"Week {m['week']}: {m['title']}. Aim: {m['aim']}\nBlock of code:\n{code}"
        try:
            text = groq(question, context)
        except RuntimeError as e:
            self.reply(502, {"error": str(e)[:200]})
            return
        write_cache(key, text)
        self.reply(200, {"text": text, "cached": False})


def main():
    load_env()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"serving http://localhost:{port}/app/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
