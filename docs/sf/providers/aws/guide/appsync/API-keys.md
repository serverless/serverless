# API Keys

When you use `API_KEY` as an [authentication method](authentication.md), you can control how API keys are created under `appSync.apiKeys`. It takes an array of API key definitions or strings.

## Quick start

```yaml
appSync:
  apiKeys:
    - john
    - name: jane
      description: Jane's API key.
      expiresAfter: 1M
```

## Configuration

It can either be string, which translates into the API key's name with default values for the other attributes, or use a custom configuration.

- `name`: A unique name for this API key. Required.
- `description`: An optional description for this API key.
- `expiresAfter`: A time after which this API key will expire. [See below](#expiry) for more details about expiry. Defaults to `365d`.
- `expiresAt`: A date-time at which this API key will expire. [See below](#expiry) for more details about expiry.
- `wafRules`: an array of [WAF rules](WAF.md) that will apply to this API key only.

## Expiry

You can control expiry of the API keys with the `expiresAfter` or `expiresAt` attribute.

`expiresAfter` behaves as a sliding-window expiry date which extends after each deployment. It can be a number of hours until expiry or a more human-friendly string. e.g. `24h`, `30d`, `3M`, `1y`.

`expiresAt` is an exact ISO datetime at which this API will expire. It will not be renewed unless you change this value. e.g. `2022-02-13T10:00:00`.

`expiresAfter` takes precedence over `expiresAt`. If neither are passed, it defaults to a `expiresAfter` of `365d`

**Note**: The minimum lifetime of an API key in AppSync is 1 day and maximum is 1 year (365 days). Expiry datetimes are always rounded down to the nearest hour. (e.g. `2022-02-13T10:45:00` becomes `2022-02-13T10:00:00`).
