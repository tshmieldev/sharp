import { difficulties } from '../unfry/puzzle';
import { RangeField, Segmented, ToggleRow, type SettingsEditor } from './ui';

/** Unfry's switch for one site, with the shared knobs under it while it is on.
 *  Hold length, the sum and the page size are the same on every site: the
 *  reader's tolerance does not change between tabs. */
export function UnfryGroup({ settings, update, site }: SettingsEditor & { site: 'x' | 'youtube' }) {
  const key = site === 'x' ? 'unfryX' : 'unfryYoutube';
  const on = settings[key];
  const what = site === 'x' ? 'post' : 'video';
  return (
    <section class="group">
      <h2>Unfry</h2>
      <ToggleRow
        label="Low-stimulation mode"
        hint={
          on
            ? `Every ${what} that gets through is locked, and the feed comes ${settings.unfryPageSize} at a time.`
            : `Lock each ${what} behind a held press or a sum, and deal the feed out a page at a time.`
        }
        checked={on}
        onChange={(value) => update(key, value)}
      />
      {on && (
        <>
          <RangeField
            label="Hold to open"
            value={settings.unfryHoldMs}
            min={300}
            max={5000}
            step={100}
            display={`${(settings.unfryHoldMs / 1000).toFixed(1)} s`}
            onChange={(value) => update('unfryHoldMs', Math.round(value))}
          />
          <div class="field">
            <span class="rowline">
              <span>Or solve a sum</span>
              <span class="spacer" />
              <b class="range-value">
                {difficulties.find((entry) => entry.value === settings.unfryPuzzle)?.sample}
              </b>
            </span>
            <Segmented
              label="Sum difficulty"
              value={settings.unfryPuzzle}
              options={difficulties}
              onChange={(value) => update('unfryPuzzle', value)}
            />
          </div>
          <RangeField
            label={`${what === 'post' ? 'Posts' : 'Videos'} per page`}
            value={settings.unfryPageSize}
            min={1}
            max={12}
            step={1}
            display={String(settings.unfryPageSize)}
            onChange={(value) => update('unfryPageSize', Math.round(value))}
          />
          <p class="note tight">
            Tap a lock for the sum instead of holding. Hidden {what}s stay hidden and do not count
            toward a page. Opened locks stay open until the tab is closed.
          </p>
        </>
      )}
    </section>
  );
}
