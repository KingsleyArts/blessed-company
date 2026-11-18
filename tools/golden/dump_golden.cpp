// Golden fixture dumper for the Phaser port. Build against the Unreal repo's Core (read-only reference):
//   cl /std:c++17 /EHsc /O2 /I<tower-of-the-lost>\Source\TowerOfTheLost\Core dump_golden.cpp <...>\FloorGenerator.cpp /Fe:dump_golden.exe
//   dump_golden.exe <out-dir>      (writes rng.json, floors-digest.json, floors-full.json, floors-variants.json)
// Canonical floor string and FNV-1a-64 hash are mirrored by src/core/goldenFloor.ts. Keep both in step.
#include "FloorGenerator.h"

#include <cstdio>
#include <cstdlib>
#include <string>

using namespace tol;

static std::string u64s(std::uint64_t v) { return std::to_string(v); }
static std::string dbl(double v) { char b[40]; std::snprintf(b, sizeof b, "%.17g", v); return b; }

static std::string packStr(const EnemyPack& p) {
    return std::to_string(p.size) + "," + std::to_string(p.counts[0]) + "," + std::to_string(p.counts[1]) + "," +
           std::to_string(p.counts[2]) + "," + std::to_string(p.counts[3]);
}

static std::string canonical(const Floor& f) {
    std::string s;
    s += std::to_string(f.number) + "," + u64s(f.seed) + "," + (f.isBoss ? "1" : "0") + "," + std::to_string(f.cols) + "," +
         std::to_string(f.rows) + "," + std::to_string(f.startNode) + "," + std::to_string(f.crystalNode) + "," +
         (f.crystalRequiresBossKill ? "1" : "0") + "," + std::to_string(f.totalEnemies) + "," + std::to_string(f.killQuota) + "," +
         std::to_string(f.roomRoll) + "," + (f.usedFallbackLayout ? "1" : "0") + "," + std::to_string(f.rescueNode) + "," +
         (f.isTutorial ? "1" : "0") + "," + (f.isRescueLayout ? "1" : "0") + ";";
    for (const Node& n : f.nodes) {
        s += std::to_string(n.id) + "," + std::to_string(n.gx) + "," + std::to_string(n.gy) + "," + std::to_string(static_cast<int>(n.type)) +
             "," + std::to_string(n.shape) + "," + std::to_string(n.door[0]) + "," + std::to_string(n.door[1]) + "," +
             std::to_string(n.door[2]) + "," + std::to_string(n.door[3]) + ",P" + packStr(n.pack) + "," + (n.hasReinforcements ? "1" : "0") +
             ",R" + packStr(n.reinforcements) + "," + (n.hasCrystal ? "1" : "0") + "," + (n.revealed ? "1" : "0") + "," + (n.known ? "1" : "0") +
             "," + (n.isStart ? "1" : "0") + "," + (n.isDeadEnd ? "1" : "0") + "," + (n.isRescueRoom ? "1" : "0") + "|";
    }
    return s;
}

static std::uint64_t fnv1a(const std::string& s) {
    std::uint64_t h = 0xcbf29ce484222325ULL;
    for (unsigned char c : s) { h ^= c; h *= 0x100000001b3ULL; }
    return h;
}

static std::string digestEntry(std::uint64_t seed, int fl, bool hp, const Floor& f) {
    return "{\"seed\":" + u64s(seed) + ",\"floor\":" + std::to_string(fl) + ",\"hasPriest\":" + (hp ? "true" : "false") +
           ",\"floorSeed\":\"" + u64s(f.seed) + "\",\"hash\":\"" + u64s(fnv1a(canonical(f))) + "\",\"nodes\":" + std::to_string(f.nodes.size()) +
           ",\"totalEnemies\":" + std::to_string(f.totalEnemies) + ",\"killQuota\":" + std::to_string(f.killQuota) +
           ",\"roomRoll\":" + std::to_string(f.roomRoll) + ",\"scaling\":" + dbl(f.scaling) + "}";
}

static std::string fullEntry(std::uint64_t seed, int fl, bool hp, const Floor& f) {
    std::string s = "{\"seed\":" + u64s(seed) + ",\"floor\":" + std::to_string(fl) + ",\"hasPriest\":" + (hp ? "true" : "false") +
                    ",\"canonical\":\"" + canonical(f) + "\"}";
    return s;
}

static void writeFile(const std::string& path, const std::string& body) {
    FILE* fp = std::fopen(path.c_str(), "wb");
    if (!fp) { std::printf("cannot write %s\n", path.c_str()); std::exit(1); }
    std::fwrite(body.data(), 1, body.size(), fp);
    std::fclose(fp);
}

int main(int argc, char** argv) {
    if (argc < 2) { std::printf("usage: dump_golden <out-dir>\n"); return 1; }
    const std::string out = argv[1];

    // ---- rng
    {
        const std::uint64_t seeds[] = {0ULL, 1ULL, 42ULL, 0xDEADBEEFCAFEULL, 0xFFFFFFFFFFFFFFFFULL};
        std::string s = "[";
        bool first = true;
        for (std::uint64_t sd : seeds) {
            Rng a(sd), b(sd), c(sd), d(sd);
            std::string u, ni, nd, ch, pw, fs;
            for (int i = 0; i < 8; ++i) u += (i ? "," : "") + std::string("\"") + u64s(a.nextU64()) + "\"";
            for (int i = 0; i < 8; ++i) ni += (i ? "," : "") + std::to_string(b.nextInt(3, 17));
            for (int i = 0; i < 4; ++i) nd += (i ? "," : "") + dbl(c.nextDouble());
            const double w[4] = {40.0, 20.0, 25.0, 15.0};
            for (int i = 0; i < 8; ++i) pw += (i ? "," : "") + std::to_string(d.pickWeighted(w, 4));
            const int fls[] = {-2, 0, 1, 10, 30};
            for (int i = 0; i < 5; ++i) fs += (i ? "," : "") + std::string("\"") + u64s(floorSeed(sd, fls[i])) + "\"";
            Rng e(sd);
            for (int i = 0; i < 6; ++i) ch += (i ? "," : "") + std::string(e.chance(0.3) ? "true" : "false");
            s += std::string(first ? "" : ",") + "{\"seed\":\"" + u64s(sd) + "\",\"u64\":[" + u + "],\"nextInt3_17\":[" + ni + "],\"nextDouble\":[" + nd +
                 "],\"chance03\":[" + ch + "],\"pickWeighted\":[" + pw + "],\"floorSeeds_m2_0_1_10_30\":[" + fs + "]}";
            first = false;
        }
        writeFile(out + "/rng.json", s + "]\n");
    }

    // ---- digests: seeds 1..200, floors 1..10, both Priest flags, default config
    {
        std::string s = "[";
        bool first = true;
        for (int hp = 0; hp <= 1; ++hp) {
            Config cfg; cfg.hasPriest = hp == 1;
            for (std::uint64_t sd = 1; sd <= 200; ++sd)
                for (int fl = 1; fl <= 10; ++fl) {
                    s += std::string(first ? "\n" : ",\n") + digestEntry(sd, fl, hp == 1, generate(sd, fl, cfg));
                    first = false;
                }
        }
        writeFile(out + "/floors-digest.json", s + "\n]\n");
    }

    // ---- deeper floors (11..30, seeds 1..50; the Priest flag only matters on floors 1-2) and scaling for floors 0..60
    {
        std::string s = "[";
        bool first = true;
        Config cfg;
        for (std::uint64_t sd = 1; sd <= 50; ++sd)
            for (int fl = 11; fl <= 30; ++fl) {
                s += std::string(first ? "\n" : ",\n") + digestEntry(sd, fl, false, generate(sd, fl, cfg));
                first = false;
            }
        writeFile(out + "/floors-deep.json", s + "\n]\n");
        std::string sc = "[";
        for (int fl = 0; fl <= 60; ++fl) sc += std::string(fl ? "," : "") + dbl(scalingMultiplier(fl, cfg));
        writeFile(out + "/scaling.json", sc + "]\n");
    }

    // ---- full canonical strings: seeds 1..3, floors 1..10, both flags (readable when a hash mismatch needs debugging)
    {
        std::string s = "[";
        bool first = true;
        for (int hp = 0; hp <= 1; ++hp) {
            Config cfg; cfg.hasPriest = hp == 1;
            for (std::uint64_t sd = 1; sd <= 3; ++sd)
                for (int fl = 1; fl <= 10; ++fl) {
                    s += std::string(first ? "\n" : ",\n") + fullEntry(sd, fl, hp == 1, generate(sd, fl, cfg));
                    first = false;
                }
        }
        writeFile(out + "/floors-full.json", s + "\n]\n");
    }

    // ---- config variants (fallback layout, boss interval 5, clamped huge roll, no rescue/tutorial, other quota/elite values)
    {
        struct V { const char* name; Config cfg; };
        std::vector<V> vs;
        { Config c; c.layoutAttempts = 0; vs.push_back({"fallback", c}); }
        { Config c; c.bossInterval = 5; vs.push_back({"boss5", c}); }
        { Config c; c.roomCountMin = c.roomCountMax = 100; vs.push_back({"hugeRoll", c}); }
        { Config c; c.rescueFloor = 0; c.tutorialFloor = 0; vs.push_back({"noRescueNoTutorial", c}); }
        { Config c; c.killQuotaFraction = 0.5; c.eliteMinFloor = 1; c.eliteMaxFraction = 0.1; vs.push_back({"quotaElite", c}); }
        { Config c; c.tutorialFloor = c.rescueFloor; vs.push_back({"tutorialEqRescue", c}); }
        { Config c; c.tutorialCrystalMaxDistance = 0; vs.push_back({"tutorialCrystalAnywhere", c}); }
        std::string s = "[";
        bool first = true;
        for (const V& v : vs) {
            for (int hp = 0; hp <= 1; ++hp) {
                Config cfg = v.cfg; cfg.hasPriest = hp == 1;
                for (std::uint64_t sd = 1; sd <= 25; ++sd)
                    for (int fl = 1; fl <= 12; ++fl) {
                        std::string e = digestEntry(sd, fl, hp == 1, generate(sd, fl, cfg));
                        e.insert(1, std::string("\"variant\":\"") + v.name + "\",");
                        s += std::string(first ? "\n" : ",\n") + e;
                        first = false;
                    }
            }
        }
        writeFile(out + "/floors-variants.json", s + "\n]\n");
    }
    std::printf("golden fixtures written to %s\n", out.c_str());
    return 0;
}
