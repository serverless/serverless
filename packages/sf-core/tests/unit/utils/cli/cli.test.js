import {
  jest,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
} from '@jest/globals'

// Mock @serverless/util before importing the module
jest.unstable_mockModule('@serverless/util', () => ({
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options = {}) {
      super(message)
      this.code = code
      this.options = options
    }
  },
  log: {
    get: jest.fn(() => ({
      logo: jest.fn(),
      debug: jest.fn(),
    })),
  },
  progress: {
    get: jest.fn(() => ({
      remove: jest.fn(),
    })),
  },
  writeText: jest.fn(),
}))

const { extractCommandsAndOptions, commandExist, validateCliSchema } =
  await import('../../../../src/utils/cli/cli.js')

// Mock process.exit to prevent yargs from exiting
const originalExit = process.exit
beforeEach(() => {
  process.exit = jest.fn()
})
afterEach(() => {
  process.exit = originalExit
})

describe('CLI Utils', () => {
  describe('extractCommandsAndOptions', () => {
    it('should extract command and options from argv', () => {
      const argv = {
        _: ['deploy'],
        $0: 'serverless',
        stage: 'dev',
        region: 'us-east-1',
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.command).toEqual(['deploy'])
      expect(result.options.stage).toBe('dev')
      expect(result.options.region).toBe('us-east-1')
    })

    it('should remove _ and $0 from options', () => {
      const argv = {
        _: ['package'],
        $0: 'serverless',
        verbose: true,
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.options._).toBeUndefined()
      expect(result.options.$0).toBeUndefined()
      expect(result.options.verbose).toBe(true)
    })

    it('should convert debug: true to debug: "*"', () => {
      const argv = {
        _: ['deploy'],
        $0: 'serverless',
        debug: true,
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.options.debug).toBe('*')
    })

    it('should not modify debug when it is already a string', () => {
      const argv = {
        _: ['deploy'],
        $0: 'serverless',
        debug: 'some:namespace',
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.options.debug).toBe('some:namespace')
    })

    it('should normalize env option to array for invoke local command', () => {
      const argv = {
        _: ['invoke', 'local'],
        $0: 'serverless',
        env: 'FOO=bar',
      }

      const result = extractCommandsAndOptions(argv)

      expect(Array.isArray(result.options.env)).toBe(true)
      expect(result.options.env).toEqual(['FOO=bar'])
    })

    it('should normalize e option to array for invoke local command', () => {
      const argv = {
        _: ['invoke', 'local'],
        $0: 'serverless',
        e: 'BAZ=qux',
      }

      const result = extractCommandsAndOptions(argv)

      expect(Array.isArray(result.options.e)).toBe(true)
      expect(result.options.e).toEqual(['BAZ=qux'])
    })

    it('should not normalize env option for other commands', () => {
      const argv = {
        _: ['deploy'],
        $0: 'serverless',
        env: 'FOO=bar',
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.options.env).toBe('FOO=bar')
    })

    it('should keep env as array if already an array', () => {
      const argv = {
        _: ['invoke', 'local'],
        $0: 'serverless',
        env: ['FOO=bar', 'BAZ=qux'],
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.options.env).toEqual(['FOO=bar', 'BAZ=qux'])
    })

    it('should handle empty command', () => {
      const argv = {
        _: [],
        $0: 'serverless',
        help: true,
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.command).toEqual([])
      expect(result.options.help).toBe(true)
    })

    it('should handle nested commands', () => {
      const argv = {
        _: ['plugin', 'install'],
        $0: 'serverless',
        name: 'serverless-offline',
      }

      const result = extractCommandsAndOptions(argv)

      expect(result.command).toEqual(['plugin', 'install'])
      expect(result.options.name).toBe('serverless-offline')
    })
  })

  describe('commandExist', () => {
    const sampleSchema = [
      { command: 'deploy', description: 'Deploy service' },
      { command: 'package', description: 'Package service' },
      {
        command: 'plugin',
        description: 'Plugin commands',
        builder: [
          { command: 'install', description: 'Install plugin' },
          { command: 'uninstall', description: 'Uninstall plugin' },
        ],
      },
      {
        command: 'invoke',
        description: 'Invoke commands',
        builder: [
          { command: 'local', description: 'Invoke locally' },
          {
            command: 'remote',
            description: 'Invoke remote',
            builder: [{ command: 'async', description: 'Async invoke' }],
          },
        ],
      },
    ]

    it('should return true for existing top-level command', () => {
      expect(commandExist({ command: ['deploy'], schema: sampleSchema })).toBe(
        true,
      )
      expect(commandExist({ command: ['package'], schema: sampleSchema })).toBe(
        true,
      )
    })

    it('should return true for existing nested command', () => {
      expect(
        commandExist({ command: ['plugin', 'install'], schema: sampleSchema }),
      ).toBe(true)
      expect(
        commandExist({
          command: ['plugin', 'uninstall'],
          schema: sampleSchema,
        }),
      ).toBe(true)
      expect(
        commandExist({ command: ['invoke', 'local'], schema: sampleSchema }),
      ).toBe(true)
    })

    it('should return true for deeply nested command', () => {
      expect(
        commandExist({
          command: ['invoke', 'remote', 'async'],
          schema: sampleSchema,
        }),
      ).toBe(true)
    })

    it('should return false for non-existent command', () => {
      expect(
        commandExist({ command: ['nonexistent'], schema: sampleSchema }),
      ).toBe(false)
      expect(
        commandExist({
          command: ['plugin', 'nonexistent'],
          schema: sampleSchema,
        }),
      ).toBe(false)
    })

    it('should return false for partial nested command', () => {
      // 'plugin' alone is not a valid command in this schema structure
      expect(commandExist({ command: ['plugin'], schema: sampleSchema })).toBe(
        true,
      ) // plugin is a valid top-level command
      expect(commandExist({ command: ['invoke'], schema: sampleSchema })).toBe(
        true,
      ) // invoke is a valid top-level command
    })

    it('should return false for empty command', () => {
      expect(commandExist({ command: [], schema: sampleSchema })).toBe(false)
    })

    it('should handle empty schema', () => {
      expect(commandExist({ command: ['deploy'], schema: [] })).toBe(false)
    })

    it('should handle schema without builder', () => {
      const simpleSchema = [
        { command: 'deploy', description: 'Deploy' },
        { command: 'remove', description: 'Remove' },
      ]
      expect(commandExist({ command: ['deploy'], schema: simpleSchema })).toBe(
        true,
      )
      expect(
        commandExist({ command: ['deploy', 'stage'], schema: simpleSchema }),
      ).toBe(false)
    })
  })

  describe('validateCliSchema', () => {
    const mockVersions = {
      serverless_framework: '4.0.0',
    }

    const sampleSchema = [
      { command: 'deploy', description: 'Deploy service' },
      {
        options: {
          stage: {
            type: 'string',
            description: 'Stage',
          },
        },
      },
    ]

    it('should return helpPrinted: true for help command', async () => {
      const result = await validateCliSchema({
        schema: sampleSchema,
        command: ['help'],
        options: {},
        versions: mockVersions,
      })

      expect(result.helpPrinted).toBe(true)
    })

    it('should return helpPrinted: true for --help option', async () => {
      const result = await validateCliSchema({
        schema: sampleSchema,
        command: [],
        options: { help: true },
        versions: mockVersions,
      })

      expect(result.helpPrinted).toBe(true)
    })

    it('should return versionPrinted: true for version command', async () => {
      const result = await validateCliSchema({
        schema: sampleSchema,
        command: ['version'],
        options: {},
        versions: mockVersions,
      })

      expect(result.versionPrinted).toBe(true)
    })

    it('should return versionPrinted: true for --version option with empty command', async () => {
      const result = await validateCliSchema({
        schema: sampleSchema,
        command: [],
        options: { version: true },
        versions: mockVersions,
      })

      expect(result.versionPrinted).toBe(true)
    })

    it('should return versionPrinted: true for -v option with empty command', async () => {
      const result = await validateCliSchema({
        schema: sampleSchema,
        command: [],
        options: { v: true },
        versions: mockVersions,
      })

      expect(result.versionPrinted).toBe(true)
    })

    it('should parse and return command and options for valid input', async () => {
      const result = await validateCliSchema({
        schema: sampleSchema,
        command: ['deploy'],
        options: { stage: 'dev' },
        versions: mockVersions,
      })

      expect(result.helpPrinted).toBeUndefined()
      expect(result.versionPrinted).toBeUndefined()
      expect(result.argv).toBeDefined()
    })
  })
})
