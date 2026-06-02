# Sample Function

The following is a sample Lambda function that receives an Auto Scaling event as an input and logs the EC2 instance ID to CloudWatch Logs. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, autoScalingEvent events.AutoScalingEvent) {
	fmt.Printf("Instance-Id available in event is %s \n", autoScalingEvent.Detail["EC2InstanceId"])
}

func main() {
	lambda.Start(handler)
}
```
