export const MAX_SEARCH_TERM_CHARS = 120;

export function normalizeSearchTerm(value: string | string[] | null | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, MAX_SEARCH_TERM_CHARS);
}

export function likePatternForSearchTerm(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}
