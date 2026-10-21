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
        isReferenceCodeStorageMode: jest.fn().mockReturnValue(false),
        getServerlessDeploymentBucketName: jest
          .fn()
          .mockResolvedValue('test-deployment-bucket'),
        getDeploymentPrefix: jest.fn().mockReturnValue('serverless'),
        getStage: jest.fn().mockReturnValue('dev'),
      }),
      cli: { log: jest.fn() },
      service: {
        service: 'test-service',
        provider: {},
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

      // Dispatch on method/params rather than call order: unscoped
      // pruneFunctions() now fetches every function's versions via the
      // shared getFunctionVersionLists() memo (all versions calls fire
      // together, ahead of any alias calls) rather than interleaving
      // versions/aliases per function as before.
      providerRequest.mockImplementation((service, action, params) => {
        if (action === 'listVersionsByFunction') {
          if (params.FunctionName === 'service-FuncA')
            return Promise.resolve(createVersionsResponse([1, 2, 3, 4, 5]))
          if (params.FunctionName === 'service-FuncB')
            return Promise.resolve(createVersionsResponse([1, 2, 3]))
        }
        if (action === 'listAliases')
          return Promise.resolve(createAliasResponse([]))
        return Promise.resolve({})
      })

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

      // Nothing was actually deleted, but the version that WOULD have been
      // deleted (version 1, since number:1 keeps only the newest version 2)
      // is still recorded as planned-pruned — so a chained
      // sweepDeploymentArtifacts() previews the post-prune world instead of
      // treating every still-alive version as pinned.
      expect(plugin.prunedFunctionVersions.get('service-FuncA')).toEqual(
        new Set(['1']),
      )
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

    describe('usage-aware protection', () => {
      const LAYER_ARN_V1 =
        'arn:aws:lambda:us-east-1:111111111111:layer:layer-LayerA:1'
      const LAYER_ARN_V2 =
        'arn:aws:lambda:us-east-1:111111111111:layer:layer-LayerA:2'

      const createLayerVersionsResponseWithArn = (entries) => ({
        LayerVersions: entries.map(({ version, arn }) => ({
          Version: `${version}`,
          LayerVersionArn: arn,
        })),
      })

      it('does not delete a layer version beyond the keep window when it is still attached to an existing function version', async () => {
        serverless = createMockServerlessWithLayers(['LayerA'])
        serverless.service.getAllFunctions = jest
          .fn()
          .mockReturnValue(['FuncA'])
        plugin = new Prune(serverless, { number: 1, includeLayers: true })

        providerRequest.mockImplementation((service, action, params) => {
          if (action === 'listVersionsByFunction') {
            return Promise.resolve({
              Versions: [
                // Old function version 1 still references old layer
                // version 1 — layer version 1 must be protected even
                // though it falls outside the retention window (number:1
                // keeps only the newest layer version).
                { Version: '1', Layers: [{ Arn: LAYER_ARN_V1 }] },
              ],
            })
          }
          if (action === 'listLayerVersions') {
            return Promise.resolve(
              createLayerVersionsResponseWithArn([
                { version: 1, arn: LAYER_ARN_V1 },
                { version: 2, arn: LAYER_ARN_V2 },
              ]),
            )
          }
          return Promise.resolve({})
        })

        await plugin.pruneLayers()

        expect(providerRequest).not.toHaveBeenCalledWith(
          'Lambda',
          'deleteLayerVersion',
          expect.objectContaining({ VersionNumber: '1' }),
        )
      })

      it('deletes an old layer version beyond the keep window when it is not attached to any existing function version', async () => {
        serverless = createMockServerlessWithLayers(['LayerA'])
        serverless.service.getAllFunctions = jest
          .fn()
          .mockReturnValue(['FuncA'])
        plugin = new Prune(serverless, { number: 1, includeLayers: true })

        providerRequest.mockImplementation((service, action, params) => {
          if (action === 'listVersionsByFunction') {
            return Promise.resolve({
              // Only ever attached to layer version 2 — version 1 is
              // unused and safe to delete.
              Versions: [{ Version: '1', Layers: [{ Arn: LAYER_ARN_V2 }] }],
            })
          }
          if (action === 'listLayerVersions') {
            return Promise.resolve(
              createLayerVersionsResponseWithArn([
                { version: 1, arn: LAYER_ARN_V1 },
                { version: 2, arn: LAYER_ARN_V2 },
              ]),
            )
          }
          return Promise.resolve({})
        })

        await plugin.pruneLayers()

        expect(providerRequest).toHaveBeenCalledWith(
          'Lambda',
          'deleteLayerVersion',
          expect.objectContaining({
            LayerName: 'layer-LayerA',
            VersionNumber: '1',
          }),
        )
      })

      it('protects attached layer versions on scoped --layer runs too', async () => {
        serverless = createMockServerlessWithLayers(['LayerA', 'LayerB'])
        serverless.service.getAllFunctions = jest
          .fn()
          .mockReturnValue(['FuncA'])
        plugin = new Prune(serverless, {
          number: 1,
          includeLayers: true,
          layer: 'LayerA',
        })

        providerRequest.mockImplementation((service, action, params) => {
          if (action === 'listVersionsByFunction') {
            return Promise.resolve({
              Versions: [{ Version: '1', Layers: [{ Arn: LAYER_ARN_V1 }] }],
            })
          }
          if (action === 'listLayerVersions') {
            if (params.LayerName === 'layer-LayerA') {
              return Promise.resolve(
                createLayerVersionsResponseWithArn([
                  { version: 1, arn: LAYER_ARN_V1 },
                  { version: 2, arn: LAYER_ARN_V2 },
                ]),
              )
            }
            return Promise.resolve({ LayerVersions: [] })
          }
          return Promise.resolve({})
        })

        await plugin.pruneLayers()

        // Scoped run only ever touches LayerA (LayerB's listLayerVersions
        // is never even called), and within LayerA the attached version 1
        // is protected exactly as in the unscoped case.
        expect(providerRequest).not.toHaveBeenCalledWith(
          'Lambda',
          'deleteLayerVersion',
          expect.objectContaining({
            LayerName: 'layer-LayerA',
            VersionNumber: '1',
          }),
        )
        expect(providerRequest).not.toHaveBeenCalledWith(
          'Lambda',
          'deleteLayerVersion',
          expect.objectContaining({ LayerName: 'layer-LayerB' }),
        )
      })

      it('reflects usage-aware selection in dryRun output', async () => {
        serverless = createMockServerlessWithLayers(['LayerA'])
        serverless.service.getAllFunctions = jest
          .fn()
          .mockReturnValue(['FuncA'])
        const logMock = {
          info: jest.fn(),
          notice: jest.fn(),
          warning: jest.fn(),
          success: jest.fn(),
        }
        plugin = new Prune(
          serverless,
          { number: 1, includeLayers: true, dryRun: true },
          { log: logMock },
        )

        providerRequest.mockImplementation((service, action) => {
          if (action === 'listVersionsByFunction') {
            return Promise.resolve({
              Versions: [{ Version: '1', Layers: [{ Arn: LAYER_ARN_V1 }] }],
            })
          }
          if (action === 'listLayerVersions') {
            return Promise.resolve(
              createLayerVersionsResponseWithArn([
                { version: 1, arn: LAYER_ARN_V1 },
                { version: 2, arn: LAYER_ARN_V2 },
              ]),
            )
          }
          return Promise.resolve({})
        })

        await plugin.pruneLayers()

        // Attached version 1 must never be printed as a deletion
        // candidate in dry-run mode.
        expect(logMock.info).not.toHaveBeenCalledWith(
          expect.stringContaining('layer-LayerA:1 selected for deletion'),
        )
        // And the retention reason must be logged instead.
        expect(logMock.info).toHaveBeenCalledWith(
          expect.stringContaining(
            'Retaining layer version layer-LayerA:1 — attached to existing function versions.',
          ),
        )
      })
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

  describe('shared function version listings (getFunctionVersionLists)', () => {
    it('issues exactly N listVersionsByFunction calls for a combined cliPrune run under --includeLayers, not 2N', async () => {
      const functionKeys = ['FuncA', 'FuncB', 'FuncC']
      serverless = createMockServerlessWithLayers(['LayerA'])
      serverless.service.getAllFunctions = jest
        .fn()
        .mockReturnValue(functionKeys)
      plugin = new Prune(serverless, { number: 1, includeLayers: true })

      providerRequest.mockImplementation((service, action) => {
        if (action === 'listVersionsByFunction') {
          return Promise.resolve(createVersionsResponse([1, 2]))
        }
        if (action === 'listAliases') {
          return Promise.resolve(createAliasResponse([]))
        }
        if (action === 'listLayerVersions') {
          return Promise.resolve(createLayerVersionsResponse([1, 2]))
        }
        return Promise.resolve({})
      })

      await plugin.cliPrune()

      // pruneFunctions() lists every function's versions once, and
      // pruneLayers()'s attached-set builder reuses that same fetch via the
      // getFunctionVersionLists() memo instead of listing again — so a
      // combined run costs exactly N calls, not 2N.
      const listVersionsByFunctionCalls = providerRequest.mock.calls.filter(
        ([, action]) => action === 'listVersionsByFunction',
      )
      expect(listVersionsByFunctionCalls).toHaveLength(functionKeys.length)
    })

    it('issues zero listVersionsByFunction calls from the layer path when the service has zero layers', async () => {
      serverless = createMockServerless(['FuncA', 'FuncB'])
      plugin = new Prune(serverless, { number: 1 })

      await plugin.pruneLayers()

      // No layers selected means nothing to prune, so the attached-set
      // fetch must be skipped entirely — zero Lambda API calls, even
      // though the service has functions.
      expect(providerRequest).not.toHaveBeenCalled()
    })

    it('issues exactly 2N listVersionsByFunction calls for a full includeLayers + includeArtifacts cliPrune run — N from the shared prune-phase memo, N fresh from the sweep', async () => {
      const functionKeys = ['FuncA', 'FuncB', 'FuncC']
      serverless = createMockServerlessWithLayers(['LayerA'])
      serverless.service.getAllFunctions = jest
        .fn()
        .mockReturnValue(functionKeys)
      plugin = new Prune(serverless, {
        number: 1,
        includeLayers: true,
        includeArtifacts: true,
      })
      // Enable the sweep prerequisite gated by shouldSweepArtifacts().
      plugin.provider.isReferenceCodeStorageMode = () => true

      providerRequest.mockImplementation((service, action) => {
        if (action === 'listVersionsByFunction') {
          return Promise.resolve(createVersionsResponse([1, 2]))
        }
        if (action === 'listAliases') {
          return Promise.resolve(createAliasResponse([]))
        }
        if (action === 'listLayerVersions') {
          return Promise.resolve(createLayerVersionsResponse([1, 2]))
        }
        if (action === 'listObjectsV2') {
          return Promise.resolve({ Contents: [] })
        }
        // deleteFunction / deleteLayerVersion / deleteObjects: succeed with
        // an empty response, nothing under test here.
        return Promise.resolve({})
      })

      await plugin.cliPrune()

      const listVersionsByFunctionCalls = providerRequest.mock.calls.filter(
        ([, action]) => action === 'listVersionsByFunction',
      )
      // N calls from the prune phase: pruneFunctions() and pruneLayers()'s
      // attached-set builder run concurrently via Promise.all but share the
      // SAME fetch through the getFunctionVersionLists() memo, so the prune
      // phase costs exactly N — not 2N — even though both methods need it.
      // Then sweepDeploymentArtifacts() deliberately does its OWN fresh,
      // post-prune listing (it must never reuse the pre-prune memo, or it
      // would miss versions this very run just deleted — see the "discounts
      // a version this same run just deleted" test above), adding N more.
      // Total across the whole cliPrune() run: 2N, never 3N or N.
      expect(listVersionsByFunctionCalls).toHaveLength(functionKeys.length * 2)
    })
  })

  describe('includeArtifacts', () => {
    beforeEach(() => {
      serverless = createMockServerless(['FuncA'])
      plugin = new Prune(serverless, { number: 5 })
    })

    it('accepts custom.prune.includeArtifacts in config', () => {
      const pluginCustom = plugin.loadCustom({
        prune: { automatic: true, number: 5, includeArtifacts: true },
      })
      expect(pluginCustom.includeArtifacts).toBe(true)
    })

    it('runs the sweep for a copy-mode service (no codeStorageMode configured)', async () => {
      // Copy mode is the default: createMockServerless wires
      // isReferenceCodeStorageMode() to return false. The sweep engine is
      // storage-mode-blind — it pins from surviving versions either way — so
      // an unscoped run still lists versions, computes pins, and drives the
      // S3 sweep. Here the real sweepDeploymentArtifacts()/sweepArtifacts()
      // path runs end to end; only provider.request is mocked.
      const DIR_OLD = '050-2026-07-14T00:00:00.000Z'
      const DIR_NEW = '300-2026-07-17T00:00:00.000Z'
      const deleteObjectsCalls = []
      const listObjectsV2Calls = []

      serverless = createMockServerless(['FuncA'])
      // keepCount 0 disables the retention-window shortcut so both dirs are
      // actually inspected against the pin set below.
      serverless.service.provider.deploymentBucketObject = {
        maxPreviousDeploymentArtifacts: 0,
      }
      providerRequest.mockImplementation(async (service, method, params) => {
        switch (method) {
          case 'listVersionsByFunction':
            return { Versions: [{ Version: '2', CodeSha256: 'LIVESHA' }] }
          case 'listAliases':
            return { Aliases: [] }
          case 'listObjectsV2':
            listObjectsV2Calls.push(params)
            return {
              Contents: [
                {
                  Key: `serverless/test-service/dev/${DIR_OLD}/test-service.zip`,
                },
                {
                  Key: `serverless/test-service/dev/${DIR_NEW}/test-service.zip`,
                },
              ],
            }
          case 'headObject':
            if (params.Key.includes(DIR_NEW)) {
              return { Metadata: { filesha256: 'LIVESHA' } }
            }
            return { Metadata: { filesha256: 'STALESHA' } }
          case 'deleteObjects':
            deleteObjectsCalls.push(params)
            return {}
          case 'deleteFunction':
            return {}
          default:
            throw new Error(`unexpected request ${service} ${method}`)
        }
      })

      plugin = new Prune(serverless, { number: 5, includeArtifacts: true })
      const warnSpy = jest.spyOn(plugin, 'logWarning')

      await plugin.cliPrune()

      // Copy mode never warns about a missing codeStorageMode — the gate is
      // gone.
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('codeStorageMode'),
      )
      // The sweep actually ran: it listed the artifact directories...
      expect(listObjectsV2Calls.length).toBeGreaterThan(0)
      // ...and marked only the stale, unpinned dir (delete marker only), while
      // the dir backing the surviving version stayed pinned.
      expect(deleteObjectsCalls).toHaveLength(1)
      expect(deleteObjectsCalls[0].Delete.Objects).toEqual([
        { Key: `serverless/test-service/dev/${DIR_OLD}/test-service.zip` },
      ])
    })

    it('skips the sweep with a notice on scoped runs', async () => {
      plugin.options = { number: 5, includeArtifacts: true, function: 'hello' }
      plugin.provider.isReferenceCodeStorageMode = () => true
      plugin.pruneFunctions = jest.fn()
      plugin.sweepDeploymentArtifacts = jest.fn()
      const noticeSpy = jest.spyOn(plugin, 'logNotice')

      await plugin.cliPrune()

      expect(plugin.sweepDeploymentArtifacts).not.toHaveBeenCalled()
      expect(noticeSpy).toHaveBeenCalled()
    })

    it('runs the sweep after pruning on unscoped runs in reference mode', async () => {
      plugin.options = { number: 5, includeArtifacts: true }
      plugin.provider.isReferenceCodeStorageMode = () => true
      plugin.pruneFunctions = jest.fn()
      plugin.sweepDeploymentArtifacts = jest.fn()

      await plugin.cliPrune()

      expect(plugin.sweepDeploymentArtifacts).toHaveBeenCalled()
    })

    it('runs the sweep from automatic post-deploy pruning when configured', async () => {
      plugin.pluginCustom = {
        automatic: true,
        number: 5,
        includeArtifacts: true,
      }
      plugin.serverless.service.custom = {
        prune: { automatic: true, number: 5, includeArtifacts: true },
      }
      plugin.provider.isReferenceCodeStorageMode = () => true
      plugin.pruneFunctions = jest.fn()
      plugin.sweepDeploymentArtifacts = jest.fn()

      await plugin.postDeploy()

      expect(plugin.sweepDeploymentArtifacts).toHaveBeenCalled()
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

  describe('sweepDeploymentArtifacts', () => {
    // End-to-end coverage of the real sweepDeploymentArtifacts method driving
    // the real artifact-sweep engine (sweepArtifacts is NOT stubbed). Only
    // provider.request and the provider getters are mocked.
    const FUNCTION_NAME = 'svc-dev-hello'
    const DIR_050 = '050-2026-07-14T00:00:00.000Z'
    const DIR_100 = '100-2026-07-15T00:00:00.000Z'
    const DIR_300 = '300-2026-07-17T00:00:00.000Z'
    const REF_LAYER_ARN = 'arn:aws:lambda:us-east-1:111:layer:refLayer:3'
    const DEAD_LAYER_ARN = 'arn:aws:lambda:us-east-1:111:layer:deadLayer:1'
    const REF_LAYER_KEY = `serverless/svc/dev/${DIR_100}/refLayer.zip`

    const s3Listing = {
      Contents: [
        { Key: `serverless/svc/dev/${DIR_050}/deadLayer.zip` },
        { Key: `serverless/svc/dev/${DIR_050}/svc.zip` },
        { Key: `serverless/svc/dev/${DIR_100}/refLayer.zip` },
        { Key: `serverless/svc/dev/${DIR_100}/svc.zip` },
        { Key: `serverless/svc/dev/${DIR_300}/svc.zip` },
      ],
    }

    // Builds a fully-wired Prune instance whose only mocked seams are
    // provider.request and the provider getters listed in the task spec.
    const buildPlugin = (functionVersions) => {
      const deleteObjectsCalls = []
      const getLayerVersionCalls = []
      const getLayerVersionRequestOptions = []

      const request = jest.fn(async (service, method, params, options) => {
        switch (method) {
          case 'listVersionsByFunction':
            return { Versions: functionVersions }
          case 'listLayerVersions':
            if (params.LayerName === 'refLayer') {
              return { LayerVersions: [{ LayerVersionArn: REF_LAYER_ARN }] }
            }
            return { LayerVersions: [] }
          case 'getLayerVersion':
            getLayerVersionCalls.push(params)
            getLayerVersionRequestOptions.push(options)
            if (params.LayerName === 'refLayer' && params.VersionNumber === 3) {
              return {
                Content: {
                  ResolvedS3Object: {
                    S3Bucket: 'deployment-bucket',
                    S3Key: REF_LAYER_KEY,
                    S3ObjectVersion: 'layerVid',
                  },
                },
              }
            }
            if (
              params.LayerName === 'deadLayer' &&
              params.VersionNumber === 1
            ) {
              throw new Error('layer version not found')
            }
            throw new Error(
              `unexpected getLayerVersion params ${JSON.stringify(params)}`,
            )
          case 'listObjectsV2':
            return s3Listing
          case 'headObject':
            if (params.Key.endsWith('svc.zip')) {
              return { Metadata: { filesha256: 'PINNEDSHA' } }
            }
            if (params.Key === REF_LAYER_KEY) {
              return {
                Metadata: { filesha256: 'garbage' },
                VersionId: 'layerVid',
              }
            }
            if (params.Key.endsWith('deadLayer.zip')) {
              return { Metadata: { filesha256: 'unrelatedsha' } }
            }
            throw new Error(`unexpected headObject key ${params.Key}`)
          case 'deleteObjects':
            deleteObjectsCalls.push(params)
            return {}
          default:
            throw new Error(`unexpected request ${service} ${method}`)
        }
      })

      const mockServerless = {
        getProvider: jest.fn().mockReturnValue({
          request,
          isReferenceCodeStorageMode: () => true,
          getServerlessDeploymentBucketName: async () => 'deployment-bucket',
          getDeploymentPrefix: () => 'serverless',
          getStage: () => 'dev',
          // Mirrors the real provider.resolveLayerArtifactName: artifact
          // basename is derived from the CONFIG KEY (naming.getLayerArtifactName),
          // not the published layer name — only the basename matters here
          // since sweepDeploymentArtifacts() only calls path.basename() on it.
          resolveLayerArtifactName: (layerName) => `${layerName}.zip`,
        }),
        service: {
          service: 'svc',
          provider: {
            deploymentBucketObject: { maxPreviousDeploymentArtifacts: 1 },
          },
          getAllFunctions: jest.fn().mockReturnValue(['hello']),
          getFunction: jest.fn().mockReturnValue({ name: FUNCTION_NAME }),
          getAllLayers: jest.fn().mockReturnValue(['refLayer', 'deadLayer']),
          getLayer: jest.fn().mockImplementation((key) => ({ name: key })),
          custom: {},
        },
        configSchemaHandler: { defineCustomProperties: jest.fn() },
      }

      const sweepPlugin = new Prune(
        mockServerless,
        {},
        {
          log: {
            info: jest.fn(),
            notice: jest.fn(),
            warning: jest.fn(),
            success: jest.fn(),
          },
        },
      )

      return {
        sweepPlugin,
        request,
        deleteObjectsCalls,
        getLayerVersionCalls,
        getLayerVersionRequestOptions,
        mockServerless,
      }
    }

    it('keeps every candidate dir when pinned by sha, exact layer version, and basename fail-safe', async () => {
      const {
        sweepPlugin,
        request,
        deleteObjectsCalls,
        getLayerVersionCalls,
        getLayerVersionRequestOptions,
      } = buildPlugin([
        {
          Version: '5',
          CodeSha256: 'PINNEDSHA',
          Layers: [{ Arn: REF_LAYER_ARN }, { Arn: DEAD_LAYER_ARN }],
        },
      ])

      await sweepPlugin.sweepDeploymentArtifacts()

      // Nothing is provably unpinned, so no deletion marker is ever issued.
      expect(deleteObjectsCalls).toHaveLength(0)

      // ARN parsing feeds getLayerVersion correctly for both the resolvable
      // and the deleted-layer-version (thrown) case.
      expect(getLayerVersionCalls).toEqual(
        expect.arrayContaining([
          { LayerName: 'refLayer', VersionNumber: 3 },
          { LayerName: 'deadLayer', VersionNumber: 1 },
        ]),
      )

      // getLayerVersion must go through the v3 SDK path so
      // Content.ResolvedS3Object reaches the exact-pin logic above (v2
      // silently drops that field).
      expect(getLayerVersionRequestOptions).toHaveLength(2)
      for (const options of getLayerVersionRequestOptions) {
        expect(options).toEqual({ sdkVersion: 3 })
      }

      // keepCount:1 (from deploymentBucketObject) protects the newest dir —
      // it must never even be inspected.
      expect(request).not.toHaveBeenCalledWith(
        'S3',
        'headObject',
        expect.objectContaining({ Key: expect.stringContaining(DIR_300) }),
      )
    })

    it('pins a layer via Content.CodeSha256 when getLayerVersion returns no ResolvedS3Object', async () => {
      // Fallback path (index.js): when getLayerVersion has no
      // Content.ResolvedS3Object to exact-pin against, its Content.CodeSha256
      // is added to the pinned-sha set instead. That sha then protects any
      // artifact whose filesha256 metadata matches, regardless of storage
      // mode. Here the surviving function version attaches a layer ARN whose
      // getLayerVersion response carries only CodeSha256; the old dir holds a
      // layer artifact stamped with that same sha and must be kept.
      const ATTACHED_ARN = 'arn:aws:lambda:us-east-1:111:layer:util:4'
      const DIR_OLD = '050-2026-07-14T00:00:00.000Z'
      const DIR_NEW = '300-2026-07-17T00:00:00.000Z'
      const deleteObjectsCalls = []

      const request = jest.fn(async (service, method, params, options) => {
        switch (method) {
          case 'listVersionsByFunction':
            return {
              Versions: [
                {
                  Version: '5',
                  CodeSha256: 'FUNCSHA',
                  Layers: [{ Arn: ATTACHED_ARN }],
                },
              ],
            }
          case 'listLayerVersions':
            return { LayerVersions: [{ LayerVersionArn: ATTACHED_ARN }] }
          case 'getLayerVersion':
            expect(options).toEqual({ sdkVersion: 3 })
            // No Content.ResolvedS3Object — only a CodeSha256 to fall back to.
            return { Content: { CodeSha256: 'LAYERSHA' } }
          case 'listObjectsV2':
            return {
              Contents: [
                { Key: `serverless/svc/dev/${DIR_OLD}/util.zip` },
                { Key: `serverless/svc/dev/${DIR_NEW}/svc.zip` },
              ],
            }
          case 'headObject':
            // The old dir's layer artifact is stamped with the layer's
            // CodeSha256 — the only thing that can keep it is the fallback pin.
            if (params.Key === `serverless/svc/dev/${DIR_OLD}/util.zip`) {
              return { Metadata: { filesha256: 'LAYERSHA' } }
            }
            throw new Error(`unexpected headObject key ${params.Key}`)
          case 'deleteObjects':
            deleteObjectsCalls.push(params)
            return {}
          default:
            throw new Error(`unexpected request ${service} ${method}`)
        }
      })

      const mockServerless = {
        getProvider: jest.fn().mockReturnValue({
          request,
          // Copy mode (default) — the fallback pin must work here too.
          isReferenceCodeStorageMode: () => false,
          getServerlessDeploymentBucketName: async () => 'deployment-bucket',
          getDeploymentPrefix: () => 'serverless',
          getStage: () => 'dev',
          resolveLayerArtifactName: (layerName) => `${layerName}.zip`,
        }),
        service: {
          service: 'svc',
          provider: {
            // keepCount 1 protects DIR_NEW; DIR_OLD is the only candidate.
            deploymentBucketObject: { maxPreviousDeploymentArtifacts: 1 },
          },
          getAllFunctions: jest.fn().mockReturnValue(['hello']),
          getFunction: jest.fn().mockReturnValue({ name: FUNCTION_NAME }),
          getAllLayers: jest.fn().mockReturnValue(['util']),
          getLayer: jest.fn().mockReturnValue({ name: 'util' }),
          custom: {},
        },
        configSchemaHandler: { defineCustomProperties: jest.fn() },
      }

      const sweepPlugin = new Prune(
        mockServerless,
        {},
        {
          log: {
            info: jest.fn(),
            notice: jest.fn(),
            warning: jest.fn(),
            success: jest.fn(),
          },
        },
      )

      await sweepPlugin.sweepDeploymentArtifacts()

      // DIR_OLD's layer artifact matched the fallback CodeSha256 pin, so
      // nothing is marked for deletion.
      expect(deleteObjectsCalls).toHaveLength(0)
    })

    it('marks only the provably-unpinned dir when the function sha no longer matches and the dead layer is unreferenced', async () => {
      const { sweepPlugin, deleteObjectsCalls } = buildPlugin([
        {
          Version: '5',
          CodeSha256: 'OTHER',
          // deadLayer is no longer attached to any surviving function version
          // and no longer appears in listLayerVersions, so it is never
          // resolved via getLayerVersion and gets no basename fail-safe pin.
          Layers: [{ Arn: REF_LAYER_ARN }],
        },
      ])

      await sweepPlugin.sweepDeploymentArtifacts()

      // Only dir 050 is provably unpinned: dir 100 is kept because refLayer
      // is still pinned to its exact resolved artifact/version.
      expect(deleteObjectsCalls).toHaveLength(1)
      expect(deleteObjectsCalls[0].Bucket).toBe('deployment-bucket')
      expect(deleteObjectsCalls[0].Delete.Objects).toEqual([
        { Key: `serverless/svc/dev/${DIR_050}/deadLayer.zip` },
        { Key: `serverless/svc/dev/${DIR_050}/svc.zip` },
      ])
    })

    it('discounts a version this same run just deleted even though the fresh listVersionsByFunction call still (eventual consistency) returns it', async () => {
      const deleteObjectsCalls = []

      const request = jest.fn(async (service, method, params) => {
        switch (method) {
          case 'deleteFunction':
            return {}
          case 'listVersionsByFunction':
            // Simulates Lambda's eventual consistency: version 2, deleted
            // moments ago below via deleteVersionsForFunction, still shows
            // up in this "fresh" listing alongside surviving version 3.
            return {
              Versions: [
                { Version: '2', CodeSha256: 'V2SHA' },
                { Version: '3', CodeSha256: 'V3SHA' },
              ],
            }
          case 'listLayerVersions':
            return { LayerVersions: [] }
          case 'listObjectsV2':
            return {
              Contents: [
                { Key: `serverless/svc/dev/${DIR_050}/svc.zip` },
                { Key: `serverless/svc/dev/${DIR_100}/svc.zip` },
                { Key: `serverless/svc/dev/${DIR_300}/svc.zip` },
              ],
            }
          case 'headObject':
            if (params.Key === `serverless/svc/dev/${DIR_050}/svc.zip`) {
              // Backs the just-pruned (and still, per eventual consistency,
              // listed) version 2.
              return { Metadata: { filesha256: 'V2SHA' } }
            }
            if (params.Key === `serverless/svc/dev/${DIR_100}/svc.zip`) {
              // Backs the real surviving version 3.
              return { Metadata: { filesha256: 'V3SHA' } }
            }
            throw new Error(`unexpected headObject key ${params.Key}`)
          case 'deleteObjects':
            deleteObjectsCalls.push(params)
            return {}
          default:
            throw new Error(`unexpected request ${service} ${method}`)
        }
      })

      const mockServerless = {
        getProvider: jest.fn().mockReturnValue({
          request,
          isReferenceCodeStorageMode: () => true,
          getServerlessDeploymentBucketName: async () => 'deployment-bucket',
          getDeploymentPrefix: () => 'serverless',
          getStage: () => 'dev',
        }),
        service: {
          service: 'svc',
          provider: {
            deploymentBucketObject: { maxPreviousDeploymentArtifacts: 1 },
          },
          getAllFunctions: jest.fn().mockReturnValue(['hello']),
          getFunction: jest.fn().mockReturnValue({ name: FUNCTION_NAME }),
          getAllLayers: jest.fn().mockReturnValue([]),
          getLayer: jest.fn(),
          custom: {},
        },
        configSchemaHandler: { defineCustomProperties: jest.fn() },
      }

      const sweepPlugin = new Prune(
        mockServerless,
        {},
        {
          log: {
            info: jest.fn(),
            notice: jest.fn(),
            warning: jest.fn(),
            success: jest.fn(),
          },
        },
      )

      // Real recording path: pruneFunctions()/cliPrune() would have called
      // this moments before sweepDeploymentArtifacts() runs, and it must
      // have succeeded (not thrown) for the version to be recorded.
      await sweepPlugin.deleteVersionsForFunction(FUNCTION_NAME, ['2'])
      expect(sweepPlugin.prunedFunctionVersions.get(FUNCTION_NAME)).toEqual(
        new Set(['2']),
      )

      await sweepPlugin.sweepDeploymentArtifacts()

      // DIR_050 backs the just-deleted version 2. Without discounting the
      // recorded deletion, the stale listVersionsByFunction entry would
      // still pin V2SHA and this dir would incorrectly survive forever —
      // exactly the live `prune -n 1 --includeArtifacts` symptom this test
      // guards against.
      expect(deleteObjectsCalls).toHaveLength(1)
      expect(deleteObjectsCalls[0].Delete.Objects).toEqual([
        { Key: `serverless/svc/dev/${DIR_050}/svc.zip` },
      ])
      // DIR_100 backs the real surviving version 3 and must remain pinned.
      expect(deleteObjectsCalls[0].Delete.Objects).not.toContainEqual({
        Key: `serverless/svc/dev/${DIR_100}/svc.zip`,
      })
    })

    it('protects the config-key artifact basename (not just the ARN-derived name) when a custom-named layer is deleted-but-attached', async () => {
      // layers: { common: { name: 'acme-prod-utils', ... } } — the config
      // key ("common") and the published Lambda layer name
      // ("acme-prod-utils") differ. The deployment artifact is named after
      // the CONFIG KEY (common.zip), while the attached ARN carries the
      // PUBLISHED name. Before the fix, the deleted-but-attached fail-safe
      // only ever pinned "acme-prod-utils.zip" — protecting nothing, since
      // that file never existed in the bucket.
      const CONFIG_KEY = 'common'
      const PUBLISHED_NAME = 'acme-prod-utils'
      const ATTACHED_ARN = `arn:aws:lambda:us-east-1:111:layer:${PUBLISHED_NAME}:7`
      const DIR_OLD = '050-2026-07-14T00:00:00.000Z'
      const DIR_NEW = '300-2026-07-17T00:00:00.000Z'

      const deleteObjectsCalls = []
      const request = jest.fn(async (service, method, params) => {
        switch (method) {
          case 'listVersionsByFunction':
            return {
              Versions: [
                {
                  Version: '5',
                  CodeSha256: 'UNRELATEDSHA',
                  Layers: [{ Arn: ATTACHED_ARN }],
                },
              ],
            }
          case 'listLayerVersions':
            // The layer version is gone from listLayerVersions too — fully
            // deleted-but-still-attached to the surviving function version.
            return { LayerVersions: [] }
          case 'getLayerVersion':
            throw new Error('layer version not found')
          case 'listObjectsV2':
            return {
              Contents: [
                { Key: `serverless/svc/dev/${DIR_OLD}/${CONFIG_KEY}.zip` },
                { Key: `serverless/svc/dev/${DIR_NEW}/${CONFIG_KEY}.zip` },
              ],
            }
          case 'headObject':
            // Not sha-pinned — the only thing that can save DIR_OLD is the
            // basename fail-safe pin.
            return { Metadata: { filesha256: 'someothersha' } }
          case 'deleteObjects':
            deleteObjectsCalls.push(params)
            return {}
          default:
            throw new Error(`unexpected request ${service} ${method}`)
        }
      })

      const mockServerless = {
        getProvider: jest.fn().mockReturnValue({
          request,
          isReferenceCodeStorageMode: () => true,
          getServerlessDeploymentBucketName: async () => 'deployment-bucket',
          getDeploymentPrefix: () => 'serverless',
          getStage: () => 'dev',
          resolveLayerArtifactName: (layerName) => `${layerName}.zip`,
        }),
        service: {
          service: 'svc',
          provider: {
            deploymentBucketObject: { maxPreviousDeploymentArtifacts: 1 },
          },
          getAllFunctions: jest.fn().mockReturnValue(['hello']),
          getFunction: jest.fn().mockReturnValue({ name: FUNCTION_NAME }),
          getAllLayers: jest.fn().mockReturnValue([CONFIG_KEY]),
          getLayer: jest.fn().mockReturnValue({ name: PUBLISHED_NAME }),
          custom: {},
        },
        configSchemaHandler: { defineCustomProperties: jest.fn() },
      }

      const sweepPlugin = new Prune(
        mockServerless,
        {},
        {
          log: {
            info: jest.fn(),
            notice: jest.fn(),
            warning: jest.fn(),
            success: jest.fn(),
          },
        },
      )

      await sweepPlugin.sweepDeploymentArtifacts()

      // keepCount:1 protects DIR_NEW automatically (never inspected); DIR_OLD
      // is the only candidate. It must be kept via the mapped basename
      // fail-safe pin ("common.zip"), not swept because the raw ARN-name
      // pin ("acme-prod-utils.zip") doesn't match anything real.
      expect(deleteObjectsCalls).toHaveLength(0)
    })

    it('previews the sweep against planned deletions on a combined --dryRun --includeLayers --includeArtifacts cliPrune run', async () => {
      // Regression: `prune -n 1 --includeLayers
      // --includeArtifacts --dryRun` under-previewed the sweep because
      // dryRun pruneFunctions()/pruneLayers() computed deletion candidates
      // but never recorded them, so the sweep's fresh listing still saw
      // every version "alive" and reported the directory backing the
      // would-be-deleted version as pinned/kept. DIR_OLD here is pinned
      // ONLY by version '1' (V1SHA), which number:1 would delete (keeping
      // only the newest version '2', V2SHA) — a correctly-fixed dryRun
      // preview must report DIR_OLD as selected for deletion, exactly as a
      // real run would produce.
      const deleteFunctionCalls = []
      const deleteLayerVersionCalls = []
      const deleteObjectsCalls = []

      const request = jest.fn(async (service, method, params) => {
        switch (method) {
          case 'listVersionsByFunction':
            return {
              Versions: [
                { Version: '1', CodeSha256: 'V1SHA' },
                { Version: '2', CodeSha256: 'V2SHA' },
              ],
            }
          case 'listAliases':
            return { Aliases: [] }
          case 'listLayerVersions':
            return { LayerVersions: [] }
          case 'listObjectsV2':
            return {
              Contents: [
                { Key: `serverless/svc/dev/${DIR_050}/svc.zip` },
                { Key: `serverless/svc/dev/${DIR_300}/svc.zip` },
              ],
            }
          case 'headObject':
            if (params.Key === `serverless/svc/dev/${DIR_050}/svc.zip`) {
              return { Metadata: { filesha256: 'V1SHA' } }
            }
            if (params.Key === `serverless/svc/dev/${DIR_300}/svc.zip`) {
              return { Metadata: { filesha256: 'V2SHA' } }
            }
            throw new Error(`unexpected headObject key ${params.Key}`)
          case 'deleteFunction':
            deleteFunctionCalls.push(params)
            return {}
          case 'deleteLayerVersion':
            deleteLayerVersionCalls.push(params)
            return {}
          case 'deleteObjects':
            deleteObjectsCalls.push(params)
            return {}
          default:
            throw new Error(`unexpected request ${service} ${method}`)
        }
      })

      const logMock = {
        info: jest.fn(),
        notice: jest.fn(),
        warning: jest.fn(),
        success: jest.fn(),
      }

      const mockServerless = {
        getProvider: jest.fn().mockReturnValue({
          request,
          isReferenceCodeStorageMode: () => true,
          getServerlessDeploymentBucketName: async () => 'deployment-bucket',
          getDeploymentPrefix: () => 'serverless',
          getStage: () => 'dev',
          resolveLayerArtifactName: (layerName) => `${layerName}.zip`,
        }),
        service: {
          service: 'svc',
          provider: {
            // 0 disables the automatic keep-window protection, so both
            // dirs are actually inspected against the pin sets below.
            deploymentBucketObject: { maxPreviousDeploymentArtifacts: 0 },
          },
          getAllFunctions: jest.fn().mockReturnValue(['hello']),
          getFunction: jest.fn().mockReturnValue({ name: FUNCTION_NAME }),
          getAllLayers: jest.fn().mockReturnValue([]),
          getLayer: jest.fn(),
          custom: {},
        },
        configSchemaHandler: { defineCustomProperties: jest.fn() },
      }

      const dryRunPlugin = new Prune(
        mockServerless,
        {
          number: 1,
          includeLayers: true,
          includeArtifacts: true,
          dryRun: true,
        },
        { log: logMock },
      )

      await dryRunPlugin.cliPrune()

      // The planned deletion (version '1') was recorded even though dryRun
      // never actually deletes anything.
      expect(dryRunPlugin.prunedFunctionVersions.get(FUNCTION_NAME)).toEqual(
        new Set(['1']),
      )

      // Nothing was actually deleted anywhere — dryRun end to end.
      expect(deleteFunctionCalls).toHaveLength(0)
      expect(deleteLayerVersionCalls).toHaveLength(0)
      expect(deleteObjectsCalls).toHaveLength(0)

      // DIR_050 (backing only the would-be-pruned version 1) is reported as
      // selected for deletion — the sweep preview reflects the post-prune
      // world, not the still-alive-today world.
      expect(logMock.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Deployment ${DIR_050} selected for deletion (dry-run).`,
        ),
      )
      // DIR_300 (backing the surviving version 2) must remain kept.
      expect(logMock.info).not.toHaveBeenCalledWith(
        expect.stringContaining(`Deployment ${DIR_300} selected for deletion`),
      )
    })
  })

  describe('sandboxes', () => {
    const IMAGE_ARN =
      'arn:aws:lambda:us-east-1:123456789012:microvm-image:test-service-echo-dev'
    let calls
    let logMock

    const awsError = (code, message = code) =>
      Object.assign(new Error(message), { providerError: { code } })

    // A deployed `echo` sandbox whose image has versions 1.0 to 4.0, 4.0 live
    const setup = ({
      functions = [],
      custom = {},
      options: pluginOptions = {},
      sandboxes = { echo: {} },
      outputs = [{ OutputKey: 'EchoImageIdentifier', OutputValue: IMAGE_ARN }],
      versions = ['1.0', '2.0', '3.0', '4.0'],
      microvms = [],
      overrides = {},
    } = {}) => {
      serverless = createMockServerless(functions, custom)
      serverless.service.sandboxes = sandboxes
      const provider = serverless.getProvider()
      provider.naming = { getStackName: () => 'test-service-dev' }
      calls = []
      const deleted = new Set()
      providerRequest.mockImplementation(async (service, method, params) => {
        calls.push({ service, method, params })
        const override = overrides[method]
        if (override) return override(params)
        switch (method) {
          case 'describeStacks':
            return { Stacks: [{ Outputs: outputs }] }
          case 'getMicrovmImage':
            return { latestActiveImageVersion: versions.at(-1) }
          case 'listMicrovmImageVersions':
            return {
              items: versions.map((v, i) => ({
                imageVersion: v,
                state: 'SUCCESSFUL',
                createdAt: new Date(Date.UTC(2026, 9, i + 1)),
              })),
            }
          case 'listMicrovms':
            return { items: microvms }
          case 'deleteMicrovmImageVersion':
            deleted.add(params.imageVersion)
            return { state: 'DELETING' }
          case 'getMicrovmImageVersion':
            if (deleted.has(params.imageVersion)) {
              throw awsError('ResourceNotFoundException')
            }
            return { state: 'SUCCESSFUL' }
          case 'listVersionsByFunction':
            return createVersionsResponse([])
          case 'listAliases':
            return createAliasResponse([])
          case 'listLayerVersions':
            return createLayerVersionsResponse([])
          default:
            return {}
        }
      })
      logMock = {
        info: jest.fn(),
        notice: jest.fn(),
        warning: jest.fn(),
        success: jest.fn(),
      }
      plugin = new Prune(serverless, pluginOptions, { log: logMock })
      plugin.sleep = jest.fn().mockResolvedValue()
      return plugin
    }

    const deletedVersions = () =>
      calls
        .filter((c) => c.method === 'deleteMicrovmImageVersion')
        .map((c) => c.params.imageVersion)

    it('prunes sandbox image versions on a plain prune run', async () => {
      setup({ options: { number: '1' } })

      await plugin.cliPrune()

      expect(deletedVersions()).toEqual(['2.0', '1.0'])
      expect(
        calls.find((c) => c.method === 'deleteMicrovmImageVersion'),
      ).toEqual({
        service: 'LambdaMicrovms',
        method: 'deleteMicrovmImageVersion',
        params: { imageIdentifier: IMAGE_ARN, imageVersion: '2.0' },
      })
      expect(logMock.info).toHaveBeenCalledWith(
        'Deleting sandbox image version echo:2.0.',
      )
      expect(logMock.success).toHaveBeenCalledWith(
        'Pruning of sandbox image versions complete',
      )
    })

    it('keeps the live version with number 0', async () => {
      setup({ options: { number: '0' } })

      await plugin.cliPrune()

      expect(deletedVersions()).toEqual(['3.0', '2.0', '1.0'])
    })

    it('deletes one version at a time, each once the previous is gone', async () => {
      setup({ options: { number: '1' } })

      await plugin.cliPrune()

      expect(
        calls
          .filter((c) =>
            ['deleteMicrovmImageVersion', 'getMicrovmImageVersion'].includes(
              c.method,
            ),
          )
          .map((c) => `${c.method}:${c.params.imageVersion}`),
      ).toEqual([
        'deleteMicrovmImageVersion:2.0',
        'getMicrovmImageVersion:2.0',
        'deleteMicrovmImageVersion:1.0',
        'getMicrovmImageVersion:1.0',
      ])
    })

    it('retries a delete while the image is still updating', async () => {
      let refusals = 2
      setup({
        options: { number: '2' },
        overrides: {
          deleteMicrovmImageVersion: () => {
            if (refusals-- > 0) {
              throw Object.assign(
                new Error('MicroVM Image is already in state: UPDATING'),
                {
                  providerError: { code: 'ConflictException', statusCode: 409 },
                },
              )
            }
            return { state: 'DELETING' }
          },
          getMicrovmImageVersion: () => {
            throw awsError('ResourceNotFoundException')
          },
        },
      })

      await plugin.cliPrune()

      expect(deletedVersions()).toEqual(['1.0', '1.0', '1.0'])
      expect(plugin.sleep).toHaveBeenCalledTimes(3)
    })

    it('gives up on a delete the image keeps refusing', async () => {
      setup({
        options: { number: '2' },
        overrides: {
          deleteMicrovmImageVersion: () => {
            throw Object.assign(
              new Error('MicroVM Image is already in state: UPDATING'),
              { providerError: { code: 'ConflictException', statusCode: 409 } },
            )
          },
        },
      })

      await expect(plugin.cliPrune()).rejects.toThrow(
        'MicroVM Image is already in state: UPDATING',
      )
    })

    it('retains versions that MicroVMs still use', async () => {
      setup({
        options: { number: '0' },
        microvms: [
          { imageVersion: '2.0', state: 'SUSPENDED' },
          { imageVersion: '1.0', state: 'TERMINATED' },
        ],
      })

      await plugin.cliPrune()

      expect(deletedVersions()).toEqual(['3.0', '1.0'])
      expect(logMock.info).toHaveBeenCalledWith(
        'Retaining sandbox image version echo:2.0: a MicroVM still uses it.',
      )
    })

    it('only lists candidates on a dry run', async () => {
      setup({ options: { number: '2', dryRun: true } })

      await plugin.cliPrune()

      expect(deletedVersions()).toEqual([])
      expect(logMock.info).toHaveBeenCalledWith(
        'echo:1.0 selected for deletion.',
      )
    })

    it('prunes only the --sandbox sandbox', async () => {
      setup({
        functions: ['api'],
        options: { number: '1', sandbox: 'echo' },
      })

      await plugin.cliPrune()

      expect(deletedVersions()).toEqual(['2.0', '1.0'])
      expect(calls.some((c) => c.method === 'listVersionsByFunction')).toBe(
        false,
      )
    })

    it('leaves sandboxes alone on a --function run', async () => {
      setup({ functions: ['api'], options: { number: '1', function: 'api' } })

      await plugin.cliPrune()

      expect(calls.some((c) => c.service === 'LambdaMicrovms')).toBe(false)
    })

    it('leaves sandboxes alone on a --layer run', async () => {
      setup({ options: { number: '1', layer: 'deps' } })
      serverless.service.getLayer = jest.fn().mockReturnValue({ name: 'deps' })

      await plugin.cliPrune()

      expect(calls.some((c) => c.service === 'LambdaMicrovms')).toBe(false)
    })

    it('refuses an undefined --sandbox before calling AWS', async () => {
      setup({ options: { number: '1', sandbox: 'missing' } })

      await expect(plugin.cliPrune()).rejects.toMatchObject({
        code: 'PRUNE_SANDBOX_NOT_FOUND',
        message:
          'Sandbox "missing" is not defined in this service. Defined sandboxes: echo.',
      })
      expect(calls).toEqual([])
    })

    it('skips a sandbox that is not deployed', async () => {
      setup({ options: { number: '1' }, outputs: [] })

      await plugin.cliPrune()

      expect(deletedVersions()).toEqual([])
      expect(logMock.info).toHaveBeenCalledWith(
        'Skipping sandbox "echo": not deployed.',
      )
    })

    it('skips every sandbox when the stack does not exist', async () => {
      setup({
        options: { number: '1' },
        overrides: {
          describeStacks: () => {
            throw new Error('Stack with id test-service-dev does not exist')
          },
        },
      })

      await plugin.cliPrune()

      expect(calls.some((c) => c.service === 'LambdaMicrovms')).toBe(false)
    })

    it('does nothing for a service without sandboxes', async () => {
      setup({ options: { number: '1' }, sandboxes: null })

      await plugin.cliPrune()

      expect(calls.some((c) => c.method === 'describeStacks')).toBe(false)
    })

    it('fails a manual run that lacks permissions', async () => {
      setup({
        options: { number: '1' },
        overrides: {
          listMicrovms: () => {
            throw awsError(
              'AccessDeniedException',
              'User is not authorized to perform: lambda:ListMicrovms',
            )
          },
        },
      })

      await expect(plugin.cliPrune()).rejects.toMatchObject({
        code: 'PRUNE_SANDBOX_ACCESS_DENIED',
        message:
          'Could not prune image versions of sandbox "echo": User is not authorized to perform: lambda:ListMicrovms Grant lambda:GetMicrovmImage, lambda:ListMicrovmImageVersions, lambda:ListMicrovms and lambda:DeleteMicrovmImageVersion to prune sandbox versions.',
      })
    })

    it('warns instead of failing an automatic run that lacks permissions', async () => {
      setup({
        custom: { prune: { automatic: true, number: 1 } },
        overrides: {
          getMicrovmImage: () => {
            throw awsError('AccessDeniedException', 'Not authorized.')
          },
        },
      })

      await plugin.postDeploy()

      expect(logMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Could not prune image versions of sandbox "echo": Not authorized.',
        ),
      )
      expect(deletedVersions()).toEqual([])
    })

    it('rethrows other errors', async () => {
      setup({
        options: { number: '1' },
        overrides: {
          getMicrovmImage: () => {
            throw awsError('InternalServerException', 'boom')
          },
        },
      })

      await expect(plugin.cliPrune()).rejects.toThrow('boom')
    })

    it('prunes sandbox image versions after deploy in automatic mode', async () => {
      setup({ custom: { prune: { automatic: true, number: 2 } } })

      await plugin.postDeploy()

      expect(deletedVersions()).toEqual(['1.0'])
    })

    describe('sandbox artifacts in the --includeArtifacts sweep', () => {
      const TEMPLATE = 'compiled-cloudformation-template.json'
      const DIR_OLD = '1792583884942-2026-10-21T11:58:04.942Z'
      const DIR_NEW = '1792584095223-2026-10-21T12:01:35.223Z'
      const OLD_ZIP = 'serverless/test-service/dev/sandboxes/echo-a1.zip'
      const NEW_ZIP = 'serverless/test-service/dev/sandboxes/echo-b2.zip'
      const keys = [
        `serverless/test-service/dev/${DIR_OLD}/${TEMPLATE}`,
        `serverless/test-service/dev/${DIR_NEW}/${TEMPLATE}`,
        OLD_ZIP,
        NEW_ZIP,
      ]
      const sweepSetup = (pluginOptions) => {
        setup({
          options: pluginOptions,
          overrides: {
            listObjectsV2: (params) => ({
              Contents: keys
                .filter((k) => k.startsWith(params.Prefix))
                .map((Key) => ({ Key })),
            }),
            getObject: (params) => ({
              Body: Buffer.from(
                params.Key.includes(DIR_OLD) ? OLD_ZIP : NEW_ZIP,
              ),
            }),
          },
        })
        serverless.getProvider().naming.getCompiledTemplateS3Suffix = () =>
          TEMPLATE
      }
      const sandboxZipDeletes = () =>
        calls
          .filter((c) => c.method === 'deleteObjects')
          .flatMap((c) => c.params.Delete.Objects.map((o) => o.Key))
          .filter((k) => k.includes('/sandboxes/'))

      it('on a real run, trusts the fresh listing over the marked folders', async () => {
        sweepSetup({ number: '0' })

        await plugin.sweepSandboxArtifacts({
          bucketName: 'test-deployment-bucket',
          markedDirs: [DIR_OLD],
        })

        // the listing still shows DIR_OLD, so its zip is kept: a real sweep
        // has deleted the folder by then and the listing no longer has it
        expect(sandboxZipDeletes()).toEqual([])
      })

      it('previews the zips of folders a dry run would mark', async () => {
        sweepSetup({ number: '0', dryRun: true })

        await plugin.sweepSandboxArtifacts({
          bucketName: 'test-deployment-bucket',
          markedDirs: [DIR_OLD],
        })

        expect(sandboxZipDeletes()).toEqual([])
        expect(logMock.info).toHaveBeenCalledWith(
          `Sandbox artifact ${OLD_ZIP} selected for deletion (dry-run).`,
        )
      })

      it('deletes a zip once its folder is gone', async () => {
        sweepSetup({ number: '0' })
        keys.splice(0, 1)

        await plugin.sweepSandboxArtifacts({
          bucketName: 'test-deployment-bucket',
          markedDirs: [],
        })

        expect(sandboxZipDeletes()).toEqual([OLD_ZIP])
      })
    })

    it('does not prune after deploy without automatic mode', async () => {
      setup({ custom: { prune: { number: 2 } } })

      await plugin.postDeploy()

      expect(deletedVersions()).toEqual([])
    })
  })
})
