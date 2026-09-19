export function createStableId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function hashFingerprint(value: string): string {
  const seeds = [2166136261, 305419896, 3735928559, 2271560481];
  const hashes = seeds.map((seed, seedIndex) => {
    let hash = seed;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index) + seedIndex;
      hash = Math.imul(hash, 16777619 + seedIndex * 2);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  });
  return `fnv1a128-${hashes.join("")}`;
}
