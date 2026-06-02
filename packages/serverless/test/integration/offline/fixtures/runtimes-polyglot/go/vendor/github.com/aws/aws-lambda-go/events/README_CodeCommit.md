# Sample Function

The following is a sample Lambda function that receives Amazon CodeCommit event
records input and prints them to `os.Stdout`.)

```go
import (
    "fmt"
    "github.com/aws/aws-lambda-go/events"
)

func handleRequest(evt events.CodeCommitEvent) {
    for _, record := range evt.Records {
        fmt.Println(record)
    }
}
```
