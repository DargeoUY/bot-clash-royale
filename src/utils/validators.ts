export function isValidPlayerTag(tag: string): boolean {
  const cleaned = tag.replace(/^#/, '').replace(/^O/g, '0').toUpperCase();
  return /^[0289CGJLPQRUVY]{3,15}$/.test(cleaned);
}

export function formatPlayerTag(tag: string): string {
  return tag.startsWith('#') ? tag.toUpperCase() : `#${tag.toUpperCase()}`;
}
