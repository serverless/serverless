# Sample Function

The following is a sample class and Lambda function that receives Amazon ECS Container instance state change events record data as an input and writes some of the record data to CloudWatch Logs. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go

package main

import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, ecsEvent events.ECSContainerInstanceEvent) {
	outputJSON, _ := json.MarshalIndent(ecsEvent, "", " ")
	fmt.Printf("Data = %s", outputJSON)
}

func main() {
	lambda.Start(handler)
}

```
