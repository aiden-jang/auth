import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DrawOp } from '@is-it-a-dog/shared';
import { opsToSvg } from './strokeSvg.ts';

test('renders a white background and no strokes for an empty log', () => {
  const svg = opsToSvg([]);
  assert.match(svg, /<svg[^>]*width="800"[^>]*height="600"/);
  assert.match(svg, /<rect[^>]*fill="white"/);
  assert.doesNotMatch(svg, /<polyline/);
});

test('renders a stroke as a scaled polyline with sanitized color + clamped width', () => {
  const ops: DrawOp[] = [
    { kind: 'start', strokeId: 's1', color: '#ff0000', width: 4, point: { x: 0, y: 0 } },
    { kind: 'move', strokeId: 's1', points: [{ x: 0.5, y: 0.5 }, { x: 1, y: 1 }] },
    { kind: 'end', strokeId: 's1' },
  ];
  const svg = opsToSvg(ops);
  assert.match(svg, /<polyline points="0.0,0.0 400.0,300.0 800.0,600.0"/);
  assert.match(svg, /stroke="#ff0000"/);
  assert.match(svg, /stroke-width="4"/);
});

test('a malicious color is dropped to black (no markup injection)', () => {
  const ops: DrawOp[] = [
    { kind: 'start', strokeId: 's1', color: '"/><script>x</script>', width: 200, point: { x: 0, y: 0 } },
    { kind: 'move', strokeId: 's1', points: [{ x: 0.1, y: 0.1 }] },
  ];
  const svg = opsToSvg(ops);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /stroke="#000000"/);
  assert.match(svg, /stroke-width="80"/); // width clamped to max
});

test('clear wipes everything drawn before it', () => {
  const ops: DrawOp[] = [
    { kind: 'start', strokeId: 's1', color: '#000', width: 2, point: { x: 0, y: 0 } },
    { kind: 'move', strokeId: 's1', points: [{ x: 0.2, y: 0.2 }] },
    { kind: 'end', strokeId: 's1' },
    { kind: 'clear' },
  ];
  assert.doesNotMatch(opsToSvg(ops), /<polyline/);
});

test('flushes a stroke that never got an explicit end', () => {
  const ops: DrawOp[] = [
    { kind: 'start', strokeId: 's1', color: '#000', width: 2, point: { x: 0, y: 0 } },
    { kind: 'move', strokeId: 's1', points: [{ x: 0.5, y: 0.5 }] },
  ];
  assert.match(opsToSvg(ops), /<polyline/);
});
