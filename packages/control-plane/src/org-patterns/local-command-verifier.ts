import { spawn } from 'node:child_process';

/** Trusted Unix development helper. Stop the whole shell process group on cancellation. */
export function runLocalCommand(
  command: string,
  cwd: string | undefined,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      detached: true,
      cwd,
      env: {
        PATH: process.env.PATH,
        LANG: process.env.LANG,
        TMPDIR: process.env.TMPDIR,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    const terminate = (error: Error) => {
      failure = error;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const abort = () =>
      terminate(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error('Workflow cancelled')
      );
    const timer = setTimeout(
      () =>
        terminate(
          new Error(`Command verification timed out after ${timeoutMs}ms`)
        ),
      timeoutMs
    );
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const collect = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      if (stream === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
      if (
        Buffer.byteLength(stdout) + Buffer.byteLength(stderr) >
        10 * 1024 * 1024
      )
        terminate(new Error('Verification output exceeded 10 MiB'));
    };
    child.stdout.on('data', (chunk: Buffer) => collect(chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => collect(chunk, 'stderr'));
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code === null)
        reject(new Error('Command verifier terminated without an exit code'));
      else resolve({ exitCode: code, stdout, stderr });
    });
  });
}
