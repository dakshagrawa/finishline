export function minimumFinalScore(current: number, finalWeight: number, target: number): number | null {
  if (![current, finalWeight, target].every(Number.isFinite)) return null;
  if (current < 0 || current > 200 || target < 0 || target > 200 || finalWeight <= 0 || finalWeight > 100) return null;
  const weight = finalWeight / 100;
  return (target - current * (1 - weight)) / weight;
}
