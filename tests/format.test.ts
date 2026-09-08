import { expect, it } from 'vitest';
import { context, kilobytes, latency, price, speed, uptime } from '../src/popup/format';

it('renders provider figures the way a reader compares them', () => {
  expect(price(0.00000009)).toBe('$0.09');
  expect(price(0.00001)).toBe('$10');
  expect(price(0)).toBe('Free');
  expect(price(undefined)).toBe('—');
  expect(context(262144)).toBe('262K');
  expect(context(1050000)).toBe('1.05M');
  expect(speed(141.6)).toBe('142 tok/s');
  expect(latency(0.418)).toBe('0.42s');
  expect(uptime(99.98)).toBe('100%');
  expect(kilobytes(512)).toBe('512 B');
});
