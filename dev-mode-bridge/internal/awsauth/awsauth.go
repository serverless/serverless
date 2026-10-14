// Package awsauth is how the bridge gets and uses AWS credentials: the broker role the CLI
// created, assumed with the per-broker ExternalId and narrowed to this execution environment's
// AWS IoT Core client and topics; the presigned AWS IoT Core WebSocket URL; and the Direct
// Messaging call that asks whether the developer's CLI is still connected.
//
// No error this package returns carries a URL, a credential or the ExternalId: presigned URLs
// carry credentials in their query, and errors end up in the function's log group.
package awsauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/arn"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/iotdataplane"
	"github.com/aws/aws-sdk-go-v2/service/iotdataplane/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"

	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// EmptySHA256 is the SHA-256 of an empty payload.
const EmptySHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

const (
	// SessionDuration is how long one broker session lasts: AWS caps a role assumed with role
	// credentials (role chaining) at one hour.
	SessionDuration = time.Hour
	// RefreshBefore is how long before they expire broker credentials are replaced, so a URL
	// signed with them is never signed with credentials about to lapse.
	RefreshBefore = 5 * time.Minute
	// PresignExpires is how long a presigned AWS IoT Core WebSocket URL is accepted, in seconds.
	PresignExpires = 300
	// PingTimeout bounds one Direct Messaging question, the one-second confirmation included.
	PingTimeout = 5 * time.Second
	// iotGatewayService is the SigV4 service name of the AWS IoT Core device gateway.
	iotGatewayService = "iotdevicegateway"
)

// Scope is what one execution environment's broker session may touch.
type Scope struct {
	Partition   string // aws, aws-cn, aws-us-gov: from the broker role ARN
	Account     string // from the broker role ARN
	Region      string
	Session     string // SLS_DEV_SESSION
	Environment string // this execution environment's id
}

var (
	idPattern        = regexp.MustCompile(`^[A-Za-z0-9_-]{1,48}$`)
	accountPattern   = regexp.MustCompile(`^[0-9]{12}$`)
	partitionPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)
	regionPattern    = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)
)

// Validate refuses a Scope any part of which could widen the session policy: every part becomes
// part of a resource ARN, so a wildcard or a stray separator there would match more than this
// environment's own client and topics. The error names the part, never its value.
func (s Scope) Validate() error {
	switch {
	case !partitionPattern.MatchString(s.Partition):
		return errors.New("the broker scope's partition is not an AWS partition name")
	case !accountPattern.MatchString(s.Account):
		return errors.New("the broker scope's account is not a 12-digit AWS account id")
	case !regionPattern.MatchString(s.Region):
		return errors.New("the broker scope's region is not an AWS Region name")
	case !idPattern.MatchString(s.Session) || !idPattern.MatchString(s.Environment):
		return errors.New("the session and environment ids may only hold letters, digits, '_' and '-'")
	}
	return nil
}

// ScopeFromRoleARN fills Partition and Account from arn:<partition>:iam::<account>:role/<name>.
// The session and environment ids become parts of resource ARNs, so only letters, digits, "_"
// and "-" are accepted: a wildcard there would widen the session policy.
func ScopeFromRoleARN(roleARN, region, session, environment string) (Scope, error) {
	parsed, err := arn.Parse(roleARN)
	if err != nil || parsed.Partition == "" || parsed.Service != "iam" || parsed.Region != "" ||
		!accountPattern.MatchString(parsed.AccountID) || !strings.HasPrefix(parsed.Resource, "role/") ||
		strings.HasSuffix(parsed.Resource, "/") {
		return Scope{}, fmt.Errorf("%q is not an IAM role ARN", roleARN)
	}
	s := Scope{Partition: parsed.Partition, Account: parsed.AccountID, Region: region, Session: session, Environment: environment}
	if err := s.Validate(); err != nil {
		return Scope{}, err
	}
	return s, nil
}

// SessionPolicy is the AssumeRole session policy: the broker's permissions narrowed to this
// environment's own client id, the session's request topic, this environment's reply topic, the
// session's "gone" topic, and Direct Messaging to the session's CLI on the session's ping topic
// only (the iot:Topic condition: without it any topic is allowed). It is self-imposed (whoever
// holds the ExternalId chooses it); it keeps one session's bridges off another session's topics.
// A Scope that fails Validate is refused rather than turned into a wider policy.
func SessionPolicy(s Scope) (string, error) {
	if err := s.Validate(); err != nil {
		return "", err
	}
	iot := fmt.Sprintf("arn:%s:iot:%s:%s:", s.Partition, s.Region, s.Account)
	down := protocol.DownTopic(s.Session, s.Environment)
	gone := protocol.GoneTopic(s.Session)
	type statement struct {
		Effect    string
		Action    string
		Resource  any
		Condition any `json:",omitempty"`
	}
	pingOnly := map[string]map[string]string{"StringEquals": {"iot:Topic": protocol.PingTopic(s.Session)}}
	doc := struct {
		Version   string
		Statement []statement
	}{
		Version: "2012-10-17",
		Statement: []statement{
			{"Allow", "iot:Connect", iot + "client/" + protocol.BridgeClientID(s.Session, s.Environment), nil},
			{"Allow", "iot:Publish", iot + "topic/" + protocol.UpTopic(s.Session), nil},
			{"Allow", "iot:Subscribe", []string{iot + "topicfilter/" + down, iot + "topicfilter/" + gone}, nil},
			{"Allow", "iot:Receive", []string{iot + "topic/" + down, iot + "topic/" + gone}, nil},
			{"Allow", "iot:SendDirectMessage", iot + "client/" + protocol.LaptopClientID(s.Session), pingOnly},
		},
	}
	out, err := json.Marshal(doc)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// BrokerCredentials assumes the broker role with the ExternalId and the session policy; a Scope
// that fails Validate is refused. The result is an *aws.CredentialsCache, which SDK clients use
// as is: it replaces the credentials RefreshBefore their expiry. Its errors carry neither the
// ExternalId nor a URL. When that early refresh fails, the cache returns the error even though
// the old credentials are still valid for a few minutes, so callers classify it with Retryable
// and retry instead of giving up.
func BrokerCredentials(client stscreds.AssumeRoleAPIClient, roleARN, externalID string, s Scope) (aws.CredentialsProvider, error) {
	policy, err := SessionPolicy(s)
	if err != nil {
		return nil, err
	}
	provider := stscreds.NewAssumeRoleProvider(client, roleARN, func(o *stscreds.AssumeRoleOptions) {
		o.ExternalID = aws.String(externalID)
		o.Policy = aws.String(policy)
		o.RoleSessionName = "sls-dev-" + s.Environment
		o.Duration = SessionDuration
	})
	return aws.NewCredentialsCache(redacting{provider, externalID}, func(o *aws.CredentialsCacheOptions) {
		o.ExpiryWindow = RefreshBefore
	}), nil
}

type redacting struct {
	provider aws.CredentialsProvider
	secret   string
}

func (r redacting) Retrieve(ctx context.Context) (aws.Credentials, error) {
	creds, err := r.provider.Retrieve(ctx)
	if err != nil {
		return aws.Credentials{}, Redact(err, r.secret)
	}
	return creds, nil
}

// NewSTS is the STS client for the function's own credentials (Lambda's environment variables).
// SDK request logging stays off whatever the configuration says: it would log signed requests.
func NewSTS(cfg aws.Config) *sts.Client {
	return sts.NewFromConfig(cfg, func(o *sts.Options) { o.ClientLogMode = 0 })
}

// Retryable says whether an AssumeRole failure may pass with time: right after the CLI creates
// the broker role, AWS IAM lets some calls through and denies others for up to about 200 s, and
// throttling, AWS-side (5xx) failures and network failures or timeouts pass too. An explicit
// deny (a permissions boundary or a service control policy) never passes, nor do expired or
// invalid credentials, nor any local error (missing credentials, configuration, a bad Scope).
func Retryable(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) {
		return false
	}
	if strings.Contains(strings.ToLower(err.Error()), "explicit deny") {
		return false
	}
	var status interface{ HTTPStatusCode() int }
	serverSide := false
	if errors.As(err, &status) {
		code := status.HTTPStatusCode()
		serverSide = code >= 500 || code == http.StatusTooManyRequests
	}
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		// No answer from AWS: retried only when the network failed (a VPC without a route to STS
		// yet) or the answer was cut off, never for a local error.
		return serverSide || networkFailure(err)
	}
	switch apiErr.ErrorCode() {
	case "AccessDenied", "AccessDeniedException", "IDPCommunicationError",
		"Throttling", "ThrottlingException", "TooManyRequestsException", "RequestLimitExceeded":
		return true
	case "ExpiredToken", "ExpiredTokenException", "InvalidClientTokenId", "MalformedPolicyDocument",
		"PackedPolicyTooLarge", "RegionDisabledException", "ValidationError":
		return false
	}
	return serverSide || apiErr.ErrorFault() == smithy.FaultServer
}

// networkFailure reports a failure to reach AWS or to read its whole answer: a net.Error
// (*url.Error included), a deadline, a cut-off response, or one of those Redact reduced.
func networkFailure(err error) bool {
	var netErr net.Error
	var reduced *redacted
	return errors.As(err, &netErr) || errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) ||
		(errors.As(err, &reduced) && reduced.network)
}

// PresignIoT returns the wss:// URL for AWS IoT Core's MQTT endpoint, signed without the session
// token and with the token appended afterwards: AWS IoT Core refuses the token inside the signed
// query. AWS IoT Core accepts the URL only for PresignExpires seconds after `now`, so sign right
// before each connect. The URL carries credentials: never log it.
func PresignIoT(ctx context.Context, creds aws.Credentials, endpoint, region string, now time.Time) (string, error) {
	if endpoint == "" || strings.ContainsAny(endpoint, "/?#@ \t\r\n") {
		return "", errors.New("the AWS IoT Core endpoint is not a host name")
	}
	target := url.URL{Scheme: "https", Host: endpoint, Path: "/mqtt", RawQuery: fmt.Sprintf("X-Amz-Expires=%d", PresignExpires)}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return "", Redact(err)
	}
	unsigned := creds
	unsigned.SessionToken = ""
	signed, _, err := v4.NewSigner().PresignHTTP(ctx, unsigned, req, EmptySHA256, iotGatewayService, region, now)
	if err != nil {
		return "", Redact(err, creds.SecretAccessKey, creds.SessionToken)
	}
	signed = "wss" + strings.TrimPrefix(signed, "https")
	if creds.SessionToken != "" {
		signed += "&X-Amz-Security-Token=" + url.QueryEscape(creds.SessionToken)
	}
	return signed, nil
}

// Liveness is what Direct Messaging says about the session's CLI (the CLI's LIVENESS values).
type Liveness int

const (
	// Unknown: connected, but no acknowledgement within the timeout (a frozen or sleeping
	// machine). Dev Mode treats it as live.
	Unknown Liveness = iota
	// Live: the CLI is connected and acknowledged the message.
	Live
	// Gone: no CLI with that client id is connected.
	Gone
	// Denied: the broker may not send Direct Messages to that client id.
	Denied
	// Failed: the question could not be asked (network, throttling, any other error).
	Failed
)

func (l Liveness) String() string {
	switch l {
	case Unknown:
		return "unknown"
	case Live:
		return "live"
	case Gone:
		return "gone"
	case Denied:
		return "denied"
	case Failed:
		return "failed"
	}
	return fmt.Sprintf("Liveness(%d)", int(l))
}

// DirectMessagingAPI is the part of the AWS IoT Core data plane client Direct Messaging uses.
type DirectMessagingAPI interface {
	SendDirectMessage(ctx context.Context, params *iotdataplane.SendDirectMessageInput, optFns ...func(*iotdataplane.Options)) (*iotdataplane.SendDirectMessageOutput, error)
}

// DirectMessenger asks AWS IoT Core whether a client is connected, by sending it a message that
// must be acknowledged within one second (without confirmation a success means nothing).
type DirectMessenger struct {
	Client DirectMessagingAPI
}

// NewDirectMessenger is a DirectMessenger for the account's AWS IoT Core data endpoint
// (iot:Data-ATS, a host name), signed with cfg's credentials (the broker's). One attempt per
// question: a retried question only answers later.
func NewDirectMessenger(cfg aws.Config, endpoint string) DirectMessenger {
	return DirectMessenger{Client: iotdataplane.NewFromConfig(cfg, func(o *iotdataplane.Options) {
		o.BaseEndpoint = aws.String("https://" + endpoint)
		o.RetryMaxAttempts = 1
		o.ClientLogMode = 0
	})}
}

// Ping returns Live when the client acknowledged, Gone when no such client is connected, Unknown
// when it did not acknowledge in time (HTTP 504); Denied and Failed come with the (redacted) error.
func (d DirectMessenger) Ping(ctx context.Context, clientID, topic string) (Liveness, error) {
	ctx, cancel := context.WithTimeout(ctx, PingTimeout)
	defer cancel()
	_, err := d.Client.SendDirectMessage(ctx, &iotdataplane.SendDirectMessageInput{
		ClientId:     aws.String(clientID),
		Topic:        aws.String(topic),
		Confirmation: true,
		Timeout:      1,
	})
	if err == nil {
		return Live, nil
	}
	var notFound *types.ResourceNotFoundException
	var noAck *types.GatewayTimeoutException
	switch {
	case errors.As(err, &notFound):
		return Gone, nil
	// AWS IoT Core names the 504 InternalFailureException ("The delivery confirmation was not
	// received within the specified timeout period"), so the status decides, not the name.
	case errors.As(err, &noAck), httpStatus(err) == http.StatusGatewayTimeout:
		return Unknown, nil
	case denied(err):
		return Denied, Redact(err)
	}
	return Failed, Redact(err)
}

func denied(err error) bool {
	var forbidden *types.ForbiddenException
	var unauthorized *types.UnauthorizedException
	if errors.As(err, &forbidden) || errors.As(err, &unauthorized) {
		return true
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) && apiErr.ErrorCode() == "AccessDeniedException" {
		return true
	}
	return httpStatus(err) == http.StatusForbidden
}

// httpStatus is the HTTP status of the response behind err, or 0 when there was none.
func httpStatus(err error) int {
	var status interface{ HTTPStatusCode() int }
	if errors.As(err, &status) {
		return status.HTTPStatusCode()
	}
	return 0
}

var (
	urlPattern = regexp.MustCompile(`[A-Za-z][A-Za-z0-9+.\-]*://[^\s"'<>]+`)
	// signedQueryPattern is a SigV4 parameter and its value anywhere in text: in a path without a
	// scheme, loose key=value text, URL-encoded (once or twice), a header-style "key: value", or
	// JSON; a quoted key or value is replaced with its quotes. After "key:" an unquoted value is
	// taken only when it holds a digit or one of / + = % (as every credential, signature and date
	// does), so a header named in prose keeps the words after it.
	signedQueryPattern = regexp.MustCompile(`(?i)["']?X-Amz-[A-Za-z0-9-]+["']?` +
		`(?:[ \t]*(?:=|%3D|%253D)[ \t]*(?:"[^"]*"|'[^']*'|[^&\s"'<>]*)` +
		`|[ \t]*:[ \t]*(?:"[^"]*"|'[^']*'|[A-Za-z0-9/+=%._-]*[0-9/+=%][A-Za-z0-9/+=%._-]*))`)
)

// Redact returns err without any URL, any SigV4 query parameter (X-Amz-…=…, a presigned URL's
// credentials) and the given secrets in its text, keeping what
// callers act on: the AWS operation, the error code, message and fault, the HTTP status, and
// whether it is a deadline or a cancellation. A *url.Error (net/http's, inside SDK errors too)
// is reduced to its Op and Err: its URL may be presigned. An error with nothing to hide is
// returned as is.
func Redact(err error, secrets ...string) error {
	if err == nil {
		return nil
	}
	scrub := func(s string) (string, bool) {
		out := urlPattern.ReplaceAllString(s, "<url>")
		out = signedQueryPattern.ReplaceAllString(out, "<redacted>")
		for _, secret := range secrets {
			if secret != "" {
				out = strings.ReplaceAll(out, secret, "<redacted>")
			}
		}
		return out, out != s
	}
	msg := err.Error()
	changed := false
	var u *url.Error
	var cause error
	if errors.As(err, &u) {
		changed = true
		msg = u.Op
		if u.Err != nil {
			msg += ": " + u.Err.Error()
			// The network error stays reachable (Retryable needs it) when its own text is clean.
			if _, dirty := scrub(u.Err.Error()); !dirty {
				cause = u.Err
			}
		}
		var op *smithy.OperationError
		if errors.As(err, &op) {
			msg = fmt.Sprintf("operation error %s: %s, %s", op.Service(), op.Operation(), msg)
		}
	}
	msg, scrubbed := scrub(msg)
	if !changed && !scrubbed {
		return err
	}
	r := redacted{msg: msg, cause: cause, network: u != nil}
	switch {
	case cause != nil:
	case errors.Is(err, context.DeadlineExceeded):
		r.cause = context.DeadlineExceeded
	case errors.Is(err, context.Canceled):
		r.cause = context.Canceled
	}
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return &r
	}
	message, _ := scrub(apiErr.ErrorMessage())
	a := &redactedAPI{redacted: r, code: apiErr.ErrorCode(), message: message, fault: apiErr.ErrorFault()}
	var status interface{ HTTPStatusCode() int }
	if errors.As(err, &status) {
		a.status = status.HTTPStatusCode()
	}
	return a
}

type redacted struct {
	msg     string
	cause   error
	network bool // reduced from a *url.Error: AWS could not be reached
}

func (e *redacted) Error() string { return e.msg }
func (e *redacted) Unwrap() error { return e.cause }

type redactedAPI struct {
	redacted
	code, message string
	fault         smithy.ErrorFault
	status        int
}

func (e *redactedAPI) ErrorCode() string             { return e.code }
func (e *redactedAPI) ErrorMessage() string          { return e.message }
func (e *redactedAPI) ErrorFault() smithy.ErrorFault { return e.fault }
func (e *redactedAPI) HTTPStatusCode() int           { return e.status }
