import time as _time
import numpy as np


class DeviceAllocation:
    def __init__(self, nbytes):
        self.nbytes = int(nbytes)
        self.buf = np.zeros(max(1, self.nbytes), dtype=np.uint8)
        self.freed = False

    def _egpu_ptr(self):
        if self.freed:
            raise RuntimeError("cuMemcpy failed: this device buffer was already freed")
        return self.buf.ctypes.data

    def free(self):
        self.freed = True

    def __int__(self):
        return self.buf.ctypes.data


def mem_alloc(nbytes):
    return DeviceAllocation(nbytes)


def _bytes(host):
    if not isinstance(host, np.ndarray):
        raise TypeError("expected a numpy array on the host side")
    return np.ascontiguousarray(host).reshape(-1).view(np.uint8)


def memcpy_htod(dest, src):
    if not isinstance(dest, DeviceAllocation):
        raise TypeError("memcpy_htod(device, host): the first argument must be device memory from mem_alloc")
    data = _bytes(src)
    if data.size > dest.nbytes:
        raise ValueError("memcpy_htod: host array is bigger than the device buffer")
    dest._egpu_ptr()
    dest.buf[:data.size] = data


def memcpy_dtoh(dest, src):
    if not isinstance(src, DeviceAllocation):
        raise TypeError("memcpy_dtoh(host, device): the second argument must be device memory from mem_alloc")
    if not isinstance(dest, np.ndarray) or not dest.flags.c_contiguous:
        raise TypeError("memcpy_dtoh: the first argument must be a contiguous numpy array")
    src._egpu_ptr()
    view = dest.reshape(-1).view(np.uint8)
    view[:] = src.buf[:view.size]


class Event:
    def __init__(self, flags=0):
        self.t = None

    def record(self, stream=None):
        self.t = _time.perf_counter()
        return self

    def synchronize(self):
        return self

    def query(self):
        return True

    def time_till(self, end):
        return (end.t - self.t) * 1000.0

    def time_since(self, start):
        return (self.t - start.t) * 1000.0


class Device:
    def __init__(self, n=0):
        self.n = n

    def name(self):
        return "Simulated CUDA device (CPU)"

    @staticmethod
    def count():
        return 1


def init(flags=0):
    pass


def In(a):
    return a


def Out(a):
    return a
