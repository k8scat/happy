import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execSync: vi.fn(),
  platform: vi.fn(() => 'darwin'),
  homedir: vi.fn(() => '/home/user'),
  existsSync: vi.fn(() => false),
}));

vi.mock('child_process', () => ({
  execSync: mocks.execSync,
}));

vi.mock('os', () => ({
  default: {
    platform: mocks.platform,
    homedir: mocks.homedir,
  },
}));

vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
}));

describe('detectCLIAvailability', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.platform.mockReturnValue('darwin');
    mocks.homedir.mockReturnValue('/home/user');
    mocks.existsSync.mockReturnValue(false);
    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('qwen')) {
        return '';
      }
      throw new Error('not found');
    });
  });

  it('reports Qwen availability on POSIX systems', async () => {
    const { detectCLIAvailability } = await import('./detectCLI');

    expect(detectCLIAvailability()).toEqual(expect.objectContaining({
      claude: false,
      codex: false,
      gemini: false,
      openclaw: false,
      qwen: true,
    }));
  });

  it('reports Qwen availability on Windows systems', async () => {
    mocks.platform.mockReturnValue('win32');
    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('Get-Command qwen')) {
        return '';
      }
      throw new Error('not found');
    });
    const { detectCLIAvailability } = await import('./detectCLI');

    expect(detectCLIAvailability()).toEqual(expect.objectContaining({
      qwen: true,
    }));
  });
});
