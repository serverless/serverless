<!--
title: AppSync Caching
description: 'Turn on the AppSync server-side cache in serverless.yml with appSync.caching: caching behavior, instance type, TTL and flushing.'
short_title: AppSync Caching
keywords:
  [
    'Serverless Framework',
    'AppSync caching',
    'AppSync server-side cache',
    'AppSync per-resolver caching',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/caching)

<!-- DOCS-SITE-LINK:END -->

# AppSync caching

The `appSync.caching` block creates an AppSync [server-side cache](https://docs.aws.amazon.com/appsync/latest/devguide/enabling-caching.html) for the API, which returns cached resolver results instead of calling the data source again. Use it for read-heavy fields whose data can be a few seconds or minutes stale. AWS bills the cache instance by the hour while it exists, whether or not requests use it.

This configuration creates a small cache and caches only the resolvers that opt in:

```yaml
appSync:
  name: blog-api
  caching:
    behavior: PER_RESOLVER_CACHING
    type: SMALL
    ttl: 300
  resolvers:
    Query.getPost:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/getPost.js
      caching:
        ttl: 60
        keys:
          - '$context.arguments.id'
```

## Caching keys

| Key                 | Type                                                                                    | Default    | Description                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behavior`          | `FULL_REQUEST_CACHING` or `PER_RESOLVER_CACHING`                                        | Required   | `FULL_REQUEST_CACHING` caches every resolver in a request, keyed on `$context.arguments` and `$context.identity`. `PER_RESOLVER_CACHING` caches only resolvers that set [`caching`](./resolvers.md#resolver-caching). |
| `type`              | `SMALL`, `MEDIUM`, `LARGE`, `XLARGE`, `LARGE_2X`, `LARGE_4X`, `LARGE_8X` or `LARGE_12X` | `T2_SMALL` | The cache instance type. The default is a legacy instance type that AWS discourages, so set `type` explicitly. `LARGE_8X` isn't available in every Region.                                                            |
| `ttl`               | integer, 1–3600                                                                         | `3600`     | Seconds a cached result is kept, for resolvers that don't set their own `ttl`.                                                                                                                                        |
| `enabled`           | boolean                                                                                 | `true`     | Set to `false` to delete the cache while keeping the block.                                                                                                                                                           |
| `atRestEncryption`  | boolean                                                                                 | `false`    | Encrypts cached data at rest. AWS has deprecated this setting; changing it replaces the cache.                                                                                                                        |
| `transitEncryption` | boolean                                                                                 | `false`    | Encrypts traffic to the cache. AWS has deprecated this setting; changing it replaces the cache.                                                                                                                       |

Per-resolver TTLs and cache keys are set on each resolver; see [Resolver caching](./resolvers.md#resolver-caching).

## Flush the AppSync cache

To empty the cache without waiting for entries to expire, run [`serverless appsync flush-cache`](./commands.md#flush-the-cache) in the service directory:

```bash
serverless appsync flush-cache --stage dev
```

## Related pages

- [AppSync resolvers](./resolvers.md)
- [AppSync CLI commands](./commands.md)
- [AppSync API configuration](./general-config.md)
