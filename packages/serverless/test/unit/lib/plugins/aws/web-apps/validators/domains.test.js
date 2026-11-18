import { describe, expect, it } from '@jest/globals'
import { validateWebAppDomains } from '../../../../../../../lib/plugins/aws/web-apps/validators/domains.js'

const webApps = { shop: { entry: 'src/server.ts' }, api: { entry: 'api.ts' } }

const run = ({ domain, domains, apps = webApps }) =>
  validateWebAppDomains({ domain, domains, webApps: apps })

describe('validateWebAppDomains', () => {
  it('returns no messages without web-app entries', () => {
    expect(
      run({ domains: ['api.example.com', { name: 'x.example.com' }] }),
    ).toEqual([])
  })

  it('passes a hostname with a root entry and basePath entries', () => {
    expect(
      run({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'shop.example.com', webApp: 'api', basePath: '/api' },
          { name: 'other.example.com', apiType: 'http' },
        ],
      }),
    ).toEqual([])
  })

  it.each([{}, { name: '' }, { domainName: '' }])(
    'rejects a webApp entry without a hostname (%p)',
    (hostname) => {
      expect(
        run({
          domains: [
            { name: 'shop.example.com', webApp: 'shop' },
            { webApp: 'api', ...hostname },
          ],
        }),
      ).toEqual([
        'provider.domains[1] (webApp: api) needs a hostname. Set name to the domain to serve it on.',
      ])
    },
  )

  it('rejects an unknown web app', () => {
    expect(
      run({ domains: [{ name: 'shop.example.com', webApp: 'shp' }] }),
    ).toEqual([
      'provider.domains[0].webApp: no web app named "shp" in this service. Web apps: shop, api.',
    ])
  })

  it.each([{ name: 'api' }, 5, ['api']])(
    'rejects a webApp that is not a name (%p)',
    (webApp) => {
      expect(
        run({
          domains: [
            { name: 'shop.example.com', webApp: 'shop' },
            { name: 'api.example.com', webApp },
          ],
        }),
      ).toEqual([
        'provider.domains[1].webApp must be the name of a web app in this service. Web apps: shop, api.',
      ])
    },
  )

  it('does not also ask for a hostname when webApp is not a name', () => {
    expect(
      run({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { webApp: { name: 'api' } },
        ],
      }),
    ).toEqual([
      'provider.domains[1].webApp must be the name of a web app in this service. Web apps: shop, api.',
    ])
  })

  it.each([5, true, { path: '/api' }])(
    'rejects a basePath that is not a string (%p)',
    (basePath) => {
      expect(
        run({
          domains: [
            { name: 'shop.example.com', webApp: 'shop' },
            { name: 'shop.example.com', webApp: 'api', basePath },
          ],
        }),
      ).toEqual([
        'provider.domains[1].basePath must be a path, for example /api.',
      ])
    },
  )

  it('skips domain entries that are not objects', () => {
    expect(
      run({
        domains: [null, 5, { name: 'shop.example.com', webApp: 'shop' }],
      }),
    ).toEqual([])
    expect(run({ domains: [null, 'api.example.com'] })).toEqual([])
  })

  it('names provider.domain for the single-domain key', () => {
    expect(
      run({
        domain: { name: 'shop.example.com', webApp: 'shp' },
        domains: [{ name: 'other.example.com', webApp: 'shop' }],
      }),
    ).toEqual([
      'provider.domain.webApp: no web app named "shp" in this service. Web apps: shop, api.',
    ])
  })

  it('rejects a web app with url.authorizer once', () => {
    expect(
      run({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'www.example.com', webApp: 'shop' },
        ],
        apps: { shop: { entry: 'a.ts', url: { authorizer: 'aws_iam' } } },
      }),
    ).toEqual([
      'webApps.shop.url.authorizer cannot be combined with a custom domain. CloudFront signs requests to the endpoint; authenticate users in your app.',
    ])
  })

  it('rejects a hostname that has both webApp and API Gateway entries', () => {
    expect(
      run({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'shop.example.com', apiType: 'http', basePath: 'v1' },
          { http: { name: 'shop.example.com' } },
        ],
      }),
    ).toEqual([
      'shop.example.com has both API Gateway and web app entries, and a hostname serves either API Gateway APIs or web apps. Use another hostname for the web apps.',
    ])
  })

  it('rejects two entries with the same hostname and basePath', () => {
    expect(
      run({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'shop.example.com', webApp: 'shop', basePath: 'api' },
          { name: 'shop.example.com', webApp: 'api', basePath: '/api/' },
        ],
      }),
    ).toEqual([
      'provider.domains has two entries for shop.example.com with basePath "/api/". Give each web app its own basePath.',
    ])
  })

  it('rejects a hostname without an entry that has no basePath', () => {
    expect(
      run({
        domains: [
          { name: 'shop.example.com', webApp: 'shop', basePath: 'app' },
          { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        ],
      }),
    ).toEqual([
      'Domain shop.example.com has only basePath entries, so requests to other paths (like /) have no web app to go to. Add an entry for shop.example.com without basePath.',
    ])
  })

  it('accepts createRoute53Record: false without certificateArn', () => {
    // The deploy finds the certificate by hostname, as for API Gateway domains
    expect(
      run({
        domains: [
          {
            name: 'shop.example.com',
            webApp: 'shop',
            createRoute53Record: false,
          },
          {
            name: 'www.example.com',
            webApp: 'shop',
            createRoute53Record: 'false',
          },
        ],
      }),
    ).toEqual([])
  })

  it('rejects API Gateway-only fields on webApp entries', () => {
    expect(
      run({
        domains: [
          {
            name: 'shop.example.com',
            webApp: 'shop',
            apiType: 'rest',
            endpointType: 'EDGE',
          },
        ],
      }),
    ).toEqual([
      'provider.domains[0].apiType applies to API Gateway domains only. Remove it from entries with webApp.',
      'provider.domains[0].endpointType applies to API Gateway domains only. Remove it from entries with webApp.',
    ])
  })

  it('ignores disabled entries for the routing rules', () => {
    expect(
      run({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'shop.example.com', webApp: 'shp', enabled: false },
          {
            name: 'shop.example.com',
            webApp: 'api',
            basePath: 'api',
            enabled: false,
          },
          { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        ],
      }),
    ).toEqual([])
  })

  it('accepts provider.domains as a single object', () => {
    expect(
      run({ domains: { name: 'shop.example.com', webApp: 'shp' } }),
    ).toEqual([
      'provider.domains.webApp: no web app named "shp" in this service. Web apps: shop, api.',
    ])
  })

  describe('hostname-level settings on basePath entries', () => {
    it.each([
      ['certificateArn', 'arn:aws:acm:us-east-1:1:certificate/a'],
      ['certificateName', 'shop'],
      ['createRoute53Record', true],
      ['createRoute53IPv6Record', false],
      ['route53Profile', 'dns'],
      ['route53Region', 'us-west-2'],
      ['route53Params', { routingPolicy: 'simple' }],
      ['hostedZoneId', 'Z1'],
      ['hostedZonePrivate', true],
      ['splitHorizonDns', true],
    ])('rejects %s that differs from the root entry', (key, value) => {
      expect(
        run({
          domains: [
            { name: 'shop.example.com', webApp: 'shop' },
            {
              name: 'shop.example.com',
              webApp: 'api',
              basePath: 'api',
              [key]: value,
            },
          ],
        }),
      ).toEqual([
        `provider.domains[1] (shop.example.com) sets ${key} on an entry with basePath; set it on the entry for shop.example.com without basePath.`,
      ])
    })

    it('accepts a basePath entry that repeats the root entry value', () => {
      expect(
        run({
          domains: [
            {
              name: 'shop.example.com',
              webApp: 'shop',
              route53Params: { routingPolicy: 'simple' },
              hostedZoneId: 'Z1',
            },
            {
              name: 'shop.example.com',
              webApp: 'api',
              basePath: 'api',
              route53Params: { routingPolicy: 'simple' },
              hostedZoneId: 'Z1',
            },
          ],
        }),
      ).toEqual([])
    })
  })

  describe('hostname case', () => {
    it('groups hostnames that differ only in case', () => {
      expect(
        run({
          domains: [
            { name: 'Shop.Example.com', webApp: 'shop' },
            { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
          ],
        }),
      ).toEqual([])
    })

    it('finds duplicate basePaths across case', () => {
      expect(
        run({
          domains: [
            { name: 'shop.example.com', webApp: 'shop' },
            { name: 'SHOP.example.com', webApp: 'api' },
          ],
        }),
      ).toEqual([
        'provider.domains has two entries for shop.example.com with basePath "/". Give each web app its own basePath.',
      ])
    })

    it('finds an API Gateway entry on the same hostname in another case', () => {
      expect(
        run({
          domains: [
            { name: 'shop.example.com', webApp: 'shop' },
            { name: 'Shop.Example.com', apiType: 'http' },
          ],
        }),
      ).toEqual([
        'shop.example.com has both API Gateway and web app entries, and a hostname serves either API Gateway APIs or web apps. Use another hostname for the web apps.',
      ])
    })
  })
})
