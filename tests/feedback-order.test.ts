// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Feedback } from '../src/x/feedback';

const order = (ids: string[]): [string, string][] => ids.map((id) => [id, `m${id}`]);

it('finds the posts the wire placed between two neighbours', () => {
  const feedback = new Feedback();
  feedback.observe(order(['1', '2', '3', '4', '5']));
  expect(feedback.between('1', '4')).toEqual(['2', '3']);
  expect(feedback.between('4', '1')).toEqual([]);
  expect(feedback.between('', '2')).toEqual(['1']);
  expect(feedback.between('4', '')).toEqual(['5']);
  expect(feedback.between('', '')).toEqual([]);
  expect(feedback.between('9', '4')).toEqual([]);
});

it('prefers the newest response that knows both neighbours', () => {
  const feedback = new Feedback();
  feedback.observe(order(['1', '2', '3']));
  feedback.observe(order(['7', '8']));
  feedback.observe(order(['1', '9', '3']));
  expect(feedback.between('1', '3')).toEqual(['9']);
  expect(feedback.between('7', '')).toEqual(['8']);
});

it('ranks posts by the wire order, newest response first', () => {
  const feedback = new Feedback();
  feedback.observe(order(['5', '6']));
  feedback.observe(order(['1', '2', '3']));
  expect(feedback.rank(['6', '3', '1', 'unknown'])).toEqual(['1', '3', '6']);
});
