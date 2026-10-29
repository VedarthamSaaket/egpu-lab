import numpy as np
import kernelc
import sim


class mem_flags:
    READ_WRITE = 1
    WRITE_ONLY = 2
    READ_ONLY = 4
    USE_HOST_PTR = 8
    ALLOC_HOST_PTR = 16
    COPY_HOST_PTR = 32


class Device:
    name = "Simulated OpenCL device (CPU)"

    def __repr__(self):
        return f"<pyopencl.Device '{self.name}'>"


class Platform:
    name = "Simulated OpenCL platform"

    def get_devices(self, device_type=None):
        return [Device()]


def get_platforms():
    return [Platform()]


class Context:
    def __init__(self, devices=None, **kw):
        self.devices = list(devices or [Device()])


def create_some_context(interactive=False):
    return Context()


class CommandQueue:
    def __init__(self, ctx, device=None, properties=None):
        if not isinstance(ctx, Context):
            raise TypeError("CommandQueue needs a Context")
        self.context = ctx

    def finish(self):
        pass


class Event:
    def wait(self):
        return self


class Buffer:
    def __init__(self, ctx, flags, size=0, hostbuf=None):
        if hostbuf is not None:
            size = hostbuf.nbytes
        if not size:
            raise ValueError("Buffer needs a size or a hostbuf")
        self.size = int(size)
        self.flags = flags
        self.buf = np.zeros(self.size, dtype=np.uint8)
        if flags & mem_flags.COPY_HOST_PTR:
            if hostbuf is None:
                raise ValueError("COPY_HOST_PTR needs hostbuf=")
            self.buf[:] = np.ascontiguousarray(hostbuf).reshape(-1).view(np.uint8)
        elif hostbuf is not None and not flags & mem_flags.USE_HOST_PTR:
            raise ValueError("hostbuf given without COPY_HOST_PTR or USE_HOST_PTR")

    def _egpu_ptr(self):
        return self.buf.ctypes.data

    @property
    def nbytes(self):
        return self.size


class Kernel:
    def __init__(self, program, name):
        self.program = program
        self.name = name

    def __call__(self, queue, global_size, local_size, *args, **kw):
        if not isinstance(queue, CommandQueue):
            raise TypeError(f"{self.name}: the first argument must be the CommandQueue")
        g = tuple(int(x) for x in global_size) + (1,) * (3 - len(global_size))
        self.program._m.launch(self.name, args, "cl", g)
        return Event()


class Program:
    def __init__(self, ctx, source):
        self.ctx = ctx
        self.source = source
        self._m = None

    def build(self, options=None, devices=None):
        try:
            self._m = kernelc.Module(self.source, fallback=tuple(kernelc.REFERENCE))
        except kernelc.KernelError as e:
            raise RuntimeError(f"clBuildProgram failed: {e}") from None
        return self

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        if self._m is None:
            raise RuntimeError("call .build() on the Program first")
        if name not in self._m.sigs:
            raise AttributeError(f"no kernel named '{name}' in the program")
        if name in self._m.substituted:
            sim.note(f"[opencl] no {name} kernel in kernel_code, so the simulator uses its reference {name} kernel")
            self._m.substituted.remove(name)
        return Kernel(self, name)


def enqueue_copy(queue, dest, src, **kw):
    if isinstance(dest, np.ndarray) and isinstance(src, Buffer):
        view = dest.reshape(-1).view(np.uint8)
        view[:] = src.buf[:view.size]
    elif isinstance(dest, Buffer) and isinstance(src, np.ndarray):
        data = np.ascontiguousarray(src).reshape(-1).view(np.uint8)
        dest.buf[:data.size] = data
    elif isinstance(dest, Buffer) and isinstance(src, Buffer):
        dest.buf[:src.size] = src.buf
    else:
        raise TypeError("enqueue_copy(queue, dest, src): one side must be a Buffer and the other a numpy array")
    return Event()
