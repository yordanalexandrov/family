/**
 * The photos an AI contract's answer puts on its steps, by reference (`e1`, `s1`, …), checked against the references the
 * input has: only `known` ones, each on at most one step. The problems are in Bulgarian, for the retry message to the
 * agent (`hint` says where the known references are); also the number of steps each reference is on, for a contract
 * with more rules (`recipe.refine` keeps every photo of the recipe).
 */
export function stepImageProblems(
  steps: readonly { image: string | null }[],
  known: ReadonlySet<string>,
  hint: string,
): { problems: string[]; count: Map<string, number> } {
  const problems: string[] = [];
  const count = new Map<string, number>();
  steps.forEach((step, index) => {
    if (step.image === null) {
      return;
    }
    if (!known.has(step.image)) {
      problems.push(
        `Стъпка ${index + 1}: снимка ${step.image} не е във входа; ${hint}.`,
      );
    }
    count.set(step.image, (count.get(step.image) ?? 0) + 1);
  });
  for (const [ref, times] of count) {
    if (times > 1) {
      problems.push(
        `Снимка ${ref} е на ${times} стъпки; всяка снимка е най-много на една стъпка.`,
      );
    }
  }
  return { problems, count };
}
