import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';
import { CircuitState, CircuitOpenError } from './types';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      successThreshold: 2,
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have zero metrics initially', () => {
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.totalExecutions).toBe(0);
    });
  });

  describe('successful executions', () => {
    it('should execute function and return result', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should track successful executions', async () => {
      await breaker.execute(async () => 'success');
      const metrics = breaker.getMetrics();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.totalSuccesses).toBe(1);
    });

    it('should emit success event', async () => {
      const handler = vi.fn();
      breaker.on('success', handler);

      await breaker.execute(async () => 'success');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ duration: expect.any(Number) })
      );
    });
  });

  describe('failed executions', () => {
    it('should propagate errors', async () => {
      const error = new Error('test error');
      await expect(
        breaker.execute(async () => {
          throw error;
        })
      ).rejects.toThrow('test error');
    });

    it('should track failed executions', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      const metrics = breaker.getMetrics();
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.failureCount).toBe(1);
    });

    it('should emit failure event', async () => {
      const handler = vi.fn();
      breaker.on('failure', handler);

      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          duration: expect.any(Number),
        })
      );
    });
  });

  describe('state transitions', () => {
    it('should open after failure threshold', async () => {
      const failingFn = async () => {
        throw new Error('fail');
      };

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should emit state-change event when opening', async () => {
      const handler = vi.fn();
      breaker.on('state-change', handler);

      // Fail enough times to open
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(handler).toHaveBeenCalledWith({
        from: CircuitState.CLOSED,
        to: CircuitState.OPEN,
      });
    });

    it('should reject requests when open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      // Next request should be rejected
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('should transition to half-open after reset timeout', async () => {
      vi.useFakeTimers();

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      vi.advanceTimersByTime(1001);

      // Next execution should transition to half-open
      await breaker.execute(async () => 'success');

      // State change happens before execution
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      vi.useRealTimers();
    });

    it('should close after success threshold in half-open', async () => {
      vi.useFakeTimers();

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      // Advance time past reset timeout
      vi.advanceTimersByTime(1001);

      // Execute successfully (successThreshold = 2)
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      vi.useRealTimers();
    });

    it('should reopen if failure occurs in half-open', async () => {
      vi.useFakeTimers();

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      // Advance time past reset timeout
      vi.advanceTimersByTime(1001);

      // First success
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Then fail
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      vi.useRealTimers();
    });
  });

  describe('manual controls', () => {
    it('should manually reset to closed', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getMetrics().failureCount).toBe(0);
    });

    it('should manually open the circuit', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.open();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('custom isFailure', () => {
    it('should respect custom isFailure function', async () => {
      const customBreaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 1000,
        isFailure: (error) => {
          // Only count 5xx errors as failures
          return error instanceof Error && error.message.includes('500');
        },
      });

      // This should NOT count as a failure
      try {
        await customBreaker.execute(async () => {
          throw new Error('404 Not Found');
        });
      } catch {
        // expected
      }

      expect(customBreaker.getMetrics().failureCount).toBe(0);

      // This SHOULD count as a failure
      try {
        await customBreaker.execute(async () => {
          throw new Error('500 Internal Server Error');
        });
      } catch {
        // expected
      }

      expect(customBreaker.getMetrics().failureCount).toBe(1);
    });
  });

  describe('onStateChange callback', () => {
    it('should call onStateChange callback', async () => {
      const callback = vi.fn();
      const breakerWithCallback = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 1000,
        onStateChange: callback,
      });

      try {
        await breakerWithCallback.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(callback).toHaveBeenCalledWith(
        CircuitState.OPEN,
        CircuitState.CLOSED
      );
    });
  });

  describe('CircuitOpenError', () => {
    it('should include state and nextAttemptTime', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      try {
        await breaker.execute(async () => 'success');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const circuitError = error as CircuitOpenError;
        expect(circuitError.state).toBe(CircuitState.OPEN);
        expect(circuitError.nextAttemptTime).toBeInstanceOf(Date);
      }
    });
  });

  describe('isAllowingRequests', () => {
    it('should return true when closed', () => {
      expect(breaker.isAllowingRequests()).toBe(true);
    });

    it('should return false when open and reset time not reached', () => {
      breaker.open();
      expect(breaker.isAllowingRequests()).toBe(false);
    });

    it('should return true when open but reset time reached', () => {
      vi.useFakeTimers();

      breaker.open();
      expect(breaker.isAllowingRequests()).toBe(false);

      vi.advanceTimersByTime(1001);
      expect(breaker.isAllowingRequests()).toBe(true);

      vi.useRealTimers();
    });
  });
});
