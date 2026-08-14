export type V1AlignmentOperation = {
  kind: "equal" | "substitute" | "delete" | "insert";
  expected: string | null;
  actual: string | null;
};

export function v1NormalizedWords(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

export function v1EditDistance(expected: string[], actual: string[]): number {
  const previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= actual.length; column += 1) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (expected[row - 1] === actual[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[actual.length] ?? expected.length;
}

export function v1WordErrorRate(expected: string, actual: string): number {
  const reference = v1NormalizedWords(expected);
  return reference.length === 0 ? 0 : v1EditDistance(reference, v1NormalizedWords(actual)) / reference.length;
}

export function v1EntityAccuracy(entities: readonly string[], actual: string): number {
  const words = new Set(v1NormalizedWords(actual));
  return entities.filter((entity) => words.has(entity)).length / entities.length;
}

export function v1Alignment(expectedText: string, actualText: string): V1AlignmentOperation[] {
  const expected = v1NormalizedWords(expectedText);
  const actual = v1NormalizedWords(actualText);
  const costs = Array.from({ length: expected.length + 1 }, () => new Array<number>(actual.length + 1).fill(0));
  for (let row = 0; row <= expected.length; row += 1) costs[row]![0] = row;
  for (let column = 0; column <= actual.length; column += 1) costs[0]![column] = column;
  for (let row = 1; row <= expected.length; row += 1) {
    for (let column = 1; column <= actual.length; column += 1) {
      costs[row]![column] = Math.min(
        costs[row - 1]![column]! + 1,
        costs[row]![column - 1]! + 1,
        costs[row - 1]![column - 1]! + (expected[row - 1] === actual[column - 1] ? 0 : 1),
      );
    }
  }

  const operations: V1AlignmentOperation[] = [];
  let row = expected.length;
  let column = actual.length;
  while (row > 0 || column > 0) {
    const expectedWord = row > 0 ? expected[row - 1]! : null;
    const actualWord = column > 0 ? actual[column - 1]! : null;
    if (
      row > 0 && column > 0 &&
      costs[row]![column] === costs[row - 1]![column - 1]! + (expectedWord === actualWord ? 0 : 1)
    ) {
      operations.push({
        kind: expectedWord === actualWord ? "equal" : "substitute",
        expected: expectedWord,
        actual: actualWord,
      });
      row -= 1;
      column -= 1;
    } else if (row > 0 && costs[row]![column] === costs[row - 1]![column]! + 1) {
      operations.push({ kind: "delete", expected: expectedWord, actual: null });
      row -= 1;
    } else {
      operations.push({ kind: "insert", expected: null, actual: actualWord });
      column -= 1;
    }
  }
  return operations.reverse();
}
