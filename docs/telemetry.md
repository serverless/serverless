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

Notifications can be configured by `SLS_NOTIFICATIONS_MODE` environment variable. If accepts three distinct values:

- `0` - in this mode all notifications will be disabled
- `1` - in this mode only notifications about minor and major version upgrades will be visible
- `2` - in this mode all notifications will be visible

By default, the notifications are turned on (use mode `'2'`), with the exception of CI environments where the default mode is set to `'1'`.

To adjust the notifications, set the `SLS_NOTIFICATIONS_MODE` to one of the values above, e.g.:

```
SLS_NOTIFICATIONS_MODE=0 sls deploy
```
