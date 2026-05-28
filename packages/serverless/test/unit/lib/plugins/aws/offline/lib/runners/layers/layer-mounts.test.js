import {
  buildLayerMount,
  layerEnvFor,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/runners/layers/layer-mounts.js'

describe('buildLayerMount', () => {
  it('builds a read-only /opt mount descriptor', () => {
    const mount = buildLayerMount({
      optDir: '/cache/layers/abc',
      servicePath: '/svc',
    })
    expect(mount).toEqual({
      source: '/cache/layers/abc',
      target: '/opt',
      mode: 'ro',
      readOnly: true,
      bind: '/cache/layers/abc:/opt:ro',
    })
  })

  it('rewrites the source for dockerHostServicePath when under the service path', () => {
    const mount = buildLayerMount({
      optDir: '/svc/.serverless-offline/layers/abc',
      servicePath: '/svc',
      dockerHostServicePath: '/host/svc',
    })
    expect(mount.source).toBe('/host/svc/.serverless-offline/layers/abc')
    expect(mount.bind).toBe('/host/svc/.serverless-offline/layers/abc:/opt:ro')
  })
})

describe('layerEnvFor', () => {
  it('prefixes NODE_PATH with the /opt node module paths for nodejs runtimes', () => {
    expect(layerEnvFor('nodejs20.x')).toEqual({
      NODE_PATH_PREFIX:
        '/opt/nodejs/node_modules:/opt/nodejs/node20/node_modules',
    })
    expect(layerEnvFor('nodejs18.x')).toEqual({
      NODE_PATH_PREFIX:
        '/opt/nodejs/node_modules:/opt/nodejs/node18/node_modules',
    })
  })

  it('returns no env change for non-node runtimes', () => {
    expect(layerEnvFor('python3.12')).toEqual({})
    expect(layerEnvFor('ruby3.3')).toEqual({})
    expect(layerEnvFor('java21')).toEqual({})
    expect(layerEnvFor('provided.al2023')).toEqual({})
    expect(layerEnvFor(undefined)).toEqual({})
  })
})
