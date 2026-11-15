// Deterministic pseudo-random utilities.
// Same seed always produces the same sequence, in the browser and in Node.

export function hashSeed(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

export function mulberry32(seedBig) {
  let a = seedBig >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

}

export function makeRng(seed) {
  const next = mulberry32(hashSeed(String(seed)));
  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    int(min, maxInclusive) {
      return Math.floor(min + next() * (maxInclusive - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}
