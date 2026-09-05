#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const chart = 'k8s/helm/parallax';
const values = ['--values', `${chart}/values-gcp.yaml`];
const rendered = execFileSync('helm', ['template', 'parallax', chart, ...values], { encoding: 'utf8' });
execFileSync('helm', ['lint', chart, ...values, '--strict'], { stdio: 'inherit' });
for (const key of ['JWT_SECRET', 'PARALLAX_GRPC_API_KEY', 'PARALLAX_RUNTIME_API_KEY', 'DATABASE_URL']) {
  assert.match(rendered, new RegExp(`name: ${key}\\n\\s+valueFrom:\\n\\s+secretKeyRef:`), `${key} must come from a Secret`);
}
assert.match(rendered, /name: PARALLAX_GRPC_TLS_ENABLED\n\s+value: "true"/);
assert.match(rendered, /secretName: parallax-grpc-tls/);
assert.match(rendered, /mountPath: \/run\/secrets\/grpc/);
assert.match(rendered, /secretName: parallax-http-tls/);
assert.doesNotMatch(rendered, /kind: Secret\n/);
assert.doesNotMatch(rendered, /name: parallax-control-plane-rest-lb/);

const rejectedConfigurations = [
  { args: [], error: 'controlPlane.existingSecret' },
  { args: [...values, '--set', 'controlPlane.grpcTls.existingSecret='], error: 'controlPlane.grpcTls.existingSecret' },
  { args: [...values, '--set', 'controlPlane.restLoadBalancer.enabled=true'], error: 'Direct HTTP LoadBalancer' },
  { args: [...values, '--set-json', 'ingress.tls=[]'], error: 'ingress.tls is required' },
  { args: [...values, '--set', 'controlPlane.env.PARALLAX_AUTH_MODE=development'], error: 'conflicts with managed security configuration' },
  { args: [...values, '--set', 'controlPlane.licenseKey=inline-license'], error: 'Move licenseKey' },
];
for (const { args, error } of rejectedConfigurations) {
  const result = spawnSync('helm', ['template', 'parallax', chart, ...args], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `Unsafe configuration should fail: ${args.join(' ')}`);
  assert.ok(result.stderr.includes(error), result.stderr);
}
console.log('Deployment validation passed: Secret references, TLS mounts, HTTPS ingress, and six unsafe configuration rejections.');
