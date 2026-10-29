#pragma once
#include <cstdio>
#include <cstdlib>
#include <cstring>
class imageNet {
public:
    struct ImageData { int width; int height; float* input; };
    static imageNet* Create() { printf("\x1e[jetson-inference] imageNet created (simulated)\n"); return new imageNet(); }
    bool LoadNetwork(const char* model, const char* labels) {
        printf("\x1e[jetson-inference] loaded %s with labels %s (simulated)\n", model, labels);
        return true;
    }
    int Classify(ImageData& img, float* confidence) {
        printf("\x1e[jetson-inference] classifying a %dx%d image (made-up result, no real model here)\n", img.width, img.height);
        *confidence = 0.912f;
        return 207;
    }
    const char* GetClassDesc(int id) { return id == 207 ? "golden retriever" : "unknown"; }
};
