# Sample function

The following is an example for an Application Destination Lambda function that receives Amazon Kinesis Data Analytics event records as an input. To send Kinesis Data Analytics output records the Lambda function must be compliant with the (required input and return data models)[https://docs.aws.amazon.com/kinesisanalytics/latest/dev/how-it-works-output-lambda.html], so the handler returns a list of delivery statuses for each record.

The following Lambda function receives Amazon Kinesis Data Analytics event record data as an input and writes some of the record data to CloudWatch Logs. For each entry it adds an element to the response slice, marking it delivered. When the logic considers the delivery to be failed the `events.KinesisAnalyticsOutputDeliveryFailed` value should be used for the response `Result` field.


```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, kinesisAnalyticsEvent events.KinesisAnalyticsOutputDeliveryEvent) (events.KinesisAnalyticsOutputDeliveryResponse, error) {
	var err error

	var responses events.KinesisAnalyticsOutputDeliveryResponse
	responses.Records = make([]events.KinesisAnalyticsOutputDeliveryResponseRecord, len(kinesisAnalyticsEvent.Records))

	for i, record := range kinesisAnalyticsEvent.Records {
		responses.Records[i] = events.KinesisAnalyticsOutputDeliveryResponseRecord{
			RecordID: record.RecordID,
			Result:   events.KinesisAnalyticsOutputDeliveryOK,
		}

		dataBytes := record.Data
		dataText := string(dataBytes)

		fmt.Printf("%s Data = %s \n", record.RecordID, dataText)
	}
	return responses, err
}

func main() {
	lambda.Start(handler)
}

```
