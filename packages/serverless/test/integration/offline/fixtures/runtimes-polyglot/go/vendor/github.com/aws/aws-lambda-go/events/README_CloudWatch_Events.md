
# Sample Function

The following is a Lambda function that receives Amazon CloudWatch event record data as input and writes event detail to Lambda's CloudWatch Logs. Note that by default anything written to Console will be logged as CloudWatch Logs events.

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
)

func handler(ctx context.Context, event events.CloudWatchEvent) {
	fmt.Printf("Detail = %s\n", event.Detail)
}
```

## CloudWatch Scheduled Events

If you have a constant JSON text in a CloudWatch Scheduled Event, it can be accessed either by explicitly defining a structure for the json payload you would expect:

```go
type MyRequest struct {
	Name string `json:"name"`
}

func handler(ctx context.Context, req MyRequest) {
}
```

or by accepting raw json blob as is:

```go
func handler(ctx context.Context, b json.RawMessage) {
    // json.RawMessage is basically []byte which can be unmarshalled
}
```
