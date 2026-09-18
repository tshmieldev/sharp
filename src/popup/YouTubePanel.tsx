import { Segmented, ToggleRow, type SettingsEditor } from './ui';

const thumbnailOptions = [
  { value: 'shown', label: 'Shown' },
  { value: 'blurred', label: 'Blurred' },
  { value: 'hidden', label: 'Hidden' },
] as const;

export type YouTubeTab = 'filtering' | 'misc';

export function YouTubePanel({ settings, update, tab }: SettingsEditor & { tab: YouTubeTab }) {
  if (tab === 'misc') {
    return (
      <div class="panel">
        <section class="group">
          <h2>Greyscale</h2>
          <ToggleRow
            label="Greyscale UI"
            checked={settings.youtubeGreyscaleUi}
            onChange={(value) => update('youtubeGreyscaleUi', value)}
          />
          <ToggleRow
            label="Greyscale content"
            checked={settings.youtubeGreyscaleContent}
            onChange={(value) => update('youtubeGreyscaleContent', value)}
          />
        </section>
      </div>
    );
  }

  return (
    <div class="panel">
      <section class="group">
        <ToggleRow
          label="Enable Sharp for youtube.com"
          checked={settings.youtubeEnabled}
          onChange={(value) => update('youtubeEnabled', value)}
        />
      </section>
      <section class="group">
        <h2>Hide</h2>
        <ToggleRow
          label="Shorts"
          checked={settings.hideShorts}
          onChange={(value) => update('hideShorts', value)}
        />
        <ToggleRow
          label="Comments"
          checked={settings.hideComments}
          onChange={(value) => update('hideComments', value)}
        />
      </section>
      <section class="group">
        <h2>Thumbnails</h2>
        <Segmented
          label="Thumbnails"
          value={settings.thumbnails}
          options={thumbnailOptions}
          onChange={(value) => update('thumbnails', value)}
        />
      </section>
    </div>
  );
}
