export interface ServerEvent { event: string; data: string }

/** Incrementally parse SSE, including CRLF and UTF-8 split across transport chunks. */
export async function consumeServerEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ServerEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let size = 0;
  const line = (value: string) => {
    if (!value) {
      if (data.length) onEvent({ event: event || 'message', data: data.join('\n') });
      event = ''; data = []; size = 0;
      return;
    }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = content;
    if (field === 'data') data.push(content);
    size += value.length;
    if (size > 1024 * 1024) throw new Error('SSE event exceeds size limit');
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.endsWith('\r')) line(buffer.slice(0, -1));
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let offset = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char !== '\r' && char !== '\n') continue;
        if (char === '\r' && i === buffer.length - 1) break;
        line(buffer.slice(offset, i));
        if (char === '\r' && buffer[i + 1] === '\n') i++;
        offset = i + 1;
      }
      buffer = buffer.slice(offset);
      if (buffer.length > 1024 * 1024) throw new Error('SSE line exceeds size limit');
    }
    // SSE dispatches only complete events; discard incomplete data on disconnect.
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
