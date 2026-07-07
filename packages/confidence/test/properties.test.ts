/**
 * Property tests encoding the Prism confidence propagation rules
 * (docs/prism-specs.md "Confidence Propagation Rules") so the semantics
 * survive the DSL's removal:
 *
 *   1. Arithmetic operations    → minimum confidence of operands
 *   2. Logical AND (~&&)        → minimum confidence
 *   3. Logical OR (~||)         → maximum confidence
 *   4. Parallel selection (~||>) → highest-confidence value wins
 *   5. Coalescing (~??)         → first value above threshold
 *   6. Property access (~.)     → confidence propagates/degrades per hop
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  add,
  and,
  best,
  cf,
  chain,
  coalesce,
  conf,
  consensus,
  from,
  gate,
  lift,
  majorityVote,
  or,
  prop,
  uncertain,
  val,
  weightedAverage,
} from '../src';

const confidence = fc.double({ min: 0, max: 1, noNaN: true });
const confident = fc
  .tuple(fc.integer(), confidence)
  .map(([v, c]) => cf(v, c));

describe('cf / conf / val', () => {
  it('clamps confidence into [0, 1]', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (c) => {
        const x = cf('v', c);
        expect(x.confidence).toBeGreaterThanOrEqual(0);
        expect(x.confidence).toBeLessThanOrEqual(1);
      })
    );
  });

  it('treats plain values as certain (confidence 1.0)', () => {
    fc.assert(
      fc.property(fc.integer(), (v) => {
        expect(conf(v)).toBe(1.0);
        expect(val(v)).toBe(v);
        expect(from(v)).toEqual(cf(v, 1.0));
      })
    );
  });

  it('round-trips: conf(cf(v, c)) === clamp(c), val(cf(v, c)) === v', () => {
    fc.assert(
      fc.property(fc.integer(), confidence, (v, c) => {
        expect(conf(cf(v, c))).toBe(c);
        expect(val(cf(v, c))).toBe(v);
      })
    );
  });
});

describe('rule 1 — arithmetic propagates minimum confidence', () => {
  it('add/lift carry min confidence and apply the function', () => {
    fc.assert(
      fc.property(confident, confident, (a, b) => {
        const sum = add(a, b);
        expect(sum.value).toBe(a.value + b.value);
        expect(sum.confidence).toBe(Math.min(a.confidence, b.confidence));
      })
    );
  });

  it('lift is order-insensitive in confidence', () => {
    fc.assert(
      fc.property(confident, confident, (a, b) => {
        const f = lift((x: number, y: number) => x - y);
        expect(f(a, b).confidence).toBe(f(b, a).confidence);
      })
    );
  });

  it('chain carries the minimum across all links and the last value', () => {
    fc.assert(
      fc.property(fc.array(confident, { minLength: 1 }), (xs) => {
        const c = chain(...(xs as [typeof xs[0]]));
        expect(c.confidence).toBe(Math.min(...xs.map((x) => x.confidence)));
        expect(c.value).toBe(xs[xs.length - 1]!.value);
      })
    );
  });
});

describe('rules 2 & 3 — AND is min, OR is max', () => {
  it('and() carries minimum confidence', () => {
    fc.assert(
      fc.property(confident, confident, (a, b) => {
        expect(and(a, b).confidence).toBe(
          Math.min(a.confidence, b.confidence)
        );
      })
    );
  });

  it('or() carries maximum confidence', () => {
    fc.assert(
      fc.property(confident, confident, (a, b) => {
        expect(or(a, b).confidence).toBe(Math.max(a.confidence, b.confidence));
      })
    );
  });
});

describe('rule 4 — best() selects the highest confidence', () => {
  it('returns the maximum confidence present, and a value that carried it', () => {
    fc.assert(
      fc.property(fc.array(confident, { minLength: 1 }), (xs) => {
        const winner = best(...xs);
        const max = Math.max(...xs.map((x) => x.confidence));
        expect(winner.confidence).toBe(max);
        expect(
          xs.some((x) => x.value === winner.value && x.confidence === max)
        ).toBe(true);
      })
    );
  });

  it('first operand wins ties', () => {
    expect(best(cf('a', 0.7), cf('b', 0.7)).value).toBe('a');
  });
});

describe('rule 5 — coalesce takes the first value above threshold', () => {
  it('returns the first qualifying operand', () => {
    fc.assert(
      fc.property(
        fc.array(confident, { minLength: 1 }),
        confidence,
        (xs, threshold) => {
          const result = coalesce(xs, threshold);
          const firstQualifying = xs.find((x) => x.confidence >= threshold);
          if (firstQualifying) {
            expect(result).toEqual(firstQualifying);
          } else {
            // Cascade default: the last operand
            expect(result).toEqual(xs[xs.length - 1]);
          }
        }
      )
    );
  });
});

describe('gate (~@>)', () => {
  it('applies fn at/above threshold, yields cf(undefined, 0) below', () => {
    fc.assert(
      fc.property(confident, confidence, (x, threshold) => {
        const result = gate(x, threshold, (v) => v * 2);
        if (x.confidence >= threshold) {
          expect(result.value).toBe(x.value * 2);
          expect(result.confidence).toBe(x.confidence);
        } else {
          expect(result.value).toBeUndefined();
          expect(result.confidence).toBe(0);
        }
      })
    );
  });
});

describe('rule 6 — prop (~.) safe navigation', () => {
  it('preserves confidence while the path resolves', () => {
    fc.assert(
      fc.property(confidence, fc.integer(), (c, leaf) => {
        const obj = cf({ a: { b: { c: leaf } } }, c);
        const result = prop<number>(obj, 'a.b.c');
        expect(result.value).toBe(leaf);
        expect(result.confidence).toBe(c);
      })
    );
  });

  it('degrades confidence per unreached hop and never throws', () => {
    fc.assert(
      fc.property(confidence, (c) => {
        const obj = cf({ a: {} }, c);
        // 'b' missing at hop 2 of 3 → two unreached hops → penalty^2
        const result = prop(obj, 'a.b.c');
        expect(result.value).toBeUndefined();
        expect(result.confidence).toBeCloseTo(c * 0.25, 10);
      })
    );
  });

  it('confidence never increases through navigation', () => {
    fc.assert(
      fc.property(confidence, fc.string(), (c, key) => {
        const result = prop(cf({}, c), key.length > 0 ? key : 'k');
        expect(result.confidence).toBeLessThanOrEqual(c);
      })
    );
  });
});

describe('uncertain — three-band dispatch', () => {
  it('routes to the band its confidence falls in (bounds inclusive)', () => {
    fc.assert(
      fc.property(confident, (x) => {
        const result = uncertain(x, {
          high: () => 'high',
          medium: () => 'medium',
          low: () => 'low',
        });
        const expected =
          x.confidence >= 0.8
            ? 'high'
            : x.confidence >= 0.5
              ? 'medium'
              : 'low';
        expect(result.value).toBe(expected);
        expect(result.confidence).toBe(x.confidence);
      })
    );
  });

  it('honors custom bounds', () => {
    const x = cf('v', 0.6);
    const result = uncertain(
      x,
      { high: () => 'high', medium: () => 'medium', low: () => 'low' },
      { high: 0.6, medium: 0.3 }
    );
    expect(result.value).toBe('high');
  });
});

describe('aggregation', () => {
  it('weightedAverage stays within [min, max] of the values', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: -1000, max: 1000 }), confidence),
          { minLength: 1 }
        ),
        (pairs) => {
          const xs = pairs.map(([v, c]) => cf(v, c));
          if (xs.every((x) => x.confidence === 0)) return; // degenerate
          const w = weightedAverage(xs);
          const values = xs.map((x) => x.value);
          expect(w.value).toBeGreaterThanOrEqual(Math.min(...values) - 1e-9);
          expect(w.value).toBeLessThanOrEqual(Math.max(...values) + 1e-9);
        }
      )
    );
  });

  it('unanimous majorityVote carries the group mean confidence', () => {
    fc.assert(
      fc.property(
        fc.array(confidence, { minLength: 1, maxLength: 20 }),
        (cs) => {
          const xs = cs.map((c) => cf('same', c));
          const vote = majorityVote(xs);
          expect(vote.value).toBe('same');
          const mean = cs.reduce((a, b) => a + b, 0) / cs.length;
          expect(vote.confidence).toBeCloseTo(mean, 10); // agreement = 1
        }
      )
    );
  });

  it('consensus classifies unanimity and splits correctly', () => {
    const unanimous = consensus([cf('a', 0.9), cf('a', 0.8), cf('a', 0.85)]);
    expect(unanimous.value.status).toBe('unanimous');
    expect(unanimous.value.reached).toBe(true);

    const split = consensus([cf('a', 0.9), cf('b', 0.9), cf('c', 0.9)]);
    expect(split.value.status).toBe('split');
    expect(split.value.winner).toBeUndefined();

    const majority = consensus([cf('a', 0.9), cf('a', 0.8), cf('b', 0.9)]);
    expect(majority.value.status).toBe('majority');
    expect(majority.value.winner).toBe('a');
  });
});
