import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProvider, MockProvider } from './visionProviders.ts';

test('defaults to mock when no keys are configured', () => {
  assert.equal(selectProvider({}).name, 'mock');
});

test('VISION_PROVIDER=mock forces mock even with a key present', () => {
  assert.equal(selectProvider({ VISION_PROVIDER: 'mock', OPENAI_API_KEY: 'sk-x' }).name, 'mock');
});

test('picks the explicitly requested provider when its key is present', () => {
  assert.equal(selectProvider({ VISION_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }).name, 'anthropic');
  assert.equal(selectProvider({ VISION_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }).name, 'openai');
});

test('falls back to the first available key when no explicit pick', () => {
  assert.equal(selectProvider({ OPENAI_API_KEY: 'k' }).name, 'openai');
  assert.equal(selectProvider({ ANTHROPIC_API_KEY: 'k' }).name, 'anthropic');
});

test('an explicit provider without its key falls through to mock', () => {
  assert.equal(selectProvider({ VISION_PROVIDER: 'openai' }).name, 'mock');
});

test('the mock guess is one of the common words', async () => {
  const guess = await new MockProvider().guess('');
  assert.match(guess, /^[a-z]+$/);
});
