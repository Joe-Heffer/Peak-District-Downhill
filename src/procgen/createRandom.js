// mulberry32 — small seeded PRNG shared by every procgen scatter pipeline (rocks,
// grass, future scattered content) so placement is reproducible across runs/tests
// rather than reshuffling on every load. Moved out of Scenery.js so it's not private
// to one scatter type.
export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
