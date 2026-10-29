#pragma once
#include <cstdio>
#include <cstdlib>
inline bool loadImage(const char* path, float** ptr, int* width, int* height) {
    *width = 224;
    *height = 224;
    *ptr = (float*)calloc(224 * 224 * 4, sizeof(float));
    printf("\x1e[jetson-inference] loaded image %s as 224x224 (simulated)\n", path);
    return true;
}
