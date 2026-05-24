import { describe, expect, it } from 'vitest';
import {
  extractAcpPermissionInput,
  formatAcpErrorForDisplay,
  resolveAcpPermissionToolCallId,
} from './AcpBackend';

describe('AcpBackend permission request helpers', () => {
  it('uses Qwen toolCallId when ACP permission requests omit toolCall.id', () => {
    expect(resolveAcpPermissionToolCallId({
      toolCallId: 'call_qwen_123',
    })).toBe('call_qwen_123');
  });

  it('prefers Qwen rawInput over content arrays for permission arguments', () => {
    expect(extractAcpPermissionInput({
      toolCall: {
        toolCallId: 'call_qwen_123',
        content: [],
        rawInput: {
          command: 'echo ok > /tmp/qwen-smoke.txt',
          description: 'write smoke file',
        },
      },
    })).toEqual({
      command: 'echo ok > /tmp/qwen-smoke.txt',
      description: 'write smoke file',
    });
  });
});

describe('AcpBackend error formatting', () => {
  it('formats object errors without collapsing to [object Object]', () => {
    expect(formatAcpErrorForDisplay({
      code: -32603,
      message: 'Qwen auth is not configured',
    })).toBe('Qwen auth is not configured');

    expect(formatAcpErrorForDisplay({
      code: -32000,
      data: { reason: 'missing credentials' },
    })).toContain('missing credentials');
  });
});
