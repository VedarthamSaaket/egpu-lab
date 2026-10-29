import numpy as np
import sim

_state = {"windows": set(), "keys": 0}


class VideoCapture:
    def __init__(self, index=0):
        self.index = index
        self.opened = True
        sim.note(f"[camera] USB camera {index} opened (640x480, simulated)")

    def isOpened(self):
        return self.opened

    def read(self):
        if not self.opened:
            return False, None
        return True, np.zeros((480, 640, 3), dtype=np.uint8)

    def release(self):
        self.opened = False
        sim.note("[camera] released")


def imshow(name, img):
    if name not in _state["windows"]:
        _state["windows"].add(name)
        h, w = img.shape[:2]
        sim.note(f"[window '{name}'] live stream showing {w}x{h} frames")


def waitKey(delay=0):
    _state["keys"] += 1
    sim.advance(delay / 1000 if delay > 0 else 0)
    if _state["keys"] == 90:
        sim.note(f"[{sim.stamp()}] you pressed q after {_state['keys']} frames")
        return ord("q")
    return -1


def destroyAllWindows():
    _state["windows"].clear()
    sim.note("[window] all windows closed")


def destroyWindow(name):
    _state["windows"].discard(name)
