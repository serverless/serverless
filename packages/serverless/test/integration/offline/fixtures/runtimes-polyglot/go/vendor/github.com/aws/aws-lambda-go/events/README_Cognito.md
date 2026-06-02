# Sample Function

The following is a sample Lambda function that receives Amazon Cognito Sync event record data as an input and writes some of the record data to CloudWatch Logs. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go

package main

import (
    "fmt"

    "github.com/aws/aws-lambda-go/lambda"
    "github.com/aws/aws-lambda-go/events"
)

func handler(cognitoEvent events.CognitoEvent) error {
    for datasetName, datasetRecord := range cognitoEvent.DatasetRecords {
        fmt.Printf("[%s -- %s] %s -> %s -> %s \n",
            cognitoEvent.EventType,
            datasetName,
            datasetRecord.OldValue,
            datasetRecord.Op,
            datasetRecord.NewValue)
    }
    return nil
}

func main() {
    lambda.Start(handler)
}

```
