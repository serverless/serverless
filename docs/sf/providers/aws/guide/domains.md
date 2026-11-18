<!--
title: Custom Domains for APIs and Web Apps
description: 'Serve API Gateway APIs and web apps on your own domain with provider.domain: ACM certificates, Route 53 records, base paths, edge and regional endpoints.'
short_title: Custom Domains
keywords:
  [
    'Serverless Framework',
    'API Gateway custom domain',
    'Route 53',
    'ACM certificate',
    'base path mapping',
    'serverless-domain-manager',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/domains)

<!-- DOCS-SITE-LINK:END -->

# Custom Domains for APIs and Web Apps

The `provider.domain` and `provider.domains` keys serve the service's API Gateway APIs (HTTP, REST and WebSocket) and [web apps](./web-apps.md) on your own domain name, such as `api.example.com`. On `serverless deploy`, the Framework finds or requests the ACM certificate, creates the API Gateway custom domain, creates the Route 53 DNS records, and maps the domain to the API. Web apps are served through Amazon CloudFront instead; see [Web apps](#web-apps). The feature is built in: no plugin is needed.

This `serverless.yml` serves an HTTP API at `https://api.example.com`:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  domain: api.example.com

functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          path: /
          method: get
```

```bash
serverless deploy
```

The deploy output lists the domain, its target (the API Gateway domain name) and the target's hosted zone ID:

```text
domain:
  name: api.example.com
  target: d-abcdefghij.execute-api.us-east-1.amazonaws.com
  zone id: Z1UJRXOUMOOFQ8
```

The fully automatic setup needs the domain's DNS in a Route 53 hosted zone that the deploy credentials (or `route53Profile`) can read and change. For a domain whose DNS is elsewhere, see [Third-party registrar setup](#third-party-registrar-setup). A new domain can take several minutes to become reachable while DNS changes propagate.

## How the Framework sets up a domain

For each domain entry, `serverless deploy` runs these steps:

1. Before the stack deploy, the Framework finds an ACM certificate for the domain, or requests one and adds its DNS validation records to Route 53 (see [Certificates](#certificates)).
2. It creates the API Gateway custom domain, with the tags in `provider.stackTags` and `provider.tags`. When the domain exists, it updates `securityPolicy` and `accessMode` if you set them and they differ; it leaves the other settings of an existing domain unchanged.
3. Unless `createRoute53Record` is `false`, it creates or updates the Route 53 alias records that point the domain at API Gateway.
4. It waits up to `autoDomainWaitFor` seconds (default 120) for a new domain to exist, then deploys the stack, including the API.
5. After the stack deploy, it creates or updates the API mapping between the domain, the base path and the API's stage.

Steps 1 to 4 run only when `autoDomain` is `true` (the default). `serverless deploy function` doesn't run any of them.

`serverless remove` deletes the API mapping, then the custom domain and, unless `createRoute53Record` is `false`, its Route 53 records. It keeps the domain when `autoDomain` is `false`, or when `preserveExternalPathMappings` is `true` and other APIs still map to the domain. ACM certificates and their validation records are never deleted, so a later deploy reuses the certificate.

The Framework calls API Gateway and ACM with the deploy credentials and Region, and Route 53 with the `route53Profile` and `route53Region` settings when they are set. Without `route53Profile`, `serverless deploy` calls Route 53 with the deploy credentials, while `serverless remove` uses the AWS SDK's default credential chain (environment variables, the default profile) to delete the records.

## Domain entries

`provider.domain` takes one entry and `provider.domains` a list; you can set both. An entry is a domain name, or an object with `name` and the other [domain settings](#domain-settings).

### Single domain

```yaml
provider:
  name: aws
  domain: api.example.com
```

The object form sets more options:

```yaml
provider:
  name: aws
  domain:
    name: api.example.com
    basePath: v1
    apiType: http
    endpointType: regional
```

### Domain per stage

To use a different domain in each stage, set the domain with a [stage parameter](../../../guides/parameters.md):

```yaml
params:
  dev:
    domain: api.example.dev
  prod:
    domain: api.example.com

provider:
  name: aws
  domain: ${param:domain}
```

### Multiple domains

A service can serve the same API on several domains, and each API type on its own domain. A service has at most one API of each type, so `apiType` selects the API:

```yaml
provider:
  name: aws
  domains:
    - name: api.example.com
      apiType: http
      basePath: v1
    - name: api-staging.example.com
      apiType: http
      basePath: v1
    - name: websocket.example.com
      apiType: websocket
    - name: admin.example.com
      apiType: rest
      basePath: admin
```

An entry can also hold one configuration per API type, under the keys `http`, `rest` and `websocket`; each is a full entry with its own `name`:

```yaml
provider:
  name: aws
  domain:
    http:
      name: api.example.com
    websocket:
      name: ws.example.com
```

## API types

`apiType` selects the API the domain maps to: `http` (the [`httpApi` event](../events/http-api.md)), `rest` (the [`http` event](../events/apigateway.md)) or `websocket` (the [`websocket` event](../events/websocket.md)). When you omit it, the Framework detects the API type from the APIs the service creates: the type of its only API, or `http` when it creates none. For an existing API set with `provider.apiGateway.restApiId` or `websocketApiId`, set `apiType`. A service with more than one API type needs `apiType` on every entry; without it the deploy stops with `Multiple API types detected in CloudFormation template`.

The domain maps to the API the service creates, or to the API in `provider.apiGateway.restApiId` or `provider.apiGateway.websocketApiId`. For HTTP APIs the mapping always targets the `$default` stage, so leave `stage` unset: with `stage` and a `basePath` set, `serverless remove` doesn't find the mapping and skips deleting it. For REST and WebSocket APIs it targets the service stage, or the stage in the entry's `stage` key.

## Base path mapping

`basePath` maps the API under a path of the domain:

```yaml
provider:
  name: aws
  domain:
    name: api.example.com
    basePath: v1

functions:
  users:
    handler: handler.users
    events:
      - httpApi:
          path: /users
          method: get
```

The API is then available at `https://api.example.com/v1/users`. API Gateway strips the base path before the request reaches the API: the route is `/users`, and requests to `/v1/users` match it. Without `basePath`, the API is mapped at the root of the domain.

The Framework removes leading and trailing slashes from `basePath`. `ping` and `sping` are reserved by API Gateway; the Framework prints a warning for them. A REST API with a multi-level base path, such as `v1/users`, is managed through API Gateway's V2 APIs, which limits `securityPolicy` and `accessMode` (see [Security policy and access mode](#security-policy-and-access-mode)).

On entries with `webApp`, `basePath` routes by path instead and forwards the path unchanged; see [Routing web apps by path](#routing-web-apps-by-path).

## Endpoint types

`endpointType` is `regional` (the default) or `edge`:

- `regional`: API Gateway serves the domain in the service's Region. The ACM certificate must be in that Region.
- `edge`: API Gateway serves the domain through an edge-optimized endpoint backed by Amazon CloudFront. Edge endpoints are available for REST APIs only; `edge` with `apiType: http` or `websocket` stops the deploy. The ACM certificate must be in `us-east-1`, whatever Region the service deploys to.

```yaml
provider:
  name: aws
  domain:
    name: api.example.com
    apiType: rest
    endpointType: edge
```

## Certificates

When an entry has no `certificateArn`, the Framework looks up an ACM certificate in the service's Region (`regional`) or in `us-east-1` (`edge`):

- It considers certificates that are issued or pending validation, with RSA or ECDSA keys, whose names cover the domain: the exact name, or a wildcard one level above it (`*.example.com` covers `api.example.com`).
- An exact name wins over a wildcard, an issued certificate over a pending one, and then the latest expiry.
- With `certificateName`, it instead picks a certificate whose primary domain name equals `certificateName`, and never requests one.

When no certificate matches and the domain is in a Route 53 hosted zone, the Framework requests a certificate for the domain name only, with DNS validation, adds the validation records to the hosted zone and waits up to 10 minutes for the certificate to be issued. ACM renews it automatically. When the domain isn't in a Route 53 hosted zone, the deploy stops; create the certificate yourself (see [Third-party registrar setup](#third-party-registrar-setup)).

## DNS records

Unless `createRoute53Record` is `false`, the Framework creates Route 53 alias records named after the domain that point at the API Gateway domain name: an A record and, unless `createRoute53IPv6Record` is `false`, an AAAA record.

The Framework finds the hosted zone by name: the zone with the longest name that equals the domain or ends its parent domain (`example.com` for `api.example.com`). It considers public and private zones; `hostedZonePrivate: true` or `false` limits the lookup to one kind, and `hostedZoneId` skips the lookup. With `splitHorizonDns: true`, the Framework creates the records in both the public and the private zone of the domain.

To route traffic between deployments of the same domain in several Regions, set `route53Params`:

```yaml
provider:
  name: aws
  domain:
    name: api.example.com
    endpointType: regional
    route53Params:
      routingPolicy: latency # simple (default), latency or weighted
      setIdentifier: api-${aws:region} # default: the API Gateway domain name
      healthCheckId: abcdef12-3456-7890-abcd-ef1234567890 # optional
```

`latency` and `weighted` routing need a regional endpoint. A latency record's Region is `route53Region` when set, otherwise the deploy Region. A weighted record uses `weight` (default `200`). Other keys under `route53Params` are ignored.

## IPv6

Custom domains accept IPv4 traffic by default. To make a domain reachable over IPv6 as well, set `createRoute53IPv6Record: true` explicitly:

```yaml
provider:
  name: aws
  domain:
    name: api.example.com
    createRoute53IPv6Record: true
```

The Framework then creates the domain with the dualstack IP address type, so it accepts both IPv4 and IPv6 traffic, and adds A and AAAA records unless `createRoute53Record` is `false`.

- The setting applies when the Framework creates the domain. To add IPv6 to a domain that already exists, [change its IP address type in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-custom-domain-ip-address-type.html). Later deploys keep the type the domain has.
- Clients that support IPv6 connect over it once the domain accepts it. If a resource policy or AWS WAF rule allows or blocks callers by IP address, make sure it also covers their IPv6 addresses.

## Security policy and access mode

`securityPolicy` sets the TLS versions and ciphers the domain accepts: `TLS_1_0`, `TLS_1_2` (the default) or an enhanced policy starting with `SecurityPolicy_`, such as `SecurityPolicy_TLS13_1_3_2025_09`. AWS lists the policies in [supported security policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies-list.html).

`accessMode` (`basic` or `strict`) sets the endpoint access mode that enhanced policies require. These rules apply:

- Domains managed through API Gateway's V2 APIs accept only `securityPolicy: TLS_1_2` and no `accessMode`. That is every `http` and `websocket` domain, and a `rest` domain with a multi-level `basePath` such as `v1/test`.
- `accessMode` requires an enhanced `SecurityPolicy_*` policy.
- When the domain exists, the Framework updates only the `securityPolicy` and `accessMode` you set. For a V2 domain it sends the certificate from `certificateArn`, or the domain's current certificate, with the update.

```yaml
provider:
  name: aws
  domain:
    name: api.example.com
    apiType: rest
    basePath: v1
    securityPolicy: SecurityPolicy_TLS13_1_3_2025_09
    accessMode: strict
```

## Domain settings

Every setting of a domain entry follows. `enabled`, `autoDomain`, `createRoute53Record`, `createRoute53IPv6Record`, `preserveExternalPathMappings` and `splitHorizonDns` also accept the strings `"true"`, `"false"`, `"1"` and `"0"`, which helps with variables; any other string stops the deploy with `domains: Ambiguous boolean config`. The configuration schema accepts a string only for `enabled`, so for the others a string gets a configuration warning, or stops the deploy when `configValidationMode` is `error`.

| Setting                        | Type    | Default                | Description                                                                                                                                                                                                                              |
| ------------------------------ | ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                         | string  | Required               | The domain name, such as `api.example.com`.                                                                                                                                                                                              |
| `basePath`                     | string  | None (the root)        | The path the API is mapped under. See [Base path mapping](#base-path-mapping).                                                                                                                                                           |
| `apiType`                      | string  | Detected               | `http`, `rest` or `websocket`. See [API types](#api-types).                                                                                                                                                                              |
| `stage`                        | string  | The service stage      | REST and WebSocket APIs: the API stage the mapping targets. HTTP API mappings always target `$default`.                                                                                                                                  |
| `endpointType`                 | string  | `regional`             | `regional` or `edge` (REST APIs only).                                                                                                                                                                                                   |
| `certificateArn`               | string  | Looked up              | The ARN of the ACM certificate to use. See [Certificates](#certificates).                                                                                                                                                                |
| `certificateName`              | string  | None                   | The primary domain name of the ACM certificate to use instead of matching `name`. A certificate is never requested when this is set.                                                                                                     |
| `createRoute53Record`          | boolean | `true`                 | Creates the Route 53 alias records. Set `false` for DNS outside Route 53.                                                                                                                                                                |
| `createRoute53IPv6Record`      | boolean | `true`                 | Creates the AAAA record. An explicit `true` also creates the domain as dualstack. See [IPv6](#ipv6).                                                                                                                                     |
| `hostedZoneId`                 | string  | Looked up              | The Route 53 hosted zone for the records.                                                                                                                                                                                                |
| `hostedZonePrivate`            | boolean | Both kinds             | Looks up only private (`true`) or only public (`false`) hosted zones.                                                                                                                                                                    |
| `splitHorizonDns`              | boolean | `false`                | Creates the records in both the public and the private hosted zone. Ignored when `hostedZoneId` is set or `hostedZonePrivate` is `true`.                                                                                                 |
| `route53Profile`               | string  | The deploy credentials | An AWS profile from your AWS shared config and credentials files, for Route 53 calls: hosted zone lookup, alias records and certificate validation records. Without it, `serverless remove` uses the AWS SDK's default credential chain. |
| `route53Region`                | string  | The deploy Region      | The Region of the Route 53 client, and of latency records.                                                                                                                                                                               |
| `route53Params`                | object  | Simple routing         | `routingPolicy` (`simple`, `latency` or `weighted`), `setIdentifier`, `weight` (default `200`) and `healthCheckId`. See [DNS records](#dns-records).                                                                                     |
| `securityPolicy`               | string  | `TLS_1_2`              | `TLS_1_0`, `TLS_1_2` or a `SecurityPolicy_*` policy. See [Security policy and access mode](#security-policy-and-access-mode).                                                                                                            |
| `accessMode`                   | string  | None                   | `basic` or `strict`. REST domains with a single-level base path and an enhanced `securityPolicy` only.                                                                                                                                   |
| `tlsTruststoreUri`             | string  | None                   | The S3 URI of the truststore for mutual TLS, such as `s3://bucket-name/truststore.pem`. Regional endpoints only; the object must exist.                                                                                                  |
| `tlsTruststoreVersion`         | string  | None                   | The S3 object version ID of the truststore.                                                                                                                                                                                              |
| `enabled`                      | boolean | `true`                 | With `false`, the Framework ignores the entry.                                                                                                                                                                                           |
| `autoDomain`                   | boolean | `true`                 | Creates or updates the domain before each deploy and deletes it on remove. With `false`, the domain must already exist; the Framework manages only the API mapping.                                                                      |
| `autoDomainWaitFor`            | string  | `'120'`                | Seconds to wait for a new domain to exist before the stack deploy.                                                                                                                                                                       |
| `allowPathMatching`            | boolean | `false`                | Finds the existing API mapping to update by `basePath` instead of by API ID, for example to move a domain from a REST API to an HTTP API.                                                                                                |
| `preserveExternalPathMappings` | boolean | `false`                | On `serverless remove`, keeps the domain when API mappings of other APIs still use it.                                                                                                                                                   |
| `webApp`                       | string  | None                   | The name of a web app under `webApps` to serve on this domain through CloudFront. See [Web apps](#web-apps).                                                                                                                             |

## Third-party registrar setup

For a domain whose DNS isn't in Route 53, create the certificate and the DNS record yourself:

1. In AWS Certificate Manager, request a public certificate for the domain in the service's Region (in `us-east-1` for `endpointType: edge`), with DNS validation.
2. Add the validation CNAME records that ACM shows at your DNS provider, and wait for the certificate status to be **Issued**.
3. In `serverless.yml`, set `createRoute53Record: false`. Optionally set the certificate's ARN in `certificateArn`; without it, the Framework finds the certificate by name:

   ```yaml
   provider:
     name: aws
     domain:
       name: api.example.com
       certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
       createRoute53Record: false
   ```

4. Run `serverless deploy`. The deploy output lists the domain's `target`, such as `d-abcdefghij.execute-api.us-east-1.amazonaws.com`.
5. At your DNS provider, create a CNAME record for the domain with the `target` as its value.

## Web apps

An entry with `webApp` serves one of the service's [web apps](./web-apps.md) on the hostname. The Framework puts an Amazon CloudFront distribution in front of the web app, finds or requests an ACM certificate in `us-east-1` (CloudFront's certificate Region, whatever Region the service deploys to), and creates Route 53 A and AAAA alias records for the distribution.

```yaml
service: shop

provider:
  name: aws
  domain:
    name: shop.example.com
    webApp: web

webApps:
  web:
    entry: src/server.ts
```

`serverless deploy` and `serverless info` list `https://shop.example.com` under `endpoints` next to the web app's own endpoint. The first deploy with a new hostname takes several minutes while the certificate is issued and the distribution is created. `serverless remove` deletes the distribution and the A and AAAA records; the certificate and its DNS validation record stay, as they do for API Gateway custom domains, so a later deploy reuses the certificate.

### Routing web apps by path

Several entries for the same hostname route paths to different web apps of the service:

```yaml
provider:
  name: aws
  domains:
    - name: shop.example.com
      webApp: web # every path the other entries don't match
    - name: shop.example.com
      basePath: api # /api and /api/*
      webApp: api

webApps:
  web:
    entry: src/web.ts
  api:
    entry: src/api.ts # defines its routes under /api
```

Each hostname needs one entry without `basePath`, which receives every path no other entry matches. An entry with `basePath: api` receives `/api` and every path under `/api/`. The longest matching `basePath` wins: with entries for `api` and `api/v2`, `/api/v2/orders` reaches the `api/v2` web app.

The two kinds of entries treat `basePath` differently:

| Entry                                | Request to `https://shop.example.com/api/users` reaches |
| ------------------------------------ | ------------------------------------------------------- |
| `basePath: api` with `webApp: api`   | the web app as `/api/users` (forwarded unchanged)       |
| `basePath: api` with `apiType: http` | the API as `/users` (base path stripped)                |

### Rules for web app entries

- A hostname serves either web apps or API Gateway APIs. A hostname that already exists as an API Gateway custom domain in the account stops the deploy before anything changes.
- Hostnames are case-insensitive: `Shop.Example.com` and `shop.example.com` name the same hostname, and the Framework uses the lowercase form.
- Certificate and DNS settings (`certificateArn`, `certificateName`, `createRoute53Record`, `createRoute53IPv6Record`, `hostedZoneId`, `hostedZonePrivate`, `splitHorizonDns`, `route53Profile`, `route53Region`, `route53Params`) apply to the whole hostname. Set them on the entry without `basePath`; an entry with `basePath` may only repeat the same values, and a different value stops the deploy.
- The API Gateway options (`apiType`, `endpointType`, `securityPolicy`, `accessMode`, `allowPathMatching`, `preserveExternalPathMappings`, `autoDomain`, `autoDomainWaitFor`, `tlsTruststoreUri`, `tlsTruststoreVersion`, `rest`, `http`, `websocket`) are not accepted on entries with `webApp`.
- For a domain whose DNS is not in Route 53, set `createRoute53Record: false` and create or import an ACM certificate in `us-east-1` that covers the hostname; the deploy finds it by hostname, or you can name it in `certificateArn`. Then point a CNAME record at the distribution's domain name, which `serverless info --verbose` prints as a stack output ending in `CloudFrontDistributionDomainName`.
- A web app served on a domain cannot set `url.authorizer`: its endpoint requires the signed requests CloudFront sends, and unsigned direct requests get HTTP 403. Authenticate users in the app.

Behind CloudFront, a response must start within the web app's `timeout` plus 5 seconds, and never later than 120 seconds. See [Custom domains](./web-apps.md#custom-domains) in the web apps guide for the timeout, retry and header details.

## Troubleshooting custom domains

### `Could not find an in-date certificate for '...'`

```text
Unable to create domain 'api.example.com':
Could not find an in-date certificate for 'api.example.com'.
```

No issued or pending ACM certificate in the lookup Region covers the domain, and the Framework didn't request one: the domain has no Route 53 hosted zone, or `certificateName` is set. For an `edge` endpoint, the message adds that the certificate must be in `us-east-1`. Create the certificate in the right Region (see [Certificates](#certificates)), or move the domain's DNS to a Route 53 hosted zone.

### `Could not find hosted zone '...'`

```text
Unable to create domain 'api.example.com':
Could not find hosted zone 'api.example.com'
```

The Framework found no Route 53 hosted zone for the domain or its parent domain with the credentials it uses for Route 53 (`route53Profile`, or the deploy credentials). Set `hostedZoneId`, check `hostedZonePrivate`, or set `createRoute53Record: false` and create the DNS record yourself.

### The domain doesn't respond after deploy

DNS changes can take time to reach your resolver, and API Gateway can take several minutes to initialize a new domain. Check that the alias records exist in the hosted zone and that `dig api.example.com` returns them, and that the API mapping in API Gateway points to the right API and stage.

## Related

- [HTTP API events](../events/http-api.md), [REST API events](../events/apigateway.md) and [WebSocket API events](../events/websocket.md)
- [Web apps](./web-apps.md)
- [Custom domain names in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.html)

The built-in custom domains feature is based on the [Serverless Domain Manager plugin](https://github.com/amplify-education/serverless-domain-manager) by Amplify Education.
