import './style.css';
import { TimelineController } from './controller';
import { installPostMenu } from './post-menu';
import { buildId } from '../common/build';

/** Importing a site entry must not install listeners or touch the page. */
export function startX() {
  const controller = new TimelineController();
  let removeMenu = () => {};
  let disposed = false;
  const dispose = () => {
    disposed = true;
    document.documentElement?.removeAttribute('data-aitf-build');
    document.removeEventListener('DOMContentLoaded', start);
    removeMenu();
    controller.stop();
    window.removeEventListener('pagehide', onPageHide);
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  window.addEventListener('pagehide', onPageHide);
  function start() {
    if (disposed) return;
    document.documentElement.dataset.aitfBuild = buildId;
    void controller.start().then(() => {
      if (!disposed && controller.getSettings())
        removeMenu = installPostMenu(controller.getSettings, controller.correctPost);
    });
  }
  // The manifest runs at document_start, when body may not exist yet.
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
  return dispose;
}
