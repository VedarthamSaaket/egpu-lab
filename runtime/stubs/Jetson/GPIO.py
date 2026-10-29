import sim

BOARD = "BOARD"
BCM = "BCM"
OUT = "OUT"
IN = "IN"
HIGH = 1
LOW = 0
PUD_UP = "PUD_UP"
PUD_DOWN = "PUD_DOWN"
PUD_OFF = "PUD_OFF"

_mode = {"value": None}
_pins = {}


def _list(channel):
    return list(channel) if isinstance(channel, (list, tuple)) else [channel]


def setmode(mode):
    _mode["value"] = mode
    sim.note(f"[GPIO] numbering mode {mode}")


def setwarnings(flag):
    pass


def setup(channel, direction, pull_up_down=PUD_OFF, initial=None):
    if _mode["value"] is None:
        raise RuntimeError("Please set pin numbering mode using GPIO.setmode(GPIO.BOARD) or GPIO.setmode(GPIO.BCM)")
    for pin in _list(channel):
        _pins[pin] = {"dir": direction, "value": LOW if initial is None else int(initial), "pull": pull_up_down}
        extra = f", pull {pull_up_down}" if direction == IN and pull_up_down != PUD_OFF else ""
        start = f", starts {'HIGH' if initial else 'LOW'}" if initial is not None else ""
        sim.note(f"[GPIO] pin {pin} set as {'output' if direction == OUT else 'input'}{extra}{start}")


def output(channel, value):
    values = _list(value) if isinstance(value, (list, tuple)) else None
    for i, pin in enumerate(_list(channel)):
        if pin not in _pins or _pins[pin]["dir"] != OUT:
            raise RuntimeError(f"The GPIO channel has not been set up as an OUTPUT (pin {pin})")
        v = int(bool(values[i] if values else value))
        if _pins[pin]["value"] != v or not _pins[pin].get("shown"):
            sim.note(f"[{sim.stamp()}] pin {pin} -> {'HIGH' if v else 'LOW'}")
        _pins[pin]["value"] = v
        _pins[pin]["shown"] = True


def input(channel):
    if channel not in _pins:
        raise RuntimeError(f"You must setup() the GPIO channel first (pin {channel})")
    if _pins[channel]["dir"] == IN:
        t = sim.clock["t"]
        pressed = 1.0 <= t < 3.0 or 5.0 <= t < 6.0
        if pressed != _pins[channel].get("pressed", False):
            sim.note(f"[{sim.stamp()}] button on pin {channel} {'pressed' if pressed else 'released'}")
        _pins[channel]["pressed"] = pressed
        idle = HIGH if _pins[channel]["pull"] == PUD_UP else LOW
        return (1 - idle) if pressed else idle
    return _pins[channel]["value"]


def cleanup(channel=None):
    _pins.clear()
    sim.note("[GPIO] cleanup, all pins released")
