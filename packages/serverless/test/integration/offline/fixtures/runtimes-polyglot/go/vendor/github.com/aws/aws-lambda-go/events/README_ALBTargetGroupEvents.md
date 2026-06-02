# Overview

ALB Target Group events consist of a request that was routed to a Lambda function which is a registered target of an Application Load Balancer Target Group. When this happens, ALB expects the result of the function to be the response that ALB should respond with.

https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html

# Sample Function

The following is a sample class and Lambda function that receives an ALB Target Group event as an input, writes some of the incoming data to CloudWatch Logs, and responds with a 200 status and the same body as the request. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go

package main

import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handleRequest(ctx context.Context, request events.ALBTargetGroupRequest) (events.ALBTargetGroupResponse, error) {
	fmt.Printf("Processing request data for traceId %s.\n", request.Headers["x-amzn-trace-id"])
	fmt.Printf("Body size = %d.\n", len(request.Body))

	fmt.Println("Headers:")
	for key, value := range request.Headers {
		fmt.Printf("    %s: %s\n", key, value)
	}

	return events.ALBTargetGroupResponse{Body: request.Body, StatusCode: 200, StatusDescription: "200 OK", IsBase64Encoded: false, Headers: map[string]string{}}, nil
}

func main() {
	lambda.Start(handleRequest)
}
```
