
### Schedule

#### Simple event definition

This will attach a schedule event and causes the function `crawl` to be called every 2 hours.

```yml
functions:
  crawl:
    handler: crawl
    events:
      - schedule: rate(2 hours)
```

#### Extended event definition

This will create and attach a schedule event for the `aggregate` function which is disabled. If enabled it will call
the `aggregate` function every 10 minutes.

```yml
functions:
  aggregate:
    handler: statistics.handler
    events:
      - schedule:
          rate: rate(10 minutes)
          enabled: false
```
