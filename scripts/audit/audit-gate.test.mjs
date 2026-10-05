import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAudit } from './audit-gate.mjs';

const advisory = (overrides = {}) => ({
  id: 1,
  github_advisory_id: 'GHSA-aaaa-bbbb-cccc',
  severity: 'high',
  module_name: 'left-pad',
  vulnerable_versions: '<=1.0.0',
  title: 'example',
  ...overrides,
});
const entry = (overrides = {}) => ({
  id: 'GHSA-aaaa-bbbb-cccc',
  package: 'left-pad',
  reason: 'not reachable',
  revisit: '2026-12-01',
  ...overrides,
});

test('fails on a high advisory with no allowlist entry', () => {
  const { failures } = evaluateAudit({ advisories: { 1: advisory() } }, { advisories: [] }, '2026-10-05');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /not allowlisted/);
});

test('fails on a critical advisory with no allowlist entry', () => {
  const { failures } = evaluateAudit(
    { advisories: { 1: advisory({ severity: 'critical' }) } },
    { advisories: [] },
    '2026-10-05'
  );
  assert.match(failures[0], /not allowlisted: critical/);
});

test('ignores moderate and low advisories', () => {
  const { failures } = evaluateAudit(
    { advisories: { 1: advisory({ severity: 'moderate' }), 2: advisory({ id: 2, severity: 'low' }) } },
    { advisories: [] },
    '2026-10-05'
  );
  assert.deepEqual(failures, []);
});

test('passes an allowlisted advisory before its revisit date', () => {
  const result = evaluateAudit({ advisories: { 1: advisory() } }, { advisories: [entry()] }, '2026-10-05');
  assert.deepEqual(result.failures, []);
  assert.equal(result.allowed.length, 1);
});

test('fails an allowlisted advisory after its revisit date', () => {
  const { failures } = evaluateAudit({ advisories: { 1: advisory() } }, { advisories: [entry()] }, '2026-12-02');
  assert.match(failures.join('\n'), /expired on 2026-12-01/);
});

test('fails when the entry names a different package', () => {
  const { failures } = evaluateAudit(
    { advisories: { 1: advisory() } },
    { advisories: [entry({ package: 'other' })] },
    '2026-10-05'
  );
  assert.match(failures.join('\n'), /names other/);
});

test('fails on an entry that no longer matches any advisory', () => {
  const { failures } = evaluateAudit({ advisories: {} }, { advisories: [entry()] }, '2026-10-05');
  assert.match(failures.join('\n'), /no longer matches/);
});

test('fails on an entry without a reason', () => {
  const { failures } = evaluateAudit(
    { advisories: { 1: advisory() } },
    { advisories: [entry({ reason: '' })] },
    '2026-10-05'
  );
  assert.match(failures.join('\n'), /missing "reason"/);
});
