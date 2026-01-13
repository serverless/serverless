import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import Prune from '../../../../../lib/plugins/prune/index.js'

describe('Prune', () => {
  let serverless
  let options
  let plugin
  let providerRequest

  const createMockServerless = (functions = [], serviceCustom = {}) => {
    providerRequest = jest.fn()
    const serverlessMock = {
      getProvider: jest.fn().mockReturnValue({
        request: providerRequest,
      }),
      cli: { log: jest.fn() },
      service: {
        getAllFunctions: jest.fn().mockReturnValue(functions),
        getFunction: jest.fn().mockImplementation((key) => ({
          name: `service-${key}`,
        })),
        getAllLayers: jest.fn().mockReturnValue([]),
        getLayer: jest.fn(),
        custom: serviceCustom,
      },
      configSchemaHandler: {
        defineCustomProperties: jest.fn(),
      },
    }
    return serverlessMock
  }

  const createMockServerlessWithLayers = (layers = [], serviceCustom = {}) => {
    const serverlessMock = createMockServerless([], serviceCustom)
    serverlessMock.service.getAllLayers = jest.fn().mockReturnValue(layers)
    serverlessMock.service.getLayer = jest.fn().mockImplementation((key) => ({
      name: `layer-${key}`,
    }))
    return serverlessMock
  }

  const createAliasResponse = (versions) => ({
    Aliases: [...versions, '$LATEST'].map((v) => ({
      FunctionVersion: `${v}`,
      Description: `Alias v${v}`,
    })),
  })

  const createVersionsResponse = (versions) => ({
    Versions: versions.map((v) => ({
      Version: `${v}`,
      Description: `Version v${v}`,
    })),
  })

  const createLayerVersionsResponse = (versions) => ({
    LayerVersions: versions.map((v) => ({
      Version: `${v}`,
    })),
  })

  describe('constructor', () => {
    it('should assign correct properties and define schema', () => {
      serverless = createMockServerless()
      options = { stage: 'dev', region: 'us-east-1' }
      plugin = new Prune(serverless, options)

      expect(plugin.serverless).toBe(serverless)
      expect(plugin.options).toBe(options)
      expect(serverless.getProvider).toHaveBeenCalledWith('aws')
      expect(
        serverless.configSchemaHandler.defineCustomProperties,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            prune: expect.objectContaining({
              type: 'object',
            }),
          }),
        }),
      )
    })

    it('should load custom options from serverless.yml', () => {
      serverless = createMockServerless([], {
        prune: { automatic: true, number: 5, includeLayers: true },
      })
      plugin = new Prune(serverless, {})

      expect(plugin.pluginCustom.number).toBe(5)
      expect(plugin.pluginCustom.automatic).toBe(true)
      expect(plugin.pluginCustom.includeLayers).toBe(true)
      expect(plugin.getNumber()).toBe(5)
    })

    it('should set up commands and hooks', () => {
      serverless = createMockServerless()
      plugin = new Prune(serverless, {})

      expect(plugin.commands.prune).toBeDefined()
      expect(plugin.commands.prune.lifecycleEvents).toContain('prune')
      expect(plugin.hooks['prune:prune']).toBeDefined()
      expect(plugin.hooks['after:deploy:deploy']).toBeDefined()
    })

    it('should prioritize CLI number over serverless.yml', () => {
      serverless = createMockServerless([], { prune: { number: 5 } })
      plugin = new Prune(serverless, { number: 7 })

      expect(plugin.getNumber()).toBe(7)
    })
  })

  describe('deleteVersionsForFunction', () => {
    beforeEach(() => {
      serverless = createMockServerless()
      plugin = new Prune(serverless, {})
    })

    it('should delete specified function versions', async () => {
      await plugin.deleteVersionsForFunction('MyFunc', ['1', '2'])

      expect(providerRequest).toHaveBeenCalledTimes(2)
      expect(providerRequest).toHaveBeenCalledWith('Lambda', 'deleteFunction', {
        FunctionName: 'MyFunc',
        Qualifier: '1',
      })
      expect(providerRequest).toHaveBeenCalledWith('Lambda', 'deleteFunction', {
        FunctionName: 'MyFunc',
        Qualifier: '2',
      })
    })

    it('should ignore Lambda@Edge replication errors', async () => {
      providerRequest.mockRejectedValue({
        providerError: {
          statusCode: 400,
          message:
            'Lambda was unable to delete ... because it is a replicated function.',
        },
      })

      await expect(
        plugin.deleteVersionsForFunction('MyEdgeFunc', ['1']),
      ).resolves.not.toThrow()
    })

    it('should throw other errors', async () => {
      providerRequest.mockRejectedValue(new Error('Unexpected error'))
      await expect(
        plugin.deleteVersionsForFunction('MyFunc', ['1']),
      ).rejects.toThrow('Unexpected error')
    })

    it('should not request deletions if provided versions array is empty', async () => {
      await plugin.deleteVersionsForFunction('MyFunction', [])
      expect(providerRequest).not.toHaveBeenCalled()
    })
  })

  describe('pruneFunctions', () => {
    it('should delete old versions of functions', async () => {
      serverless = createMockServerless(['FuncA', 'FuncB'])
      plugin = new Prune(serverless, { number: 2 })

      providerRequest
        .mockResolvedValueOnce(createVersionsResponse([1, 2, 3, 4, 5])) // FuncA
        .mockResolvedValueOnce(createAliasResponse([])) // FuncA aliases
        .mockResolvedValueOnce(createVersionsResponse([1, 2, 3])) // FuncB
        .mockResolvedValueOnce(createAliasResponse([])) // FuncB aliases

      await plugin.pruneFunctions()

      // FuncA: keep 5, 4. delete 3, 2, 1
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({
          FunctionName: 'service-FuncA',
          Qualifier: '1',
        }),
      )
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({
          FunctionName: 'service-FuncA',
          Qualifier: '2',
        }),
      )
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({
          FunctionName: 'service-FuncA',
          Qualifier: '3',
        }),
      )
      // FuncB: keep 3, 2. delete 1
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({
          FunctionName: 'service-FuncB',
          Qualifier: '1',
        }),
      )
    })

    it('should keep requested number of version', async () => {
      serverless = createMockServerless(['FuncA'], { prune: { number: 5 } })
      plugin = new Prune(serverless, { number: 3 })

      providerRequest
        .mockResolvedValueOnce(createVersionsResponse([1, 2, 3, 4]))
        .mockResolvedValueOnce(createAliasResponse([]))

      await plugin.pruneFunctions()

      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '1' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '2' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '3' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '4' }),
      )
    })

    it('should not delete $LATEST version', async () => {
      serverless = createMockServerless(['FuncA'])
      plugin = new Prune(serverless, { number: 1 })

      providerRequest
        .mockResolvedValueOnce(createVersionsResponse([1, 2]))
        .mockResolvedValueOnce(createAliasResponse([]))

      await plugin.pruneFunctions()
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '$LATEST' }),
      )
    })

    it('should not delete aliased versions', async () => {
      serverless = createMockServerless(['FuncA'])
      plugin = new Prune(serverless, { number: 1 })

      providerRequest
        .mockResolvedValueOnce(createVersionsResponse([1, 2, 3]))
        .mockResolvedValueOnce(createAliasResponse([1]))

      await plugin.pruneFunctions()

      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '2' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '1' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ Qualifier: '3' }),
      )
    })

    it('should always match delete requests to correct function', async () => {
      serverless = createMockServerless(['FuncA', 'FuncB'])
      plugin = new Prune(serverless, { number: 2 })

      providerRequest.mockImplementation((service, action, params) => {
        if (action === 'listVersionsByFunction') {
          if (params.FunctionName === 'service-FuncA')
            return createVersionsResponse([1])
          if (params.FunctionName === 'service-FuncB')
            return createVersionsResponse([1, 2, 3])
        }
        if (action === 'listAliases') return createAliasResponse([])
        return Promise.resolve({})
      })

      await plugin.pruneFunctions()

      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ FunctionName: 'service-FuncA' }),
      )
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({
          FunctionName: 'service-FuncB',
          Qualifier: '1',
        }),
      )
    })

    it('should ignore functions that are not deployed', async () => {
      serverless = createMockServerless(['FuncA', 'FuncB'])
      plugin = new Prune(serverless, { number: 1 })

      providerRequest.mockImplementation((service, action, params) => {
        if (params.FunctionName === 'service-FuncA') {
          return Promise.reject({ providerError: { statusCode: 404 } })
        }
        if (action === 'listVersionsByFunction')
          return createVersionsResponse([1, 2])
        if (action === 'listAliases') return createAliasResponse([])
        return Promise.resolve({})
      })

      await plugin.pruneFunctions()

      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ FunctionName: 'service-FuncA' }),
      )
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({
          FunctionName: 'service-FuncB',
          Qualifier: '1',
        }),
      )
    })

    it('should only operate on target function if specified from CLI', async () => {
      serverless = createMockServerless(['FuncA', 'FuncB'])
      plugin = new Prune(serverless, { function: 'FuncA', number: 1 })

      providerRequest
        .mockResolvedValueOnce(createVersionsResponse([1, 2]))
        .mockResolvedValueOnce(createAliasResponse([]))

      await plugin.pruneFunctions()

      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ FunctionName: 'service-FuncA' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteFunction',
        expect.objectContaining({ FunctionName: 'service-FuncB' }),
      )
    })

    it('should respect dryRun flag', async () => {
      serverless = createMockServerless(['FuncA'])
      plugin = new Prune(serverless, { number: 1, dryRun: true })
      const deleteSpy = jest.spyOn(plugin, 'deleteVersionsForFunction')

      providerRequest
        .mockResolvedValueOnce(createVersionsResponse([1, 2]))
        .mockResolvedValueOnce(createAliasResponse([]))

      await plugin.pruneFunctions()
      expect(deleteSpy).not.toHaveBeenCalled()
    })
  })

  describe('pruneLayers', () => {
    it('should delete old versions of layers', async () => {
      serverless = createMockServerlessWithLayers(['LayerA', 'LayerB'])
      plugin = new Prune(serverless, { number: 2, includeLayers: true })

      providerRequest
        .mockResolvedValueOnce(createLayerVersionsResponse([1, 2, 3, 4, 5]))
        .mockResolvedValueOnce(createLayerVersionsResponse([1, 2, 3]))

      await plugin.pruneLayers()

      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        {
          LayerName: 'layer-LayerA',
          VersionNumber: '1',
        },
      )
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        {
          LayerName: 'layer-LayerA',
          VersionNumber: '2',
        },
      )
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        {
          LayerName: 'layer-LayerA',
          VersionNumber: '3',
        },
      )
      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        {
          LayerName: 'layer-LayerB',
          VersionNumber: '1',
        },
      )
    })

    it('should keep requested number of version', async () => {
      serverless = createMockServerlessWithLayers(['LayerA'])
      plugin = new Prune(serverless, { number: 3, includeLayers: true })

      providerRequest.mockResolvedValueOnce(
        createLayerVersionsResponse([1, 2, 3, 4]),
      )

      await plugin.pruneLayers()

      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        expect.objectContaining({ VersionNumber: '1' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        expect.objectContaining({ VersionNumber: '2' }),
      )
    })

    it('should handle non-deployed layers', async () => {
      serverless = createMockServerlessWithLayers(['LayerA'])
      plugin = new Prune(serverless, { number: 1, includeLayers: true })

      providerRequest.mockRejectedValueOnce({
        providerError: { statusCode: 404 },
      })

      await expect(plugin.pruneLayers()).resolves.not.toThrow()
    })

    it('should only operate on target layer if specified from CLI', async () => {
      serverless = createMockServerlessWithLayers(['LayerA', 'LayerB'])
      plugin = new Prune(serverless, {
        layer: 'LayerA',
        includeLayers: true,
        number: 1,
      })

      providerRequest.mockResolvedValueOnce(createLayerVersionsResponse([1, 2]))

      await plugin.pruneLayers()

      expect(providerRequest).toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        expect.objectContaining({ LayerName: 'layer-LayerA' }),
      )
      expect(providerRequest).not.toHaveBeenCalledWith(
        'Lambda',
        'deleteLayerVersion',
        expect.objectContaining({ LayerName: 'layer-LayerB' }),
      )
    })

    it('should respect dryRun flag', async () => {
      serverless = createMockServerlessWithLayers(['LayerA'])
      plugin = new Prune(serverless, {
        number: 1,
        dryRun: true,
        includeLayers: true,
      })
      const deleteSpy = jest.spyOn(plugin, 'deleteVersionsForLayer')

      providerRequest.mockResolvedValueOnce(createLayerVersionsResponse([1, 2]))

      await plugin.pruneLayers()
      expect(deleteSpy).not.toHaveBeenCalled()
    })
  })

  describe('postDeploy', () => {
    it('should run auto-prune if enabled', async () => {
      serverless = createMockServerless(['FuncA'], {
        prune: { automatic: true, number: 3 },
      })
      plugin = new Prune(serverless, {})
      const pruneSpy = jest.spyOn(plugin, 'pruneFunctions').mockResolvedValue()

      await plugin.postDeploy()
      expect(pruneSpy).toHaveBeenCalled()
    })

    it('should prune all functions if number is 0', async () => {
      serverless = createMockServerless(['FuncA'], {
        prune: { automatic: true, number: 0 },
      })
      plugin = new Prune(serverless, {})
      const pruneSpy = jest.spyOn(plugin, 'pruneFunctions').mockResolvedValue()

      await plugin.postDeploy()
      expect(pruneSpy).toHaveBeenCalled()
    })

    it('should skip if automatic is true but no number', async () => {
      serverless = createMockServerless(['FuncA'], {
        prune: { automatic: true },
      })
      plugin = new Prune(serverless, {})
      const pruneSpy = jest.spyOn(plugin, 'pruneFunctions')

      await plugin.postDeploy()
      expect(pruneSpy).not.toHaveBeenCalled()
    })

    it('should skip auto-prune if disabled', async () => {
      serverless = createMockServerless(['FuncA'], {
        prune: { automatic: false },
      })
      plugin = new Prune(serverless, {})
      const pruneSpy = jest.spyOn(plugin, 'pruneFunctions')

      await plugin.postDeploy()
      expect(pruneSpy).not.toHaveBeenCalled()
    })

    it('should skip if noDeploy is true', async () => {
      serverless = createMockServerless([], {
        prune: { automatic: true, number: 3 },
      })
      plugin = new Prune(serverless, { noDeploy: true })
      const pruneSpy = jest.spyOn(plugin, 'pruneFunctions')

      await plugin.postDeploy()
      expect(pruneSpy).not.toHaveBeenCalled()
    })

    it('should not prune layers if includeLayers is false', async () => {
      serverless = createMockServerlessWithLayers(['LayerA'], {
        prune: { automatic: true, number: 3, includeLayers: false },
      })
      plugin = new Prune(serverless, {})
      const pruneSpy = jest.spyOn(plugin, 'pruneLayers')

      await plugin.postDeploy()
      expect(pruneSpy).not.toHaveBeenCalled()
    })
  })

  describe('cliPrune', () => {
    it('should only prune functions by default', async () => {
      serverless = createMockServerless(['FuncA'])
      plugin = new Prune(serverless, { number: 3 })
      const pruneFuncsSpy = jest
        .spyOn(plugin, 'pruneFunctions')
        .mockResolvedValue()
      const pruneLayersSpy = jest
        .spyOn(plugin, 'pruneLayers')
        .mockResolvedValue()

      await plugin.cliPrune()
      expect(pruneFuncsSpy).toHaveBeenCalled()
      expect(pruneLayersSpy).not.toHaveBeenCalled()
    })

    it('should prune functions and layers if includeLayers is set', async () => {
      serverless = createMockServerlessWithLayers(['LayerA'])
      plugin = new Prune(serverless, { number: 3, includeLayers: true })
      const pruneFuncsSpy = jest
        .spyOn(plugin, 'pruneFunctions')
        .mockResolvedValue()
      const pruneLayersSpy = jest
        .spyOn(plugin, 'pruneLayers')
        .mockResolvedValue()

      await plugin.cliPrune()
      expect(pruneFuncsSpy).toHaveBeenCalled()
      expect(pruneLayersSpy).toHaveBeenCalled()
    })
  })

  describe('logging helpers', () => {
    let logMock
    beforeEach(() => {
      serverless = createMockServerless()
      logMock = {
        info: jest.fn(),
        warning: jest.fn(),
        success: jest.fn(),
      }
      plugin = new Prune(serverless, {}, { log: logMock })
    })

    it('should log info', () => {
      plugin.logInfo('test info')
      expect(logMock.info).toHaveBeenCalledWith('test info')
    })

    it('should log warning', () => {
      plugin.logWarning('test warning')
      expect(logMock.warning).toHaveBeenCalledWith('test warning')
    })

    it('should log success', () => {
      plugin.logSuccess('test success')
      expect(logMock.success).toHaveBeenCalledWith('test success')
    })
  })

  describe('pagination', () => {
    it('should handle paginated lambda requests', async () => {
      serverless = createMockServerless()
      plugin = new Prune(serverless, {})

      providerRequest
        .mockResolvedValueOnce({
          Versions: [{ Version: '1' }],
          NextMarker: 'marker1',
        })
        .mockResolvedValueOnce({
          Versions: [{ Version: '2' }],
        })

      const versions = await plugin.listVersionForFunction('MyFunc')
      expect(versions).toHaveLength(2)
      expect(providerRequest).toHaveBeenCalledTimes(2)
      expect(providerRequest).toHaveBeenNthCalledWith(
        2,
        'Lambda',
        'listVersionsByFunction',
        {
          FunctionName: 'MyFunc',
          Marker: 'marker1',
        },
      )
    })
  })
})
