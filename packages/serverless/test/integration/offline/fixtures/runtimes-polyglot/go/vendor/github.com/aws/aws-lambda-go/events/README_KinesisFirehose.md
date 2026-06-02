# Sample Function

The following is a sample Lambda function that transforms Kinesis Firehose records by doing a ToUpper on the data.

```go

package main

import (
	"fmt"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handleRequest(evnt events.KinesisFirehoseEvent) (events.KinesisFirehoseResponse, error) {

	fmt.Printf("InvocationID: %s\n", evnt.InvocationID)
	fmt.Printf("DeliveryStreamArn: %s\n", evnt.DeliveryStreamArn)
	fmt.Printf("Region: %s\n", evnt.Region)

	var response events.KinesisFirehoseResponse

	for _, record := range evnt.Records {
		fmt.Printf("RecordID: %s\n", record.RecordID)
		fmt.Printf("ApproximateArrivalTimestamp: %s\n", record.ApproximateArrivalTimestamp)

		// Transform data: ToUpper the data
		var transformedRecord events.KinesisFirehoseResponseRecord
		transformedRecord.RecordID = record.RecordID
		transformedRecord.Result = events.KinesisFirehoseTransformedStateOk
		transformedRecord.Data = []byte(strings.ToUpper(string(record.Data)))

		response.Records = append(response.Records, transformedRecord)
	}

	return response, nil
}

func main() {
	lambda.Start(handleRequest)
}

```
