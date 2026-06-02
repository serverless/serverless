# Sample Function

The following is a sample Lambda function that receives an Amazon Connect event as an input and writes some of the record data to CloudWatch Logs. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go
package main

import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func main() {
	lambda.Start(handler)
}

func handler(ctx context.Context, connectEvent events.ConnectEvent) (events.ConnectResponse, error) {
	fmt.Printf("Processing Connect event with ContactID %s.\n", connectEvent.Details.ContactData.ContactID)

	fmt.Printf("Invoked with %d parameters\n", len(connectEvent.Details.Parameters))
	for k, v := range connectEvent.Details.Parameters {
		fmt.Printf("%s : %s\n", k, v)
	}

	resp := events.ConnectResponse{
		"Result":       "Success",
		"NewAttribute": "NewValue",
	}

	return resp, nil
}
```
