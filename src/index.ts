import { startX } from './x';
import { startYouTube } from './youtube';

// The manifest controls injection; this dispatcher controls which site adapter
// starts. Exact hostname matching avoids accidentally enabling an adapter elsewhere.
export function startSite(site: Pick<Location, 'protocol' | 'hostname'> = location) {
  if (site.protocol !== 'https:') return;
  switch (site.hostname) {
    case 'x.com':
    case 'twitter.com':
      return startX();
    case 'www.youtube.com':
      return startYouTube();
  }
}

startSite();
