# Sample Function

The following is a sample class and Lambda function that receives a Amazon Chime Bot event and handles the various event types accordingly.

```go

package main

import (
    "fmt"
    "context"
    "net/http"
    "bytes"
    "encoding/json"
    "errors"
    "strconv"
    
    "github.com/aws/aws-lambda-go/events"
)

func handler(_ context.Context, chimeBotEvent events.ChimeBotEvent) error {
    switch chimeBotEvent.EventType {
    case "Invite":
        if err := message(chimeBotEvent.InboundHTTPSEndpoint.URL, "Thanks for inviting me to this room " + chimeBotEvent.Sender.SenderID); err != nil {
            return fmt.Errorf("failed to send webhook message: %v", err)
        }
        return nil
    case "Mention":
        if err := message(chimeBotEvent.InboundHTTPSEndpoint.URL, "Thanks for mentioning me " + chimeBotEvent.Sender.SenderID); err != nil {
            return fmt.Errorf("failed to send webhook message: %v", err)
        }
        return nil
    case "Remove":
        fmt.Printf("I have been removed from %q by %q", chimeBotEvent.Discussion.DiscussionType,  chimeBotEvent.Sender.SenderID)
        return nil
    default:
        return fmt.Errorf("event type %q is unsupported", chimeBotEvent.EventType)
    }
}

func message(url, content string) (error) {
    input := &bytes.Buffer{}
    if err := json.NewEncoder(input).Encode(webhookInput{Content:content}); err != nil {
        return errors.New("failed to marshal request: " + err.Error())
    }

    resp, err := http.Post("POST", url, input)
    if err != nil {
        return errors.New("failed to execute post http request: " + err.Error())
    }
    
    if resp != nil && resp.Body != nil {
        defer resp.Body.Close()
    }

    if resp.StatusCode != http.StatusOK {
        return errors.New("bad response: status code not is " + strconv.Itoa(http.StatusOK) + " not " + strconv.Itoa(resp.StatusCode))
    }
    
    return nil
}

type webhookInput struct {
    Content    string `json:"Content"`
}

```
