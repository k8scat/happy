import { describe, expect, it } from 'vitest';
import {
    agentKeys,
    getCodeAgentDefaults,
    normalizeAgentKey,
    resolveAgentDefaultConfig,
    setAgentDefaultOverride,
} from './agentDefaults';

describe('agentDefaults', () => {
    it('includes Qwen as a first-class agent key', () => {
        expect(agentKeys).toContain('qwen');
        expect(normalizeAgentKey('qwen')).toBe('qwen');
    });

    it('uses conservative Qwen defaults', () => {
        expect(getCodeAgentDefaults('qwen')).toEqual({
            permissionMode: 'default',
            modelMode: 'default',
            effortLevel: null,
        });
    });

    it('stores and resolves Qwen default overrides', () => {
        const overrides = setAgentDefaultOverride(undefined, 'qwen', 'permissionMode', 'yolo');

        expect(resolveAgentDefaultConfig(overrides, 'qwen')).toEqual({
            permissionMode: 'yolo',
            modelMode: 'default',
            effortLevel: null,
        });
    });
});
