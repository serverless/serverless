
# Sample Function

The following is a sample class and Lambda function that receives Amazon Lex event data as input, writes some of the record data to CloudWatch Logs, and responds back to Lex. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
)

func Handler(ctx context.Context, event events.LexEvent) (*lex.LexResponse, error) {
	fmt.Printf("Received an input from Amazon Lex. Current Intent: %s", event.CurrentIntent.Name)

	messageContent := "Hello from AWS Lambda!"

	return &LexResponse{
		SessionAttributes: event.SessionAttributes,
		DialogAction: events.LexDialogAction{
			Type: "Close",
			Message: map[string]string{
				"content":     messageContent,
				"contentType": "PlainText",
			},
			FulfillmentState: "Fulfilled",
		},
	}, nil
}
```
