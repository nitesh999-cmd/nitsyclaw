export interface FeatureRequestShortcut {
  description: string;
}

const FEATURE_PREFIXES = [
  /^\/addfeature\s+(.+)$/is,
  /^feature\s+request\s*:?\s+(.+)$/is,
  /^add\s+(?:a\s+)?feature\s*:?\s+(.+)$/is,
];

export function parseFeatureRequestShortcut(text: string): FeatureRequestShortcut | null {
  const trimmed = text.trim();
  for (const pattern of FEATURE_PREFIXES) {
    const match = trimmed.match(pattern);
    const description = match?.[1]?.trim();
    if (description) return { description };
  }
  return null;
}
