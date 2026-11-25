// The lock on a post the filter let through. One way in, deliberate: press
// and hold for a moment. What is behind the lock is not shown; what is shown
// is enough to decide whether to bother: who, how sure the filter was, and
// what kind of thing it is.
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Lock as LockIcon } from '../x/icons';

export type LockProps = {
  /** Who or what: an author's name, a video's title. */
  title: string;
  /** Short facts, each its own token: "88% likely fine", "photo", "long post". */
  facts: readonly string[];
  holdMs: number;
  onUnlock: () => void;
  /** `row` sits in a post's place; `cover` lies over a thumbnail. */
  layout?: 'row' | 'cover';
  /** The filter was not sure about this one. */
  unsure?: boolean;
};

/** How long the "keep holding" nudge stays after a press let go too soon. */
const NUDGE_MS = 900;

/** A held press opens the lock while the finger is still down. Letting go
 *  then lands on whatever the lock was covering, and the page reads that as a
 *  click: X opens the post, YouTube plays the video. The release belongs to
 *  the lock, so the click it makes, and a long press's menu, go nowhere. */
function swallowRelease(pointerId: number) {
  const kinds = ['click', 'auxclick', 'contextmenu'] as const;
  const ends = ['pointerup', 'pointercancel'] as const;
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  let timer = 0;
  const off = () => {
    clearTimeout(timer);
    for (const kind of kinds) window.removeEventListener(kind, swallow, true);
    for (const end of ends) window.removeEventListener(end, released, true);
  };
  // The click follows the release at once; a moment covers a slow device.
  // Only the finger that opened the lock counts: another one lifting says
  // nothing about when this one will.
  const released = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    clearTimeout(timer);
    timer = window.setTimeout(off, 400);
  };
  for (const kind of kinds) window.addEventListener(kind, swallow, true);
  for (const end of ends) window.addEventListener(end, released, true);
  // A release that never comes must not leave the page deaf.
  timer = window.setTimeout(off, 10_000);
}

export function Lock({
  title,
  facts,
  holdMs,
  onUnlock,
  layout = 'row',
  unsure = false,
}: LockProps) {
  const [progress, setProgress] = useState(0);
  const [nudged, setNudged] = useState(false);
  const press = useRef<{ at: number; frame: number; pointer: number | 'key' } | null>(null);
  const nudge = useRef(0);
  const unlocked = useRef(false);

  const unlock = (by: number | 'key') => {
    if (unlocked.current) return;
    unlocked.current = true;
    if (by !== 'key') swallowRelease(by);
    onUnlock();
  };

  const stop = () => {
    if (press.current) cancelAnimationFrame(press.current.frame);
    press.current = null;
    setProgress(0);
  };

  useEffect(
    () => () => {
      stop();
      clearTimeout(nudge.current);
    },
    [],
  );

  /** Let go early: say so, briefly. */
  const letGoEarly = () => {
    stop();
    setNudged(true);
    clearTimeout(nudge.current);
    nudge.current = window.setTimeout(() => setNudged(false), NUDGE_MS);
  };

  const begin = (pointer: number | 'key') => {
    if (press.current) return;
    const at = performance.now();
    const tick = () => {
      if (!press.current) return;
      const ratio = Math.min(1, (performance.now() - at) / holdMs);
      setProgress(ratio);
      if (ratio >= 1) {
        stop();
        unlock(pointer);
        return;
      }
      press.current.frame = requestAnimationFrame(tick);
    };
    press.current = { at, frame: requestAnimationFrame(tick), pointer };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic event, or a pointer already gone: the hold still works.
    }
    begin(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (press.current?.pointer !== event.pointerId) return;
    letGoEarly();
  };
  const onPointerCancel = () => stop();

  const isKey = (event: KeyboardEvent) => event.key === 'Enter' || event.key === ' ';
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) begin('key');
  };
  // A key held down while focus moves away never comes back up here.
  const onBlur = () => {
    if (press.current?.pointer === 'key') stop();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (!isKey(event) || press.current?.pointer !== 'key') return;
    event.preventDefault();
    letGoEarly();
  };

  const seconds =
    holdMs >= 1000 ? `${(holdMs / 1000).toFixed(holdMs % 1000 ? 1 : 0)} s` : `${holdMs} ms`;

  return (
    <div
      class="aitf-lock"
      data-layout={layout}
      data-unsure={unsure ? 'true' : undefined}
      data-holding={progress > 0 ? 'true' : undefined}
      data-nudge={nudged && progress === 0 ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Locked: ${title}. Hold for ${seconds} to open.`}
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
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
    >
      <span class="aitf-lock-ring" aria-hidden="true">
        <LockIcon />
      </span>
      <span class="aitf-lock-text">
        {/* A cover lies over a thumbnail whose title is printed beside it. */}
        {layout === 'row' && <span class="aitf-lock-title">{title}</span>}
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
        {progress > 0 ? 'Hold…' : nudged ? 'Keep holding' : `Hold ${seconds}`}
      </span>
    </div>
  );
}

/** Draws a lock into `root` and returns the way to take it down. */
export function mountLock(root: HTMLElement, props: LockProps): () => void {
  render(<Lock {...props} />, root);
  return () => render(null, root);
}
