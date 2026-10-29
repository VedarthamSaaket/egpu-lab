import numpy as np
import kernelc


class Function:
    def __init__(self, module, name):
        self.module = module
        self.name = name

    def __call__(self, *args, block=None, grid=(1, 1), **kw):
        if block is None:
            raise ValueError(f"{self.name}(...): you must pass block=(x, y, z)")
        for label, dims in (("block", block), ("grid", grid)):
            for x in dims:
                if not isinstance(x, (int, np.integer)):
                    raise TypeError(f"{label} sizes must be whole numbers, got {x!r} (did you use / instead of //?)")
        block = tuple(int(x) for x in block) + (1,) * (3 - len(block))
        grid = tuple(int(x) for x in grid) + (1,) * (3 - len(grid))
        if block[0] * block[1] * block[2] > 1024:
            raise RuntimeError("cuFuncSetBlockShape failed: more than 1024 threads per block")
        self.module.launch(self.name, args, "cuda", grid + block)


class SourceModule:
    def __init__(self, source, **kw):
        if not isinstance(source, str):
            raise TypeError("SourceModule expects the kernel source as a string")
        try:
            self._m = kernelc.Module(source)
        except kernelc.KernelError as e:
            raise CompileError(str(e)) from None

    def get_function(self, name):
        if name not in self._m.sigs:
            raise LogicError(f"cuModuleGetFunction failed: named symbol not found ({name})")
        return Function(self._m, name)


class CompileError(Exception):
    pass


class LogicError(Exception):
    pass
