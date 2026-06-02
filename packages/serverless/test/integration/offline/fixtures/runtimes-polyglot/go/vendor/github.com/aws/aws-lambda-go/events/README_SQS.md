
# Sample Function

The following is a sample class and Lambda function that receives Amazon SQS event message data as input, writes some of the message data to CloudWatch Logs, and responds with a 200 status and the same body as the request. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go
package main

import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, sqsEvent events.SQSEvent) error {
	for _, message := range sqsEvent.Records {
		fmt.Printf("The message %s for event source %s = %s \n", message.MessageId, message.EventSource, message.Body)
	}

	return nil
}

func main() {
	lambda.Start(handler)
}

```
