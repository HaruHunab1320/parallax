import express from 'express';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '8080', 10);
const AGENT_ID = process.env.AGENT_ID || 'managed-demo-agent';

// Health endpoint — required by K8s runtime for readiness/liveness probes
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', agent: AGENT_ID, uptime: process.uptime() });
});

// Task execution endpoint — called by K8s runtime via send()
app.post('/send', async (req, res) => {
  const { message, task_id } = req.body;
  console.log(`[${AGENT_ID}] Received task ${task_id}: ${message}`);

  const startTime = Date.now();
  const result = await processTask(message);
  const duration = Date.now() - startTime;

  console.log(`[${AGENT_ID}] Completed task ${task_id} in ${duration}ms`);
  res.json({
    agent_id: AGENT_ID,
    task_id,
    result,
    confidence: result.confidence,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
  });
});

// SSE streaming endpoint — called by K8s runtime via subscribe()
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', agent: AGENT_ID })}\n\n`);
  }, 15000);

  res.write(`data: ${JSON.stringify({ type: 'connected', agent: AGENT_ID })}\n\n`);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

async function processTask(message: string): Promise<{
  value: string;
  confidence: number;
  reasoning: string;
}> {
  const lower = message.toLowerCase();

  // Text analysis capabilities
  if (lower.includes('word count') || lower.includes('analyze text')) {
    const words = message.split(/\s+/).length;
    const chars = message.length;
    const sentences = message.split(/[.!?]+/).filter(Boolean).length;
    return {
      value: JSON.stringify({ words, characters: chars, sentences }),
      confidence: 0.95,
      reasoning: 'Exact character and word counting performed on input text',
    };
  }

  // Computation capabilities
  if (lower.includes('compute') || lower.includes('calculate')) {
    const numbers = message.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
    const sum = numbers.reduce((a, b) => a + b, 0);
    const avg = numbers.length > 0 ? sum / numbers.length : 0;
    return {
      value: JSON.stringify({ numbers, sum, average: avg, count: numbers.length }),
      confidence: 0.99,
      reasoning: 'Deterministic arithmetic computation',
    };
  }

  // Default: echo with metadata
  return {
    value: JSON.stringify({
      echo: message,
      processed_by: AGENT_ID,
      environment: 'kubernetes',
    }),
    confidence: 0.8,
    reasoning: 'Default echo response — no specific capability matched',
  };
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${AGENT_ID}] Demo agent listening on port ${PORT}`);
});
