import path from 'node:path';
import { PersonaAgent } from './persona-agent';
import { loadPersona } from './persona-loader';

async function main() {
  const personaId = process.env.AGENT_PERSONA;
  if (!personaId) {
    console.error(
      'AGENT_PERSONA env var required (vero, silas, sable, or echo)'
    );
    process.exit(1);
  }

  const personaDir = path.resolve(__dirname, '..', '..', 'agents', personaId);
  const persona = loadPersona(personaDir);

  console.log(`Loading persona: ${persona.name} (${persona.role})`);
  console.log(`  Channel: ${persona.channel}`);
  console.log(`  Knowledge docs: ${persona.knowledge.length}`);

  const agent = new PersonaAgent(persona);

  // Start tamagotchi display
  agent.display.start();
  agent.display.addTextLine('* booting...');
  agent.display.addTextLine(`* ${persona.name}`);

  // Heartbeat indicator on lease renewal interval
  let leaseCount = 0;
  const heartbeat = setInterval(() => {
    leaseCount++;
    agent.display.updateLastMatchingLine(
      '\x03 lease',
      `\x03 lease x${leaseCount}`
    );
  }, 30_000);

  const gatewayEndpoint = process.env.PARALLAX_GATEWAY;
  const registryEndpoint = process.env.PARALLAX_REGISTRY;

  if (gatewayEndpoint) {
    // Gateway mode: outbound connection to remote control plane (no public endpoint needed)
    console.log(
      `Starting Signal//Noise Agent: ${persona.name} (gateway mode)...`
    );
    console.log(`  Gateway: ${gatewayEndpoint}`);

    await agent.connectViaGateway(gatewayEndpoint);
    console.log(`${persona.name} agent connected via gateway`);
    agent.display.addTextLine('* ready (gw)');
  } else {
    // Local mode: start gRPC server and register with registry
    const port = parseInt(process.env.AGENT_PORT || '0', 10);
    console.log(`Starting Signal//Noise Agent: ${persona.name}...`);
    console.log(`  Registry: ${registryEndpoint || 'localhost:50051'}`);
    console.log(
      `  Host:     ${process.env.PARALLAX_AGENT_HOST || '127.0.0.1'}`
    );

    const actualPort = await agent.serve(port, { registryEndpoint });
    console.log(`${persona.name} agent serving on port ${actualPort}`);
    agent.display.addTextLine('* ready');
  }

  const shutdown = async () => {
    console.log(`Shutting down ${persona.name} agent...`);
    clearInterval(heartbeat);
    agent.display.stop();
    await agent.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
