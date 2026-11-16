import { RangeField, ToggleRow, type SettingsEditor } from './ui';

/** Unfry's switch for one site, with the hold length under it while it is on.
 *  The hold is the same on every site: the reader's tolerance does not change
 *  between tabs. */
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
            ? `Every ${what} that gets through is locked until you hold it.`
            : `Lock each ${what} behind a held press.`
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
          <p class="note tight">
            Hidden {what}s stay hidden. Opened locks stay open until the tab is closed.
          </p>
        </>
      )}
    </section>
  );
}
