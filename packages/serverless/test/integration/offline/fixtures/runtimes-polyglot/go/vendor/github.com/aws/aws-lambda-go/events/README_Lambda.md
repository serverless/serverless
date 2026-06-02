# Overview

Lambda events consist of a request that was routed to a Lambda function by the Lambda Function URLs feature. When this happens, Lambda expects the result of the function to be the response that Lambda should respond with.

# Sample Function

The following is a sample class and Lambda function that receives Lambda Function URLs event record data as an input, writes some of the record data to CloudWatch Logs, and responds with a 200 status and the same body as the request. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go
package main

import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handleRequest(ctx context.Context, request events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	fmt.Printf("Processing request data for request %s.\n", request.RequestContext.RequestID)
	fmt.Printf("Body size = %d.\n", len(request.Body))

	fmt.Println("Headers:")
	for key, value := range request.Headers {
		fmt.Printf("    %s: %s\n", key, value)
	}

	return events.LambdaFunctionURLResponse{Body: request.Body, StatusCode: 200}, nil
}

func main() {
	lambda.Start(handleRequest)
}
```
