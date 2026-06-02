# Sample Function

The following is a sample Lambda function that receives Amazon Config event record data as an input and writes some of the record data to CloudWatch Logs. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go

import (
    "strings"
    "github.com/aws/aws-lambda-go/events"
)

func handleRequest(ctx context.Context, configEvent events.ConfigEvent) {
    fmt.Printf("AWS Config rule: %s\n", configEvent.ConfigRuleName)
    fmt.Printf("Invoking event JSON: %s\n", configEvent.InvokingEvent)
    fmt.Printf("Event version: %s\n", configEvent.Version)
}

```
