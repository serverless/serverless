<!--
title: Telemetry and notifications
menuText: Telemetry and notifications
layout: Doc
-->

# Telemetry and notifications

## Telemetry

Serverless Framework collects _anonymous_ telemetry data in order to better understand the needs of our users and to help drive better prioritization of improvements and more informed decisions. We understand that not everyone might want to send their usage data, so the participation is optional and can be disabled by following the instructions below.

### Disabling telemetry

One way to disable telemetry is to set environment variable `SLS_TELEMETRY_DISABLED`. For example, the command below will be executed with telemetry disabled:

```
SLS_TELEMETRY_DISABLED=1 sls deploy
```

Disabling telemetry via `SLS_TELEMETRY_DISABLED` environment variable is available since Serverless Framework `2.37.1`.

Alternatively, it is also possible to globally disable telemetry by running the following command:

```
sls slstats --disable
```

It will update the configuration stored in your `~/.serverlessrc` configuration file and will apply to all serverless commands.

### What is being collected

In our telemetry data, we collect information about version of the Framework, selected provider, configured event types, triggered deprecations, runtime and used plugins. All collected data is _anonymous_ and we _do not_ store any sensitive data.

## Notifications

In addition to telemetry, Serverless Framework occasionally informs you about newer releases or additional available offerings. If you do not wish to receive such notifications, you can disable them by following the instructions below.

### Adjusting/disabling notifications

Notifications can be configured by `SLS_NOTIFICATIONS_MODE` environment variable. If accepts following distinct values:

- `off` (in older versions `0`) - No notifications will be shown
- `upgrades-only` (in older versions `1`) - Only notifications about minor and major version upgrades will be visible
- `on` (in older versions `2`) - All notifications will be visible
- `force` (in older versions `3`) - All notifications will be visible and will be presented constantly ignoring the visibility threshold setting

By default, the notifications are turned on (mode `'on'`), with the exception of CI environments where the default mode is set to `'upgrades-only'`.

To adjust the notifications, set the `SLS_NOTIFICATIONS_MODE` to one of the values above, e.g.:

```
SLS_NOTIFICATIONS_MODE=upgrades-only sls deploy
```
