#pragma once
#include <cstdlib>
inline int cudaFree(void* p) { free(p); return 0; }
