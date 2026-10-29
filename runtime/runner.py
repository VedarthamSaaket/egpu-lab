import os
import sys
import time

here = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(here, "stubs"), here]
if os.environ.get("EGPU_EXTRA_PATH"):
    sys.path.append(os.environ["EGPU_EXTRA_PATH"])
sys.stdout.reconfigure(line_buffering=True)

import sim

if os.environ.get("EGPU_SEED"):
    import numpy

    numpy.random.seed(int(os.environ["EGPU_SEED"]))

time.sleep = sim.advance
path = sys.argv[1]
source = open(path, encoding="utf-8").read()
try:
    code = compile(source, "program.py", "exec")
except SyntaxError as e:
    sys.stderr.write(f"SyntaxError: {e.msg} (line {e.lineno})\n")
    sys.exit(2)
try:
    exec(code, {"__name__": "__main__"})
except KeyboardInterrupt:
    sim.note("program stopped by Ctrl+C")
