<!--
title: AppSync API Keys
description: Create AppSync API keys in serverless.yml with appSync.apiKeys, set their expiry and read their values after deploy.
short_title: AppSync API Keys
keywords:
  [
    'Serverless Framework',
    'AppSync API key',
    'AppSync API key expiration',
    'x-api-key',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/API-keys)

<!-- DOCS-SITE-LINK:END -->

# AppSync API keys

The `appSync.apiKeys` list creates the AppSync API keys that clients send in the `x-api-key` header. The Framework creates them only when `API_KEY` is the default or an additional [authorization mode](./authentication.md); without an `apiKeys` list, it creates no key.

This configuration creates two keys: `mobileApp` with the default expiry of 365 days, and `partner` with a description and a 30-day expiry:

```yaml
appSync:
  name: blog-api
  authentication:
    type: API_KEY
  apiKeys:
    - mobileApp
    - name: partner
      description: Key for the partner integration
      expiresAfter: 30d
```

`serverless deploy` and `serverless info` print each key's value with its description under `appsync api keys`; add `--conceal` to leave the values out of the output. To pass a key's value to a function or resource, use [`${appsync:apiKey.NAME}`](./README.md#appsync-variables).

## API key settings

Each entry in `apiKeys` is either a string, which is the key's name with default settings, or an object with these keys:

| Key            | Type                      | Default          | Description                                                                                               |
| -------------- | ------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `name`         | string                    | Required         | A unique name for the key, used in `${appsync:apiKey.NAME}` and in the CloudFormation logical ID.         |
| `description`  | string                    | The key's `name` | The description shown in the AppSync console and in the deploy output.                                    |
| `expiresAfter` | string or number          | `365d`           | How long after the deploy the key expires. See [API key expiry](#api-key-expiry).                         |
| `expiresAt`    | ISO 8601 date-time string | None             | The exact date and time the key expires.                                                                  |
| `wafRules`     | list                      | None             | WAF rules that apply only to requests with this key. See [Per-API-key rules](./WAF.md#per-api-key-rules). |

Renaming a key replaces it: the old key is deleted and the new one gets a new value. Removing an entry deletes that key on the next deploy.

## API key expiry

The `expiresAfter` and `expiresAt` keys set when an API key expires. AppSync accepts an expiry between 1 day and 365 days from the time of the deploy, and rounds it down to the start of the hour.

`expiresAfter` is a sliding expiry: on every deploy, the Framework sets the expiry to the start of the current UTC hour plus the duration, so a service deployed more often than the duration keeps its keys valid. The key's value doesn't change when its expiry does. The duration is a number of hours (`48`) or a number followed by a unit:

| Unit | Meaning                         | Example      |
| ---- | ------------------------------- | ------------ |
| `y`  | years (`1y` counts as 365 days) | `1y`         |
| `q`  | quarters                        | `2q`         |
| `M`  | months                          | `3M`         |
| `w`  | weeks                           | `4w`         |
| `d`  | days                            | `30d`        |
| `h`  | hours                           | `36h`        |
| `m`  | minutes                         | `1500m`      |
| `s`  | seconds                         | `90000s`     |
| `ms` | milliseconds                    | `90000000ms` |

A duration of 24 to 25 hours is extended to 25 hours, so that the rounded expiry stays above the 1-day minimum.

`expiresAt` is a fixed date and time, such as `2027-02-13T10:00:00Z`. The key expires then, whatever the deploy date, and the Framework doesn't extend it; change the value and deploy to extend it.

When both are set, `expiresAfter` wins. When neither is set, the key expires 365 days after the deploy. An expiry less than 1 day after the deploy stops the command with:

```text
Api Key partner must be valid for a minimum of 1 day and a maximum of 365 days.
```

## Related pages

- [AppSync authentication](./authentication.md)
- [AppSync WAF](./WAF.md)
- [Authorization and authentication in AWS AppSync](https://docs.aws.amazon.com/appsync/latest/devguide/security-authz.html)
