'use strict'

import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals'
import EventEmitter from 'events'

const mockSpawn = jest.fn()
const mockExecP = jest.fn()

jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
  exec: (cmd, cb) => {
    mockExecP(cmd)
      .then((result) => cb(null, result))
      .catch((err) => cb(err))
  },
}))

jest.unstable_mockModule('fs', () => ({
  default: { existsSync: jest.fn(() => false) },
  existsSync: jest.fn(() => false),
}))

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    get: () => ({
      debug: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
      aside: jest.fn(),
    }),
  },
}))

const { AgentCoreCodeMode } =
  await import('../../../../../../../lib/plugins/aws/bedrock-agentcore/dev/code-mode.js')

const createMockProcess = () => {
  const proc = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = jest.fn()
  proc.exitCode = null
  return proc
}

describe('AgentCoreCodeMode', () => {
  const defaultOpts = {
    projectPath: '/home/user/my-agent',
    agentName: 'assistant',
    agentConfig: {
      handler: 'agents/main.py',
      runtime: 'python3.13',
    },
    region: 'us-east-1',
    port: 8080,
  }

  const mockCredentials = {
    AccessKeyId: 'AKID',
    SecretAccessKey: 'SECRET',
    SessionToken: 'TOKEN',
  }

  let mockProc

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockProc = createMockProcess()
    mockSpawn.mockReturnValue(mockProc)
    mockExecP.mockResolvedValue({ stdout: 'Python 3.13.1' })
    delete process.env.VIRTUAL_ENV
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('constructor', () => {
    test('creates instance with valid configuration', () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      expect(mode).toBeDefined()
      expect(mode.getProcess()).toBeNull()
    })
  })

  describe('start()', () => {
    test('spawns Python process with correct command for python3.13 runtime', async () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      await mode.start(mockCredentials)

      expect(mockSpawn).toHaveBeenCalledWith(
        'python3.13',
        [expect.stringContaining('agents/main.py')],
        expect.objectContaining({
          cwd: '/home/user/my-agent',
          env: expect.objectContaining({
            PORT: '8080',
            AWS_ACCESS_KEY_ID: 'AKID',
            AWS_SECRET_ACCESS_KEY: 'SECRET',
            AWS_SESSION_TOKEN: 'TOKEN',
            AWS_REGION: 'us-east-1',
            AWS_DEFAULT_REGION: 'us-east-1',
            AGENTCORE_DEV_MODE: 'true',
            PYTHONUNBUFFERED: '1',
          }),
        }),
      )
    })

    test('defaults to python3.13 when no runtime specified', async () => {
      const mode = new AgentCoreCodeMode({
        ...defaultOpts,
        agentConfig: { handler: 'agents/main.py' },
      })
      await mode.start(mockCredentials)

      expect(mockSpawn).toHaveBeenCalledWith(
        'python3.13',
        expect.any(Array),
        expect.any(Object),
      )
    })

    test('normalizes PYTHON_3_12 format runtime correctly', async () => {
      const mode = new AgentCoreCodeMode({
        ...defaultOpts,
        agentConfig: { handler: 'agents/main.py', runtime: 'PYTHON_3_12' },
      })
      await mode.start(mockCredentials)

      expect(mockSpawn).toHaveBeenCalledWith(
        'python3.12',
        expect.any(Array),
        expect.any(Object),
      )
    })

    test('handles python3.12 format runtime (user-facing)', async () => {
      const mode = new AgentCoreCodeMode({
        ...defaultOpts,
        agentConfig: { handler: 'agents/main.py', runtime: 'python3.12' },
      })
      await mode.start(mockCredentials)

      expect(mockSpawn).toHaveBeenCalledWith(
        'python3.12',
        expect.any(Array),
        expect.any(Object),
      )
    })

    test('injects user-defined environment variables', async () => {
      const mode = new AgentCoreCodeMode({
        ...defaultOpts,
        agentConfig: {
          handler: 'agents/main.py',
          runtime: 'python3.13',
          environment: { MY_VAR: 'test-value', API_KEY: 'abc123' },
        },
      })
      await mode.start(mockCredentials)

      const envArg = mockSpawn.mock.calls[0][2].env
      expect(envArg.MY_VAR).toBe('test-value')
      expect(envArg.API_KEY).toBe('abc123')
    })

    test('returns the spawned process', async () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      const result = await mode.start(mockCredentials)
      expect(result).toBe(mockProc)
    })

    test('getProcess() returns the running process after start', async () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      await mode.start(mockCredentials)
      expect(mode.getProcess()).toBe(mockProc)
    })
  })

  describe('stop()', () => {
    test('sends SIGTERM to running process', async () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      await mode.start(mockCredentials)

      const stopPromise = mode.stop()
      mockProc.emit('exit', 0)
      jest.advanceTimersByTime(3000)
      await stopPromise

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
    })

    test('no-ops when no process is running', async () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      await mode.stop()
    })

    test('sets process to null after stop', async () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      await mode.start(mockCredentials)

      const stopPromise = mode.stop()
      mockProc.emit('exit', 0)
      jest.advanceTimersByTime(3000)
      await stopPromise

      expect(mode.getProcess()).toBeNull()
    })

    test('force kills process if SIGTERM does not cause exit', async () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      await mode.start(mockCredentials)

      const stopPromise = mode.stop()
      jest.advanceTimersByTime(3000)
      await stopPromise

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL')
    })
  })

  describe('getWatchPath()', () => {
    test('returns the project path', () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      expect(mode.getWatchPath()).toBe('/home/user/my-agent')
    })
  })

  describe('getWatchPatterns()', () => {
    test('includes .py files', () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      const patterns = mode.getWatchPatterns()
      expect(patterns.include).toEqual(['**/*.py'])
    })

    test('excludes common non-source directories', () => {
      const mode = new AgentCoreCodeMode(defaultOpts)
      const patterns = mode.getWatchPatterns()
      expect(patterns.exclude).toContain('**/venv/**')
      expect(patterns.exclude).toContain('**/.venv/**')
      expect(patterns.exclude).toContain('**/__pycache__/**')
      expect(patterns.exclude).toContain('**/node_modules/**')
      expect(patterns.exclude).toContain('**/.git/**')
    })
  })

  describe('version checking', () => {
    test('does not throw when Python version matches', async () => {
      mockExecP.mockResolvedValue({ stdout: 'Python 3.13.1' })
      const mode = new AgentCoreCodeMode(defaultOpts)
      await expect(mode.start(mockCredentials)).resolves.toBeDefined()
    })

    test('does not throw when version check fails', async () => {
      mockExecP.mockRejectedValue(new Error('command not found'))
      const mode = new AgentCoreCodeMode(defaultOpts)
      await expect(mode.start(mockCredentials)).resolves.toBeDefined()
    })
  })
})
