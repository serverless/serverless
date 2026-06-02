package events

import "time"

// SimpleEmailEvent is the outer structure of an event sent via SES.
type SimpleEmailEvent struct {
	Records []SimpleEmailRecord `json:"Records"`
}

type SimpleEmailRecord struct {
	EventVersion string             `json:"eventVersion"`
	EventSource  string             `json:"eventSource"`
	SES          SimpleEmailService `json:"ses"`
}

type SimpleEmailService struct {
	Mail    SimpleEmailMessage `json:"mail"`
	Receipt SimpleEmailReceipt `json:"receipt"`
}

type SimpleEmailMessage struct {
	CommonHeaders    SimpleEmailCommonHeaders `json:"commonHeaders"`
	Source           string                   `json:"source"`
	Timestamp        time.Time                `json:"timestamp"`
	Destination      []string                 `json:"destination"`
	Headers          []SimpleEmailHeader      `json:"headers"`
	HeadersTruncated bool                     `json:"headersTruncated"`
	MessageID        string                   `json:"messageId"`
}

type SimpleEmailReceipt struct {
	Recipients           []string                 `json:"recipients"`
	Timestamp            time.Time                `json:"timestamp"`
	SpamVerdict          SimpleEmailVerdict       `json:"spamVerdict"`
	DKIMVerdict          SimpleEmailVerdict       `json:"dkimVerdict"`
	DMARCVerdict         SimpleEmailVerdict       `json:"dmarcVerdict"`
	DMARCPolicy          string                   `json:"dmarcPolicy"`
	SPFVerdict           SimpleEmailVerdict       `json:"spfVerdict"`
	VirusVerdict         SimpleEmailVerdict       `json:"virusVerdict"`
	Action               SimpleEmailReceiptAction `json:"action"`
	ProcessingTimeMillis int64                    `json:"processingTimeMillis"`
}

type SimpleEmailHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type SimpleEmailCommonHeaders struct {
	From       []string `json:"from"`
	To         []string `json:"to"`
	ReturnPath string   `json:"returnPath"`
	MessageID  string   `json:"messageId"`
	Date       string   `json:"date"`
	Subject    string   `json:"subject"`
}

// SimpleEmailReceiptAction is a logical union of fields present in all action
// Types. For example, the FunctionARN and InvocationType fields are only
// present for the Lambda Type, and the BucketName and ObjectKey fields are only
// present for the S3 Type.
type SimpleEmailReceiptAction struct {
	Type            string `json:"type"`
	TopicARN        string `json:"topicArn,omitempty"`
	BucketName      string `json:"bucketName,omitempty"`
	ObjectKey       string `json:"objectKey,omitempty"`
	SMTPReplyCode   string `json:"smtpReplyCode,omitempty"`
	StatusCode      string `json:"statusCode,omitempty"`
	Message         string `json:"message,omitempty"`
	Sender          string `json:"sender,omitempty"`
	InvocationType  string `json:"invocationType,omitempty"`
	FunctionARN     string `json:"functionArn,omitempty"`
	OrganizationARN string `json:"organizationArn,omitempty"`
}

type SimpleEmailVerdict struct {
	Status string `json:"status"`
}

// SimpleEmailDispositionValue enumeration representing the dispostition value for SES
type SimpleEmailDispositionValue string

const (
	// SimpleEmailContinue represents the CONTINUE disposition which tells the SES Rule Set to continue to the next rule
	SimpleEmailContinue SimpleEmailDispositionValue = "CONTINUE"
	// SimpleEmailStopRule represents the STOP_RULE disposition which tells the SES Rule Set to stop processing this rule and continue to the next
	SimpleEmailStopRule SimpleEmailDispositionValue = "STOP_RULE"
	// SimpleEmailStopRuleSet represents the STOP_RULE_SET disposition which tells the SES Rule SEt to stop processing all rules
	SimpleEmailStopRuleSet SimpleEmailDispositionValue = "STOP_RULE_SET"
)

// SimpleEmailDisposition disposition return for SES to control rule functions
type SimpleEmailDisposition struct {
	Disposition SimpleEmailDispositionValue `json:"disposition"`
}
