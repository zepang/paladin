import { describe, expect, it } from 'vitest';

describe('CopilotKit interrupt dependency probe', () => {
  it('exports useInterrupt from the v2 package', async () => {
    const mod = await import('@copilotkit/react-core/v2');
    expect(typeof mod.useInterrupt).toBe('function');
  });
});
