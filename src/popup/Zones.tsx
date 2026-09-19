// The classifier's score, 0–100%, drawn as the three things that can happen to
// a post: kept, hidden as a close call, hidden. One bar, used twice. Under
// Confidence it shows the reader's two lines. Under Images the same bar thins
// to a line and swells back to full height over the scores whose posts get
// their images described, picked with two thumbs on the bar itself.

const pct = (value: number) => Math.round(value * 100);

/** Two labels over the bar, or one when they would collide. */
function marksFor(a: number, b: number) {
  const [A, B] = [pct(a), pct(b)];
  if (A === B) return [{ at: a, text: `${A}%` }];
  if (B - A < 12) return [{ at: (a + b) / 2, text: `${A}–${B}%` }];
  return [
    { at: a, text: `${A}%` },
    { at: b, text: `${B}%` },
  ];
}

function Marks({ a, b }: { a: number; b: number }) {
  return (
    <div class="zones-marks">
      {marksFor(a, b).map((mark, index) => (
        <span key={index} class="zones-mark" style={{ '--at': mark.at.toFixed(3) }}>
          {mark.text}
        </span>
      ))}
    </div>
  );
}

function Layers() {
  return (
    <>
      <i class="zone kept" />
      <i class="zone close" />
      <i class="zone sure" />
    </>
  );
}

function Legend() {
  return (
    <div class="zones-legend">
      <span class="kept">Kept</span>
      <span class="close">Close call</span>
      <span class="sure">Hidden</span>
    </div>
  );
}

/** Where the reader's two lines fall. `hide` and `line` are 0–1. */
export function ConfidenceZones({ hide, line }: { hide: number; line: number }) {
  return (
    <div
      class="zones"
      style={{ '--h': hide.toFixed(3), '--t': line.toFixed(3) }}
      aria-hidden="true"
    >
      <Marks a={hide} b={line} />
      <div class="zones-bar">
        <div class="zones-track">
          <Layers />
        </div>
      </div>
      <Legend />
    </div>
  );
}

/** What the two lines do, with the reader's own numbers in it. */
export function linesNote(hide: number, line: number): string {
  const [H, L] = [pct(hide), pct(line)];
  const close = 'a close call: hidden behind a tinted banner, never reported to X';
  if (H <= 0) {
    return L <= 0
      ? 'Every post is hidden, whatever it scores.'
      : `Every post is hidden. One scored under ${L}% is ${close}.`;
  }
  const kept = `A post scored under ${H}% stays.`;
  if (L <= H) return `${kept} From ${H}% it is hidden.`;
  if (L >= 100) return `${kept} From ${H}% it is ${close}.`;
  return `${kept} From ${H}% to ${L}% it is ${close}. From ${L}% it is hidden.`;
}

/** What the image range does. The bar shows which outcomes it takes in. */
export function rangeNote(from: number, below: number): string {
  if (below <= from) return 'Images are only described for posts with no text.';
  if (from <= 0 && below >= 1) return 'Images are described for every post.';
  return `Posts are scored on text first. Those scoring ${pct(from)}–${pct(below)}% get their images described and are scored again. Posts with no text always use their images.`;
}

/** The same bar as a thin line, at full height over the image range, with a
 *  thumb on each edge. Values are 0–1; the thumbs cannot cross. */
export function ImageRange({
  hide,
  line,
  from,
  below,
  disabled,
  onChange,
}: {
  hide: number;
  line: number;
  from: number;
  below: number;
  disabled: boolean;
  onChange: (from: number, below: number) => void;
}) {
  const low = Math.min(from, below);
  const display = disabled
    ? 'Photos off'
    : below <= from
      ? 'Never'
      : from <= 0 && below >= 1
        ? 'Every post'
        : `${pct(from)}–${pct(below)}%`;
  return (
    <div class="field">
      <span class="rowline">
        <span>Describe images for posts scored</span>
        <span class="spacer" />
        <b class="range-value">{display}</b>
      </span>
      <div
        class="zones windowed"
        data-disabled={disabled ? 'true' : undefined}
        style={{
          '--h': hide.toFixed(3),
          '--t': line.toFixed(3),
          '--a': low.toFixed(3),
          '--b': below.toFixed(3),
        }}
      >
        <Marks a={hide} b={line} />
        <div class="zones-bar">
          <div class="zones-track ghost">
            <Layers />
          </div>
          <div class="zones-track zones-window">
            <Layers />
          </div>
          {/* Both thumbs at the right end: the lower one must stay reachable. */}
          <input
            type="range"
            class="zones-thumb"
            min={0}
            max={100}
            step={1}
            value={pct(low)}
            disabled={disabled}
            aria-label="Describe images from this score"
            style={{ zIndex: low + below > 1 ? 2 : 1 }}
            onInput={(event) =>
              onChange(Math.min(event.currentTarget.valueAsNumber / 100, below), below)
            }
          />
          <input
            type="range"
            class="zones-thumb"
            min={0}
            max={100}
            step={1}
            value={pct(below)}
            disabled={disabled}
            aria-label="Describe images up to this score"
            style={{ zIndex: low + below > 1 ? 1 : 2 }}
            onInput={(event) =>
              onChange(low, Math.max(event.currentTarget.valueAsNumber / 100, low))
            }
          />
        </div>
      </div>
    </div>
  );
}
