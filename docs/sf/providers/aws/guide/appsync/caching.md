# Caching

AppSync supports [server-side data caching](https://docs.aws.amazon.com/appsync/latest/devguide/enabling-caching.html). You can find the caching configuration under the `appSync.caching` attribute.

## Quick start

```yaml
appSync:
  name: my-api
  caching:
    behavior: 'PER_RESOLVER_CACHING'
    type: 'SMALL'
    ttl: 3600
    atRestEncryption: false
    transitEncryption: false
```

## Configuration

- `behavior`: `FULL_REQUEST_CACHING` or `PER_RESOLVER_CACHING`
- `type`: The type of the Redis instance. `SMALL`, `MEDIUM`, `LARGE`, `XLARGE`, `LARGE_2X`, `LARGE_4X`, `LARGE_8X`, `LARGE_12X`. Defaults to `SMALL`
- `ttl`: The default TTL of the cache in seconds. Defaults to `3600`. Maximum is `3600`
- `enabled`: Boolean. Whether caching is enabled. Defaults to `true` when the `caching` definition is present.
- `atRestEncryption`: Boolean. Whether to encrypt the data at rest. Defaults to `false`
- `transitEncryption`: Boolean. Whether to encrypt the data in transit. Defaults to `false`

## Per resolver caching

See [Resolver caching](resolvers.md#caching)

## Flushing the cache

You can use the [flush-cache command](commands.md#flush-cache) to easily flush the cache.
