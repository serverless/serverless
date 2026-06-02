
# Sample Function

The following is a Lambda function that receives Amazon CloudWatch Logs event record data as input and writes message part to Lambda's CloudWatch Logs. Note that by default anything written to Console will be logged as CloudWatch Logs events.

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
)

func handler(ctx context.Context, logsEvent events.CloudwatchLogsEvent) {
	data, _ := logsEvent.AWSLogs.Parse()
	for _, logEvent := range data.LogEvents {
		fmt.Printf("Message = %s\n", logEvent.Message)
  	}
}
```
