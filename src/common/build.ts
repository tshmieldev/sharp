declare const __BUILD_ID__: string;
declare const __TARGET__: string;

export const buildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'development';
/** Which browser this bundle was built for. A constant at build time, so the
 *  branch the other browser needs is dropped from the bundle entirely. */
export const isFirefox = typeof __TARGET__ === 'string' && __TARGET__ === 'firefox';
/** Where the reader manages installed extensions, for messages that name it. */
export const extensionsPage = isFirefox ? 'about:debugging' : 'chrome://extensions';
