# Sample Function

The following is a sample class and Lambda function that receives Amazon S3 event record data as an input and writes some of the record data to CloudWatch Logs. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go

import (
    "fmt"
    "context"
    "github.com/aws/aws-lambda-go/events"
)

func handler(ctx context.Context, e events.S3BatchJobEvent) (response events.S3BatchJobResponse, err error) {
    fmt.Printf("InvocationSchemaVersion: %s\n", e.InvocationSchemaVersion)
	fmt.Printf("InvocationID: %s\n", e.InvocationID)
	fmt.Printf("Job.ID: %s\n", e.Job.ID)

	for _, task := range e.Tasks {
		fmt.Printf("TaskID: %s\n", task.TaskID)
		fmt.Printf("S3Key: %s\n", task.S3Key)
		fmt.Printf("S3VersionID: %s\n", task.S3VersionID)
		fmt.Printf("S3BucketARN: %s\n", task.S3BucketARN)

	}

	fmt.Printf("InvocationSchemaVersion: %s\n", response.InvocationSchemaVersion)
	fmt.Printf("TreatMissingKeysAs: %s\n", response.TreatMissingKeysAs)
	fmt.Printf("InvocationID: %s\n", response.InvocationID)

	for _, result := range response.Results {
		fmt.Printf("TaskID: %s\n", result.TaskID)
		fmt.Printf("ResultCode: %s\n", result.ResultCode)
		fmt.Printf("ResultString: %s\n", result.ResultString)
	}

	return
}

```
