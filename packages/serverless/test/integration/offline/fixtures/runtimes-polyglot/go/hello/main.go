package main

import (
	"context"
	"encoding/json"
	"os"
	"runtime"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// Handler returns a runtime-identifying payload plus a couple of the Lambda
// runtime env vars, so the integration test can assert both that the host Go
// child-process runner served the request and that the runner injected the
// standard execution-environment variables.
func Handler(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{
		"runtime":      "go",
		"goVersion":    runtime.Version(),
		"isOffline":    os.Getenv("IS_OFFLINE"),
		"functionName": os.Getenv("AWS_LAMBDA_FUNCTION_NAME"),
	})
	return events.APIGatewayProxyResponse{
		StatusCode: 200,
		Headers:    map[string]string{"content-type": "application/json"},
		Body:       string(body),
	}, nil
}

func main() {
	lambda.Start(Handler)
}
