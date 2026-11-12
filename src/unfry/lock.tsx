// The lock on a post the filter let through. Two ways in, both deliberate:
// press and hold for a moment, or answer a sum. What is behind the lock is
// not shown; what is shown is enough to decide whether to bother: who, how
// sure the filter was, and what kind of thing it is.
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Lock as LockIcon } from '../x/icons';
import { newPuzzle, solves, type Difficulty, type Puzzle } from './puzzle';

export type LockProps = {
  /** Who or what: an author's name, a video's title. */
  title: string;
  /** Short facts, each its own token: "88% likely fine", "photo", "long post". */
  facts: readonly string[];
  holdMs: number;
  difficulty: Difficulty;
  onUnlock: () => void;
  /** `row` sits in a post's place; `cover` lies over a thumbnail. */
  layout?: 'row' | 'cover';
  /** The filter was not sure about this one. */
  unsure?: boolean;
};

/** A press shorter than this was a tap, which asks for the sum instead. */
const TAP_MS = 250;

export function Lock({
  title,
  facts,
  holdMs,
  difficulty,
  onUnlock,
  layout = 'row',
  unsure = false,
}: LockProps) {
  const [mode, setMode] = useState<'hold' | 'puzzle'>('hold');
  const [progress, setProgress] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(0);
  const press = useRef<{ at: number; frame: number; pointer: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const unlocked = useRef(false);

  const unlock = () => {
    if (unlocked.current) return;
    unlocked.current = true;
    onUnlock();
  };

  const stop = () => {
    if (press.current) cancelAnimationFrame(press.current.frame);
    press.current = null;
    setProgress(0);
  };

  useEffect(() => stop, []);
  useEffect(() => {
    if (mode === 'puzzle') input.current?.focus();
  }, [mode, puzzle]);

  const openPuzzle = () => {
    setPuzzle(newPuzzle(difficulty));
    setAnswer('');
    setMode('puzzle');
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || mode !== 'hold') return;
    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic event, or a pointer already gone: the hold still works.
    }
    const at = performance.now();
    const tick = () => {
      if (!press.current) return;
      const ratio = Math.min(1, (performance.now() - at) / holdMs);
      setProgress(ratio);
      if (ratio >= 1) {
        stop();
        unlock();
        return;
      }
      press.current.frame = requestAnimationFrame(tick);
    };
    press.current = { at, frame: requestAnimationFrame(tick), pointer: event.pointerId };
  };
  const onPointerUp = (event: PointerEvent) => {
    const current = press.current;
    if (!current || current.pointer !== event.pointerId) return;
    const held = performance.now() - current.at;
    stop();
    if (held < TAP_MS) openPuzzle();
  };
  const onPointerCancel = () => stop();

  const submit = (event: Event) => {
    event.preventDefault();
    if (!puzzle) return;
    if (solves(puzzle, answer)) {
      unlock();
      return;
    }
    setWrong((count) => count + 1);
    setPuzzle(newPuzzle(difficulty));
    setAnswer('');
  };

  const seconds =
    holdMs >= 1000 ? `${(holdMs / 1000).toFixed(holdMs % 1000 ? 1 : 0)} s` : `${holdMs} ms`;

  if (mode === 'puzzle' && puzzle) {
    return (
      <form
        class="aitf-lock aitf-lock-puzzle"
        data-layout={layout}
        data-wrong={wrong || undefined}
        key={wrong}
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <span class="aitf-lock-sum" aria-live="polite">
          {puzzle.question} =
        </span>
        <input
          ref={input}
          class="aitf-lock-answer"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Answer to ${puzzle.question}`}
          value={answer}
          onInput={(event) => setAnswer(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setMode('hold');
            }
          }}
        />
        <button type="submit" class="aitf-lock-go">
          Open
        </button>
        <button
          type="button"
          class="aitf-lock-back"
          aria-label="Back to the lock"
          onClick={() => setMode('hold')}
        >
          Hold instead
        </button>
      </form>
    );
  }

  return (
    <div
      class="aitf-lock"
      data-layout={layout}
      data-unsure={unsure ? 'true' : undefined}
      data-holding={progress > 0 ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Locked: ${title}. Hold for ${seconds} to open, or press Enter for a sum.`}
      style={{ '--aitf-hold': progress }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        // The row wrapper would open the post; the pointer handlers own this.
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          openPuzzle();
        }
      }}
    >
      <span class="aitf-lock-ring" aria-hidden="true">
        <LockIcon />
      </span>
      <span class="aitf-lock-text">
        <span class="aitf-lock-title">{title}</span>
        {facts.length > 0 && (
          <span class="aitf-lock-facts">
            {facts.map((fact, index) => (
              <span key={index} class="aitf-lock-fact">
                {fact}
              </span>
            ))}
          </span>
        )}
      </span>
      <span class="aitf-lock-hint" aria-hidden="true">
        {progress > 0 ? 'Hold…' : `Hold ${seconds}`}
      </span>
    </div>
  );
}

/** Draws a lock into `root` and returns the way to take it down. */
export function mountLock(root: HTMLElement, props: LockProps): () => void {
  render(<Lock {...props} />, root);
  return () => render(null, root);
}
