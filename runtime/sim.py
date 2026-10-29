import os
import sys

MARK = "\x1e"
LIMIT = float(os.environ.get("EGPU_SIM_SECONDS", "12"))
clock = {"t": 0.0}


def note(text):
    sys.stdout.write(f"{MARK}{text}\n")


def stamp():
    return f"t={clock['t']:.1f}s"


def advance(seconds):
    clock["t"] += max(0.0, float(seconds))
    if clock["t"] > LIMIT:
        note(f"[{stamp()}] Ctrl+C (simulator stops the loop after {LIMIT:g} s)")
        raise KeyboardInterrupt
