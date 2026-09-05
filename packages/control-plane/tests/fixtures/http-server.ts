// Run the real server through the supported TSX loader, outside Vite's module
// transform. Process isolation also owns all listeners, intervals, and tracing.
import { createServer } from '../../src/server';

async function main() {
  const app = await createServer();
  const services = await (
    app as typeof app & {
      start(): Promise<{ httpServer: import('node:http').Server }>;
    }
  ).start();
  const server = services.httpServer;
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP listener');
  process.send?.({ type: 'ready', url: `http://127.0.0.1:${address.port}` });
}
main().catch(() => {
  process.send?.({ type: 'startup-error' });
  process.exit(1);
});
