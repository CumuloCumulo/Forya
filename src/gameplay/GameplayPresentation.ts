export function formatCheckpointProgress(passed: number, total: number | null): { current: string; total: string } {
  return {
    current: Math.max(0, Math.floor(passed)).toString().padStart(2, '0'),
    total: total === null ? '∞' : Math.max(0, Math.floor(total)).toString().padStart(2, '0'),
  };
}

