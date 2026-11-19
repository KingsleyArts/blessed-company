// Combat golden fixture dumper for the Phaser port: runs scripted CombatSim scenarios in the real C++ Core and writes their
// definitions plus results, so src/core/combatGolden.test.ts can replay each definition in the TS sim and compare.
//   cl /std:c++17 /EHsc /O2 /I<tower-of-the-lost>\Source\TowerOfTheLost\Core dump_combat.cpp /Fe:dump_combat.exe
//   dump_combat.exe <data-dir> <out-dir>      (writes combat-scenarios.json and combat-logs-full.json)
// Results: FNV-1a-64 of the full log text, the summary and an exact unit-state string (doubles as their IEEE-754 bits), so any
// drift in any event, number or position shows. The first scenarios also carry the full log text for readable diffs.
// The scenario runner below is mirrored by runScenario() in src/core/combatScenario.ts. Keep both in step.
#include "CombatSim.h"
#include "CastTimes.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using namespace tol;

static std::string ReadFile(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) { std::printf("cannot read %s\n", path.c_str()); std::exit(1); }
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}
static void WriteFile(const std::string& path, const std::string& body) {
    FILE* fp = std::fopen(path.c_str(), "wb");
    if (!fp) { std::printf("cannot write %s\n", path.c_str()); std::exit(1); }
    std::fwrite(body.data(), 1, body.size(), fp);
    std::fclose(fp);
}
static std::uint64_t Fnv(const std::string& s) {
    std::uint64_t h = 0xcbf29ce484222325ULL;
    for (unsigned char c : s) { h ^= c; h *= 0x100000001b3ULL; }
    return h;
}
static std::string Bits(double v) { std::uint64_t b; std::memcpy(&b, &v, 8); return std::to_string(b); }
static std::string Esc(const std::string& s) {
    std::string o;
    for (char c : s) {
        if (c == '"') o += "\\\""; else if (c == '\\') o += "\\\\"; else if (c == '\n') o += "\\n"; else o += c;
    }
    return o;
}
static std::string StrList(const std::vector<std::string>& v) {
    std::string s = "[";
    for (size_t i = 0; i < v.size(); ++i) s += (i ? ",\"" : "\"") + v[i] + "\"";
    return s + "]";
}

struct MiracleStep { int tick; int kind; };   // kind: 0 Healing, 1 Shield, 2 Smite; target picked by the sim
struct Scenario {
    std::string name;
    std::uint64_t seed = 1;
    std::vector<std::string> party, enemies;
    int floor = 1;
    std::vector<WaveSpec> waves;
    bool castTimes = false;
    bool randomSpawn = false;
    int entryDoor = -1;
    double enemyStatMult = 1.0;
    int fights = 1;               // > 1: PostWinRevive, (odd fights) RestRoom, PrepareNextFight, same enemies again
    std::string rescue;           // added with AddRescuedUnit before fight 2
    double gaugeStart = 0.0;
    std::vector<MiracleStep> miracles;
    int triggerUnit = -1; std::string triggerMode;   // SetTriggerMode on one party unit
    int priorityUnit = -1; std::vector<std::string> priorities;
};

static TriggerMode Trig(const std::string& s) { return ParseTriggerMode(s); }

struct Result { std::string log, summary, state, firstDeath; std::string fightStates; int ticks = 0; };

static Result Run(const CombatData& data, const Scenario& sc) {
    CombatConfig cfg;
    cfg.logCapacity = 1u << 22;
    if (sc.castTimes) InstallShippedCastTimes(cfg);
    cfg.randomEnemySpawn = sc.randomSpawn;
    cfg.enemyStatMult = sc.enemyStatMult;
    CombatSim sim(data, sc.seed, cfg);
    sim.SetPartyEntry(sc.entryDoor);
    for (const auto& p : sc.party) sim.AddPartyUnit(p);
    if (sc.triggerUnit >= 0) sim.SetTriggerMode(sc.triggerUnit, Trig(sc.triggerMode));
    if (sc.priorityUnit >= 0) {
        std::vector<TargetType> l;
        for (const auto& p : sc.priorities) l.push_back(ParseTargetType(p));
        sim.SetTargetPriorities(sc.priorityUnit, l);
    }
    Result r;
    for (int fight = 1; fight <= sc.fights; ++fight) {
        if (fight > 1) {
            if (sim.State() != FightState::Won) break;
            sim.PostWinRevive();
            if (fight % 2 == 0) sim.RestRoom();
            sim.PrepareNextFight();
            if (fight == 2 && !sc.rescue.empty()) sim.AddRescuedUnit(sc.rescue);
        }
        for (const auto& e : sc.enemies) sim.AddEnemy(e, sc.floor);
        for (const auto& w : sc.waves) sim.ScheduleWave(w.atSeconds, w.enemies, w.floorNumber);
        if (sc.gaugeStart > 0.0) sim.MutableGauge().Add(sc.gaugeStart);
        sim.StartFight();
        int guard = 100000;
        while (sim.State() == FightState::Running && guard-- > 0) {
            for (const auto& m : sc.miracles)
                if (m.tick == sim.TickCount()) {
                    const MiracleResult res = sim.CastMiracle(static_cast<MiracleKind>(m.kind));
                    char b[64];
                    std::snprintf(b, sizeof b, "miracle t%d k%d -> %d\n", m.tick, m.kind, static_cast<int>(res));
                    r.state += b;
                }
            sim.Step();
        }
        r.log += sim.Log().ToText();
        r.log += "==\n";
        r.summary += sim.SummaryText();
        r.summary += "==\n";
        r.fightStates += std::to_string(static_cast<int>(sim.State())) + ",";
        r.ticks += sim.TickCount();
        if (sim.FirstDeath().valid) r.firstDeath += sim.FirstDeath().text;
        r.firstDeath += "|";
    }
    for (const Unit& u : sim.Units()) {
        r.state += u.name + "#" + std::to_string(u.id) + (u.alive ? " A " : " D ") + (u.removed ? "R " : "- ") + Bits(u.hp) + " " +
                   Bits(u.x) + " " + Bits(u.y) + " " + Bits(u.damageDone) + " " + Bits(u.threatGenerated) + "\n";
    }
    r.state += "gauge " + Bits(sim.Gauge().Value()) + " enrage " + std::to_string(sim.EnrageStep()) + " killed " +
               std::to_string(sim.EnemiesKilled()) + "\n";
    return r;
}

static std::string Def(const Scenario& sc) {
    std::string s = "\"name\":\"" + sc.name + "\",\"seed\":\"" + std::to_string(sc.seed) + "\",\"party\":" + StrList(sc.party) +
                    ",\"enemies\":" + StrList(sc.enemies) + ",\"floor\":" + std::to_string(sc.floor) + ",\"waves\":[";
    for (size_t i = 0; i < sc.waves.size(); ++i) {
        char b[32]; std::snprintf(b, sizeof b, "%.17g", sc.waves[i].atSeconds);
        s += std::string(i ? "," : "") + "{\"at\":" + b + ",\"enemies\":" + StrList(sc.waves[i].enemies) + ",\"floor\":" +
             std::to_string(sc.waves[i].floorNumber) + "}";
    }
    char m[32]; std::snprintf(m, sizeof m, "%.17g", sc.enemyStatMult);
    char g[32]; std::snprintf(g, sizeof g, "%.17g", sc.gaugeStart);
    s += std::string("],\"castTimes\":") + (sc.castTimes ? "true" : "false") + ",\"randomSpawn\":" + (sc.randomSpawn ? "true" : "false") +
         ",\"entryDoor\":" + std::to_string(sc.entryDoor) + ",\"enemyStatMult\":" + m + ",\"fights\":" + std::to_string(sc.fights) +
         ",\"rescue\":\"" + sc.rescue + "\",\"gaugeStart\":" + g + ",\"miracles\":[";
    for (size_t i = 0; i < sc.miracles.size(); ++i)
        s += std::string(i ? "," : "") + "{\"tick\":" + std::to_string(sc.miracles[i].tick) + ",\"kind\":" + std::to_string(sc.miracles[i].kind) + "}";
    s += "],\"triggerUnit\":" + std::to_string(sc.triggerUnit) + ",\"triggerMode\":\"" + sc.triggerMode + "\",\"priorityUnit\":" +
         std::to_string(sc.priorityUnit) + ",\"priorities\":" + StrList(sc.priorities);
    return s;
}

int main(int argc, char** argv) {
    if (argc < 3) { std::printf("usage: dump_combat <data-dir> <out-dir>\n"); return 1; }
    const std::string dir = argv[1], out = argv[2];
    CombatData data;
    if (!LoadCombatData(data, ReadFile(dir + "/ClassData.csv"), ReadFile(dir + "/EnemyData.csv"), ReadFile(dir + "/AbilityData.csv"),
                        ReadFile(dir + "/AbilityEffectData.csv"))) {
        std::printf("data load failed\n");
        return 1;
    }

    std::vector<Scenario> all;
    auto add = [&](Scenario s) { all.push_back(std::move(s)); };
    const std::vector<std::vector<std::string>> parties = {
        {"Warrior", "Mage"},
        {"Warrior", "Priest", "Mage", "Assassin"},
        {"Warrior", "Priest", "Barbarian", "Summoner"},
        {"Barbarian", "Assassin", "Mage", "Priest"},
        {"Summoner", "Priest", "Mage", "Warrior"},
        {"Assassin", "Summoner"},
        {"Priest"},
        {"Warrior", "Barbarian", "Assassin", "Mage"},
    };
    const std::vector<std::vector<std::string>> packs = {
        {"Grunt", "Grunt", "Grunt"},
        {"Brute", "Grunt", "Archer"},
        {"Shaman", "Archer", "Grunt", "Brute"},
        {"Archer", "Archer", "Shaman", "Shaman", "Grunt"},
    };
    // 1. The headline matrix: every party x pack, instant and shipped cast times, a few seeds and floors.
    for (size_t p = 0; p < parties.size(); ++p)
        for (size_t k = 0; k < packs.size(); ++k)
            for (int ct = 0; ct <= 1; ++ct) {
                Scenario s;
                s.seed = 1 + p * 31 + k * 7 + ct;
                s.party = parties[p];
                s.enemies = packs[k];
                s.floor = 1 + static_cast<int>((p + k) % 4) * 2;
                s.castTimes = ct == 1;
                s.name = "matrix-p" + std::to_string(p) + "-k" + std::to_string(k) + (ct ? "-ct" : "");
                add(s);
            }
    // 2. Seeds sweep on the G2 fight and the standard four.
    for (std::uint64_t sd = 100; sd < 120; ++sd) {
        Scenario s; s.seed = sd; s.party = parties[1]; s.enemies = packs[(sd % 4)]; s.floor = 1 + static_cast<int>(sd % 6);
        s.castTimes = sd % 2 == 0; s.name = "seed-" + std::to_string(sd); add(s);
    }
    // 3. Random spawn from every entry door, with reinforcement waves.
    for (int door = -1; door <= 3; ++door) {
        Scenario s; s.seed = 500 + door; s.party = parties[2]; s.enemies = packs[2]; s.floor = 3; s.randomSpawn = true; s.entryDoor = door;
        s.castTimes = true;
        s.waves = {{4.0, {"Grunt", "Archer"}, 3}, {9.5, {"Brute"}, 4}};
        s.name = "spawn-door" + std::to_string(door); add(s);
    }
    // 4. Waves with fixed spawns; enrage (a long fight); enemyStatMult.
    { Scenario s; s.seed = 600; s.party = parties[0]; s.enemies = {"Grunt"}; s.waves = {{2.0, {"Grunt", "Grunt"}, 1}, {6.0, {"Shaman"}, 2}};
      s.name = "waves-fixed"; add(s); }
    { Scenario s; s.seed = 601; s.party = {"Priest"}; s.enemies = {"Shaman"}; s.floor = 1; s.name = "enrage-long"; add(s); }
    { Scenario s; s.seed = 602; s.party = parties[1]; s.enemies = packs[1]; s.floor = 6; s.enemyStatMult = 1.7; s.castTimes = true; s.name = "statmult"; add(s); }
    { Scenario s; s.seed = 603; s.party = parties[7]; s.enemies = packs[3]; s.floor = 12; s.name = "deep-wipe"; add(s); }
    // 5. Miracles on a schedule (gauge pre-filled), with and without cast times.
    for (int ct = 0; ct <= 1; ++ct) {
        Scenario s; s.seed = 700 + ct; s.party = parties[1]; s.enemies = packs[2]; s.floor = 5; s.castTimes = ct == 1; s.gaugeStart = 100.0;
        s.miracles = {{30, 1}, {60, 0}, {90, 2}, {150, 0}, {400, 2}, {900, 1}};
        s.name = std::string("miracles") + (ct ? "-ct" : ""); add(s);
    }
    // 6. Multi-fight runs: revive, rest room, prepareNextFight, the rescue join.
    for (int i = 0; i < 4; ++i) {
        Scenario s; s.seed = 800 + i; s.party = i % 2 ? parties[2] : parties[1]; s.enemies = packs[i]; s.floor = 2 + i; s.fights = 4;
        s.castTimes = i >= 2; s.rescue = i == 1 ? "Mage" : (i == 3 ? "Assassin" : ""); s.randomSpawn = i == 3; s.entryDoor = i == 3 ? 2 : -1;
        s.name = "multi-" + std::to_string(i); add(s);
    }
    // 7. Trigger modes and target priorities.
    const char* modes[] = {"SaveForBossOrElite", "PackIsLarge", "AllyIsLow"};
    for (int m = 0; m < 3; ++m) {
        Scenario s; s.seed = 900 + m; s.party = parties[1]; s.enemies = packs[3]; s.floor = 2; s.triggerUnit = 0; s.triggerMode = modes[m];
        s.priorityUnit = 2; s.priorities = m == 0 ? std::vector<std::string>{"HealerFirst"} : (m == 1 ? std::vector<std::string>{"ArcherFirst", "Weakest"} : std::vector<std::string>{"Strongest"});
        s.name = std::string("trigger-") + modes[m]; add(s);
    }

    std::string defs = "[", full = "[";
    for (size_t i = 0; i < all.size(); ++i) {
        const Result r = Run(data, all[i]);
        defs += std::string(i ? ",\n" : "\n") + "{" + Def(all[i]) + ",\"ticks\":" + std::to_string(r.ticks) + ",\"fightStates\":\"" + r.fightStates +
                "\",\"firstDeath\":\"" + Esc(r.firstDeath) + "\",\"logHash\":\"" + std::to_string(Fnv(r.log)) + "\",\"logBytes\":" +
                std::to_string(r.log.size()) + ",\"summaryHash\":\"" + std::to_string(Fnv(r.summary)) + "\",\"stateHash\":\"" +
                std::to_string(Fnv(r.state)) + "\",\"summary\":\"" + Esc(r.summary) + "\"}";
        if (i < 12 || all[i].name.rfind("miracles", 0) == 0 || all[i].name.rfind("multi-1", 0) == 0)
            full += std::string(full.size() > 1 ? ",\n" : "\n") + "{\"name\":\"" + all[i].name + "\",\"log\":\"" + Esc(r.log) + "\",\"state\":\"" + Esc(r.state) + "\"}";
    }
    WriteFile(out + "/combat-scenarios.json", defs + "\n]\n");
    WriteFile(out + "/combat-logs-full.json", full + "\n]\n");
    std::printf("%zu combat scenarios written to %s\n", all.size(), out.c_str());
    return 0;
}
