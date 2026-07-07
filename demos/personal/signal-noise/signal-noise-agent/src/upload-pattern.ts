import fs from 'node:fs';
import path from 'node:path';
import { ChannelCredentials } from '@grpc/grpc-js';
import { PatternClient } from '@parallaxai/sdk-typescript';

/**
 * Upload the SignalNoiseStation pattern to the control plane.
 *
 * Usage:
 *   PARALLAX_REGISTRY=host:port npx tsx src/upload-pattern.ts
 */
async function main() {
  const registryEndpoint = process.env.PARALLAX_REGISTRY || 'localhost:50051';

  const patternPath = path.resolve(
    __dirname,
    '..',
    '..',
    'patterns',
    'signal-noise-station.prism'
  );

  const prismScript = fs.readFileSync(patternPath, 'utf-8');

  console.log(`Uploading SignalNoiseStation pattern to ${registryEndpoint}...`);

  const client = new PatternClient(
    registryEndpoint,
    ChannelCredentials.createInsecure()
  );

  const response = await client.upload(
    {
      name: 'SignalNoiseStation',
      version: '1.0.0',
      description:
        'Signal//Noise station pattern — orchestrates persona agents with frequency tuning and priority weights',
      requirements: {
        capabilities: ['conversation', 'portfolio'],
        minAgents: 2,
        maxAgents: 5,
        minConfidence: 0.3,
      },
      prismScript,
      metadata: { demo: 'signal-noise' },
    },
    true // overwrite if exists
  );

  console.log(`Upload result: ${response.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Message: ${response.message}`);
  if (response.patternId) {
    console.log(`  Pattern ID: ${response.patternId}`);
  }
}

main().catch((err) => {
  console.error('Upload failed:', err.message || err);
  process.exit(1);
});
