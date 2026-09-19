const PUNCTUATION = /[\s\-_.:/\\()[\]{}，。；：、（）【】《》“”‘’·'"`~!@#$%^&*+=?|<>]+/g;

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(PUNCTUATION, "")
    .trim();
}

export function compactText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function isPlaceholderText(value: string | null | undefined): boolean {
  const normalized = compactText(value).toLocaleLowerCase();
  return normalized === "" || /^(?:请选择.*|select(?: one)?|choose(?: one)?|please select|--+|-+)$/iu.test(normalized);
}

export function containsAlias(haystack: string, alias: string): boolean {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedAlias = normalizeText(alias);
  const containsCjk = /[\u3400-\u9fff]/u.test(normalizedAlias);
  const minimumLength = containsCjk ? 2 : 4;
  if (normalizedAlias.length < minimumLength) return false;
  if (containsCjk) return normalizedHaystack.endsWith(normalizedAlias);
  return normalizedHaystack.includes(normalizedAlias);
}

export function isMeaningfulValue(value: string | null | undefined): boolean {
  return compactText(value).length > 0;
}

export function maskSensitiveValue(value: string): string {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.min(8, Math.max(2, value.length - 4)))}${value.slice(-2)}`;
}
