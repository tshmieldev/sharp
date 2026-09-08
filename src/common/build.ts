declare const __BUILD_ID__: string;
export const buildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'development';
