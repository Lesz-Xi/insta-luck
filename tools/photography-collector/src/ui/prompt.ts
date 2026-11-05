import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function promptSelection(max: number): Promise<readonly number[]> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Choose item number(s) to save, comma-separated: ");
    return parseSelection(answer, max);
  } finally {
    rl.close();
  }
}

export function parseSelection(value: string, max: number): readonly number[] {
  const selected = value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= max);

  return [...new Set(selected)];
}
