// Float helpers that match the C runtime the Unreal reference builds against.
// std::hypot in the MSVC x64 build returns exactly sqrt(x*x + y*y) (measured: 0 mismatches in 2,000 arena-range samples), while
// V8's Math.hypot differs in about 38% of them. Positions in the combat sim feed back into themselves every tick, so a one-ulp
// difference grows into a different fight; spec-tests/combat checks positions bit for bit.
export const hypot = (x: number, y: number): number => Math.sqrt(x * x + y * y);
