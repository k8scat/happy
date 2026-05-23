import { describe, expect, it } from 'vitest';
import { MachineMetadataSchema, MetadataSchema } from './storageTypes';

describe('MetadataSchema', () => {
    it('preserves archive lifecycle metadata', () => {
        const metadata = MetadataSchema.parse({
            path: '/tmp/project',
            host: 'local-machine',
            startedBy: 'daemon',
            startedFromDaemon: true,
            lifecycleState: 'archived',
            lifecycleStateSince: 123,
            archivedBy: 'cli',
            archiveReason: 'User terminated',
        });

        expect(metadata.startedBy).toBe('daemon');
        expect(metadata.startedFromDaemon).toBe(true);
        expect(metadata.lifecycleState).toBe('archived');
        expect(metadata.lifecycleStateSince).toBe(123);
        expect(metadata.archivedBy).toBe('cli');
        expect(metadata.archiveReason).toBe('User terminated');
    });
});

describe('MachineMetadataSchema', () => {
    it('accepts Qwen CLI availability while keeping the field optional for older machines', () => {
        const withQwen = MachineMetadataSchema.parse({
            host: 'local-machine',
            platform: 'darwin',
            happyCliVersion: 'test',
            happyHomeDir: '/home/user/.happy',
            homeDir: '/home/user',
            cliAvailability: {
                claude: false,
                codex: false,
                gemini: false,
                openclaw: false,
                qwen: true,
                detectedAt: 123,
            },
        });

        expect(withQwen.cliAvailability?.qwen).toBe(true);

        const oldMachine = MachineMetadataSchema.parse({
            host: 'local-machine',
            platform: 'darwin',
            happyCliVersion: 'test',
            happyHomeDir: '/home/user/.happy',
            homeDir: '/home/user',
            cliAvailability: {
                claude: false,
                codex: false,
                gemini: false,
                openclaw: false,
                detectedAt: 123,
            },
        });

        expect(oldMachine.cliAvailability?.qwen).toBeUndefined();
    });
});
