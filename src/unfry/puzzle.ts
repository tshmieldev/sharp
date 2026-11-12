// Sums that stand between a reader and a post. Pure: no DOM, no chrome.*.
// The point is a moment of deliberate effort, not a test, so every puzzle is
// mental arithmetic a tired person can still do, and a wrong answer only
// deals a new one.

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Puzzle = { question: string; answer: number };

export const difficulties: readonly { value: Difficulty; label: string; sample: string }[] = [
  { value: 'easy', label: 'Easy', sample: '7 + 5' },
  { value: 'medium', label: 'Medium', sample: '34 + 58' },
  { value: 'hard', label: 'Hard', sample: '13 × 7' },
];

const between = (random: () => number, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));

export function newPuzzle(difficulty: Difficulty, random: () => number = Math.random): Puzzle {
  switch (difficulty) {
    case 'easy': {
      const a = between(random, 2, 9);
      const b = between(random, 2, 9);
      return { question: `${a} + ${b}`, answer: a + b };
    }
    case 'medium': {
      if (random() < 0.5) {
        const a = between(random, 12, 89);
        const b = between(random, 12, 89);
        return { question: `${a} + ${b}`, answer: a + b };
      }
      const a = between(random, 30, 99);
      const b = between(random, 11, a - 1);
      return { question: `${a} − ${b}`, answer: a - b };
    }
    case 'hard': {
      if (random() < 0.5) {
        const a = between(random, 6, 19);
        const b = between(random, 3, 9);
        return { question: `${a} × ${b}`, answer: a * b };
      }
      const a = between(random, 20, 99);
      const b = between(random, 20, 99);
      const c = between(random, 10, Math.min(a + b - 1, 60));
      return { question: `${a} + ${b} − ${c}`, answer: a + b - c };
    }
  }
}

/** Only the number counts; spaces and a stray sign are the reader's business. */
export function solves(puzzle: Puzzle, text: string): boolean {
  const trimmed = text.trim();
  return trimmed !== '' && /^[-+]?\d+$/.test(trimmed) && Number(trimmed) === puzzle.answer;
}
