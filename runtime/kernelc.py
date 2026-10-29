import ctypes
import hashlib
import os
import re
import subprocess
import tempfile
from pathlib import Path

CACHE = Path(os.environ.get("EGPU_KERNEL_CACHE", Path(tempfile.gettempdir()) / "egpu-lab-kernels"))
CLANG = os.environ.get("EGPU_CLANG", "/usr/bin/clang++")

PRELUDE = r"""
#include <cstdio>
#include <cmath>
#include <cstdint>
#include <mutex>
#include <barrier>
#include <thread>
#include <vector>
struct __egpu_dim3 { unsigned int x, y, z; };
static thread_local __egpu_dim3 threadIdx, blockIdx;
static __egpu_dim3 blockDim, gridDim;
static thread_local size_t __egpu_gid[3];
static size_t __egpu_gsize[3];
static std::barrier<>* __egpu_bar = nullptr;
static std::mutex __egpu_mx;
#define __global__
#define __device__
#define __host__
#define __shared__ static
#define __kernel
#define __global
#define __local static
#define __constant const
#define __private
typedef unsigned int uint;
typedef unsigned char uchar;
typedef unsigned long ulong;
inline void __syncthreads() { if (__egpu_bar) __egpu_bar->arrive_and_wait(); }
inline size_t get_global_id(unsigned int d) { return d < 3 ? __egpu_gid[d] : 0; }
inline size_t get_global_size(unsigned int d) { return d < 3 ? __egpu_gsize[d] : 1; }
inline size_t get_local_id(unsigned int d) { return 0; }
inline size_t get_group_id(unsigned int d) { return get_global_id(d); }
template <typename T> inline T atomicAdd(T* a, T v) { std::lock_guard<std::mutex> l(__egpu_mx); T o = *a; *a = o + v; return o; }
template <typename T> inline T atomicMin(T* a, T v) { std::lock_guard<std::mutex> l(__egpu_mx); T o = *a; if (v < o) *a = v; return o; }
template <typename T> inline T atomicMax(T* a, T v) { std::lock_guard<std::mutex> l(__egpu_mx); T o = *a; if (v > o) *a = v; return o; }
template <typename T> inline T atomic_add(T* a, T v) { return atomicAdd(a, v); }
template <typename T> inline T atomic_min(T* a, T v) { return atomicMin(a, v); }
template <typename T> inline T atomic_max(T* a, T v) { return atomicMax(a, v); }
template <typename T> inline T atomic_add_global(T* a, T v) { return atomicAdd(a, v); }
"""

REFERENCE = {
    "estimate_pi": r"""
__kernel void estimate_pi(__global float* result, unsigned int num_samples) {
    unsigned int seed = 12345u + get_global_id(0) * 7919u;
    unsigned int inside = 0;
    for (unsigned int i = 0; i < num_samples; i++) {
        seed = seed * 1664525u + 1013904223u;
        float x = (seed >> 8) / 16777216.0f;
        seed = seed * 1664525u + 1013904223u;
        float y = (seed >> 8) / 16777216.0f;
        if (x * x + y * y <= 1.0f) inside++;
    }
    result[get_global_id(0)] = 4.0f * inside / num_samples;
}
"""
}

SIG = re.compile(r"(?:__global__|__kernel)\s+void\s+(\w+)\s*\(([^)]*)\)", re.S)
SCALARS = {
    "int": "int32", "signed int": "int32", "unsigned int": "uint32", "uint": "uint32", "unsigned": "uint32",
    "float": "float32", "double": "float64", "long": "int64", "unsigned long": "uint64", "ulong": "uint64",
    "short": "int16", "char": "int8", "unsigned char": "uint8", "uchar": "uint8", "size_t": "uint64",
}


class KernelError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.errors = errors or []


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def signatures(src):
    out = {}
    for m in SIG.finditer(strip_comments(src)):
        params = []
        for raw in [p.strip() for p in m.group(2).split(",") if p.strip()]:
            pointer = "*" in raw
            words = re.sub(r"\b(const|__global|__local|__constant|__restrict__|restrict|volatile)\b", " ", raw.replace("*", " ")).split()
            base = " ".join(words[:-1])
            if not pointer and base not in SCALARS:
                raise KernelError(f"kernel {m.group(1)}: unsupported parameter type '{raw}'")
            params.append({"pointer": pointer, "type": base, "name": words[-1]})
        out[m.group(1)] = params
    return out


def launcher(name, params, sync):
    args = []
    for i, p in enumerate(params):
        args.append(f"({p['type']}*)a[{i}]" if p["pointer"] else f"*({p['type']}*)a[{i}]")
    call = f"{name}({', '.join(args)});"
    if sync:
        cuda_body = f"""
    for (unsigned bz = 0; bz < (unsigned)gz; bz++) for (unsigned by = 0; by < (unsigned)gy; by++) for (unsigned bx = 0; bx < (unsigned)gx; bx++) {{
        std::barrier<> bar(tx * ty * tz);
        __egpu_bar = &bar;
        std::vector<std::thread> pool;
        for (unsigned z = 0; z < (unsigned)tz; z++) for (unsigned y = 0; y < (unsigned)ty; y++) for (unsigned x = 0; x < (unsigned)tx; x++)
            pool.emplace_back([=]() {{ blockIdx = {{bx, by, bz}}; threadIdx = {{x, y, z}}; {call} }});
        for (auto& t : pool) t.join();
        __egpu_bar = nullptr;
    }}"""
    else:
        cuda_body = f"""
    for (unsigned bz = 0; bz < (unsigned)gz; bz++) for (unsigned by = 0; by < (unsigned)gy; by++) for (unsigned bx = 0; bx < (unsigned)gx; bx++)
    for (unsigned z = 0; z < (unsigned)tz; z++) for (unsigned y = 0; y < (unsigned)ty; y++) for (unsigned x = 0; x < (unsigned)tx; x++) {{
        blockIdx = {{bx, by, bz}}; threadIdx = {{x, y, z}}; {call}
    }}"""
    return f"""
extern "C" void __egpu_cuda_{name}(void** a, int gx, int gy, int gz, int tx, int ty, int tz) {{
    blockDim = {{(unsigned)tx, (unsigned)ty, (unsigned)tz}}; gridDim = {{(unsigned)gx, (unsigned)gy, (unsigned)gz}};{cuda_body}
}}
extern "C" void __egpu_cl_{name}(void** a, int g0, int g1, int g2) {{
    __egpu_gsize[0] = g0; __egpu_gsize[1] = g1; __egpu_gsize[2] = g2;
    for (size_t k = 0; k < (size_t)g2; k++) for (size_t j = 0; j < (size_t)g1; j++) for (size_t i = 0; i < (size_t)g0; i++) {{
        __egpu_gid[0] = i; __egpu_gid[1] = j; __egpu_gid[2] = k; {call}
    }}
}}
"""


def source_for(src, sigs):
    sync = "__syncthreads" in strip_comments(src)
    parts = [PRELUDE, '#line 1 "kernel"\n', src, '\n#line 1 "egpu-launcher"\n']
    parts += [launcher(n, p, sync) for n, p in sigs.items()]
    return "".join(parts)


def parse_errors(text):
    errors = []
    for m in re.finditer(r'^kernel:(\d+):(\d+): (error|warning): (.*)$', text, re.M):
        if m.group(3) == "error":
            errors.append({"line": int(m.group(1)), "col": int(m.group(2)), "msg": m.group(4)})
    return errors


def check(src):
    sigs = signatures(src)
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "k.cpp"
        path.write_text(source_for(src, sigs))
        r = subprocess.run([CLANG, "-std=c++20", "-fsyntax-only", "-w", str(path)], capture_output=True, text=True, timeout=60)
    errors = parse_errors(r.stderr)
    if r.returncode and not errors:
        errors = [{"line": 1, "col": 1, "msg": (r.stderr.strip().splitlines() or ["compile failed"])[-1]}]
    return errors


class Module:
    def __init__(self, src, fallback=()):
        sigs = signatures(src)
        extra = [REFERENCE[n] for n in fallback if n in REFERENCE and n not in sigs]
        self.substituted = [n for n in fallback if n in REFERENCE and n not in sigs]
        full = src + "".join(extra)
        self.sigs = signatures(full)
        code = source_for(full, self.sigs)
        key = hashlib.sha256(code.encode()).hexdigest()[:24]
        CACHE.mkdir(parents=True, exist_ok=True)
        lib = CACHE / f"{key}.dylib"
        if not lib.exists():
            cpp = CACHE / f"{key}.cpp"
            cpp.write_text(code)
            r = subprocess.run([CLANG, "-std=c++20", "-O2", "-shared", "-fPIC", "-w", "-o", str(lib) + ".tmp", str(cpp)],
                               capture_output=True, text=True, timeout=120)
            if r.returncode:
                errors = parse_errors(r.stderr)
                first = errors[0] if errors else {"line": 0, "msg": r.stderr.strip()[-400:]}
                raise KernelError(f"kernel compile error at kernel line {first['line']}: {first['msg']}", errors)
            os.replace(str(lib) + ".tmp", lib)
        self.lib = ctypes.CDLL(str(lib))

    def launch(self, name, args, mode, dims):
        if name not in self.sigs:
            raise KernelError(f"no kernel named '{name}' in the source")
        params = self.sigs[name]
        if len(args) != len(params):
            raise KernelError(f"{name} takes {len(params)} arguments, got {len(args)}")
        import numpy as np
        keep = []
        ptrs = (ctypes.c_void_p * max(1, len(params)))()
        for i, (p, a) in enumerate(zip(params, args)):
            if p["pointer"]:
                if not hasattr(a, "_egpu_ptr"):
                    raise KernelError(f"{name}: argument {i + 1} ({p['name']}) must be device memory")
                ptrs[i] = a._egpu_ptr()
            else:
                if hasattr(a, "_egpu_ptr"):
                    raise KernelError(f"{name}: argument {i + 1} ({p['name']}) must be a number, not a buffer")
                v = np.array(a, dtype=SCALARS[p["type"]])
                keep.append(v)
                ptrs[i] = v.ctypes.data
        fn = getattr(self.lib, f"__egpu_{mode}_{name}")
        fn(ptrs, *[ctypes.c_int(int(x)) for x in dims])
