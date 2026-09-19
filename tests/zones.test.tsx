// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfidenceZones, ImageRange, linesNote, rangeNote } from '../src/popup/Zones';

afterEach(() => (document.body.innerHTML = ''));
const mount = (node: preact.ComponentChild) => {
  const root = document.createElement('div');
  document.body.append(root);
  act(() => render(node, root));
  return root;
};

it('marks both of the reader’s lines, and merges the labels when they would collide', () => {
  const texts = (root: HTMLElement) =>
    [...root.querySelectorAll('.zones-mark')].map((mark) => mark.textContent);
  expect(texts(mount(<ConfidenceZones hide={0.5} line={0.8} />))).toEqual(['50%', '80%']);
  expect(texts(mount(<ConfidenceZones hide={0.5} line={0.55} />))).toEqual(['50–55%']);
  expect(texts(mount(<ConfidenceZones hide={0.5} line={0.5} />))).toEqual(['50%']);
  expect(texts(mount(<ConfidenceZones hide={0} line={1} />))).toEqual(['0%', '100%']);
});

it('says what the image range does in one short note', () => {
  expect(rangeNote(0.5, 0.8)).toBe(
    'Posts are scored on text first. Those scoring 50–80% get their images described and are scored again. Posts with no text always use their images.',
  );
  expect(rangeNote(0.6, 0.6)).toBe('Images are only described for posts with no text.');
  expect(rangeNote(0, 1)).toBe('Images are described for every post.');
});

it('explains the two lines with the reader’s own numbers, at the ends too', () => {
  expect(linesNote(0.5, 0.8)).toBe(
    'A post scored under 50% stays. From 50% to 80% it is a close call: hidden behind a tinted banner, never reported to X. From 80% it is hidden.',
  );
  expect(linesNote(0.5, 0.5)).toBe('A post scored under 50% stays. From 50% it is hidden.');
  expect(linesNote(0.7, 1)).toContain('From 70% it is a close call');
  expect(linesNote(0.7, 1)).not.toContain('From 100%');
  expect(linesNote(0, 0)).toBe('Every post is hidden, whatever it scores.');
  expect(linesNote(0, 0.3)).toBe(
    'Every post is hidden. One scored under 30% is a close call: hidden behind a tinted banner, never reported to X.',
  );
});

it('picks the range with two thumbs that cannot cross', () => {
  const onChange = vi.fn();
  const root = mount(
    <ImageRange
      hide={0.5}
      line={0.8}
      from={0.5}
      below={0.8}
      disabled={false}
      onChange={onChange}
    />,
  );
  expect(root.querySelector('.range-value')?.textContent).toBe('50–80%');
  const [from, below] = [...root.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  const drag = (input: HTMLInputElement, value: number) => {
    input.value = String(value);
    act(() => void input.dispatchEvent(new Event('input', { bubbles: true })));
  };
  drag(from!, 20);
  expect(onChange).toHaveBeenLastCalledWith(0.2, 0.8);
  drag(from!, 95);
  expect(onChange).toHaveBeenLastCalledWith(0.8, 0.8);
  drag(below!, 10);
  expect(onChange).toHaveBeenLastCalledWith(0.5, 0.5);
  drag(below!, 100);
  expect(onChange).toHaveBeenLastCalledWith(0.5, 1);
});

it('names the ends of the range, and switches off with photos', () => {
  const value = (from: number, below: number, disabled = false) =>
    mount(
      <ImageRange
        hide={0.5}
        line={0.8}
        from={from}
        below={below}
        disabled={disabled}
        onChange={() => {}}
      />,
    );
  expect(value(0, 1).querySelector('.range-value')?.textContent).toBe('Every post');
  expect(value(0.4, 0.4).querySelector('.range-value')?.textContent).toBe('Never');
  const off = value(0.5, 0.8, true);
  expect(off.querySelector('.zones')?.getAttribute('data-disabled')).toBe('true');
  expect(off.querySelector('.range-value')?.textContent).toBe('Photos off');
  expect([...off.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
});
