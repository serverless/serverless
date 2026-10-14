package awsauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/iotdataplane"
	iottypes "github.com/aws/aws-sdk-go-v2/service/iotdataplane/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	ststypes "github.com/aws/aws-sdk-go-v2/service/sts/types"
	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"

	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

var scope = Scope{Partition: "aws", Account: "123456789012", Region: "us-east-1", Session: "s_0123456789ab", Environment: "e0123456789ab"}

// The ExternalId used by these tests; no error may carry it.
const externalID = "0f1e2d3c4b5a69788796a5b4c3d2e1f0"

func TestScopeFromRoleARN(t *testing.T) {
	for arn, partition := range map[string]string{
		"arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1":       "aws",
		"arn:aws-cn:iam::123456789012:role/serverless-dev-broker-cn-north-1":   "aws-cn",
		"arn:aws-us-gov:iam::123456789012:role/serverless-dev-broker-us-gov-1": "aws-us-gov",
		"arn:aws:iam::123456789012:role/path/to/serverless-dev-broker":         "aws",
	} {
		s, err := ScopeFromRoleARN(arn, "r-1", "s_1", "e1")
		if err != nil || s.Partition != partition || s.Account != "123456789012" || s.Region != "r-1" || s.Session != "s_1" || s.Environment != "e1" {
			t.Errorf("%s: %+v %v", arn, s, err)
		}
	}
	for _, bad := range []string{
		"",
		"role/x",
		"arn:aws:iam::12:role/x",
		"arn:aws:iam::12345678901x:role/x",
		"arn:aws:sts::123456789012:assumed-role/x/y",
		"arn:aws:iam::123456789012:user/x",
		"arn:aws:iam:us-east-1:123456789012:role/x",
		"arn::iam::123456789012:role/x",
		"arn:aws:iam::123456789012:role/",
	} {
		if _, err := ScopeFromRoleARN(bad, "us-east-1", "s", "e"); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestSessionPolicyNamesOnlyThisEnvironmentAndFitsTheLimit(t *testing.T) {
	doc, err := SessionPolicy(scope)
	if err != nil {
		t.Fatal(err)
	}
	if len(doc) > 2048 {
		t.Fatalf("session policy is %d characters; AWS accepts 2048", len(doc))
	}
	var parsed struct {
		Version   string
		Statement []struct {
			Effect   string
			Action   string
			Resource any
		}
	}
	if err := json.Unmarshal([]byte(doc), &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Version != "2012-10-17" {
		t.Errorf("version %q", parsed.Version)
	}
	want := map[string][]string{
		"iot:Connect":           {"arn:aws:iot:us-east-1:123456789012:client/sls-dev-s_0123456789ab-e0123456789ab"},
		"iot:Publish":           {"arn:aws:iot:us-east-1:123456789012:topic/sls-dev/s_0123456789ab/up"},
		"iot:Subscribe":         {"arn:aws:iot:us-east-1:123456789012:topicfilter/sls-dev/s_0123456789ab/down/e0123456789ab", "arn:aws:iot:us-east-1:123456789012:topicfilter/sls-dev/s_0123456789ab/gone"},
		"iot:Receive":           {"arn:aws:iot:us-east-1:123456789012:topic/sls-dev/s_0123456789ab/down/e0123456789ab", "arn:aws:iot:us-east-1:123456789012:topic/sls-dev/s_0123456789ab/gone"},
		"iot:SendDirectMessage": {"arn:aws:iot:us-east-1:123456789012:client/sls-dev-s_0123456789ab-cli"},
	}
	if len(parsed.Statement) != len(want) {
		t.Fatalf("%d statements", len(parsed.Statement))
	}
	for _, st := range parsed.Statement {
		var got []string
		switch r := st.Resource.(type) {
		case string:
			got = []string{r}
		case []any:
			for _, v := range r {
				got = append(got, v.(string))
			}
		}
		if st.Effect != "Allow" {
			t.Errorf("%s: effect %q", st.Action, st.Effect)
		}
		if strings.Join(got, ",") != strings.Join(want[st.Action], ",") {
			t.Errorf("%s: %v, want %v", st.Action, got, want[st.Action])
		}
		if strings.ContainsAny(strings.Join(got, ","), "*?") {
			t.Errorf("%s has a wildcard", st.Action)
		}
	}
}

// Direct Messages may go to the session's CLI client on its ping topic only; no other statement
// carries a condition.
func TestSessionPolicyLimitsDirectMessagesToThePingTopic(t *testing.T) {
	doc, err := SessionPolicy(scope)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Statement []struct {
			Action    string
			Condition map[string]map[string]any
		}
	}
	if err := json.Unmarshal([]byte(doc), &parsed); err != nil {
		t.Fatal(err)
	}
	for _, st := range parsed.Statement {
		if st.Action != "iot:SendDirectMessage" {
			if st.Condition != nil {
				t.Errorf("%s has a condition: %v", st.Action, st.Condition)
			}
			continue
		}
		if len(st.Condition) != 1 || len(st.Condition["StringEquals"]) != 1 || st.Condition["StringEquals"]["iot:Topic"] != protocol.PingTopic(scope.Session) {
			t.Fatalf("SendDirectMessage condition %v", st.Condition)
		}
		return
	}
	t.Fatal("no SendDirectMessage statement")
}

func TestSessionPolicyUsesThePartitionOfTheRole(t *testing.T) {
	s, err := ScopeFromRoleARN("arn:aws-cn:iam::123456789012:role/b", "cn-north-1", "s_1", "e1")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := SessionPolicy(s)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(doc, `"arn:aws-cn:iot:cn-north-1:123456789012:client/sls-dev-s_1-e1"`) || strings.Contains(doc, "arn:aws:") {
		t.Fatalf("%s", doc)
	}
}

type apiError struct{ code, message string }

func (e apiError) Error() string                 { return e.code + ": " + e.message }
func (e apiError) ErrorCode() string             { return e.code }
func (e apiError) ErrorMessage() string          { return e.message }
func (e apiError) ErrorFault() smithy.ErrorFault { return smithy.FaultClient }

// httpError is an API error the way the SDK returns it: inside a response error carrying the
// HTTP status, inside an operation error.
func httpError(status int, apiErr error) error {
	return &smithy.OperationError{ServiceID: "STS", OperationName: "AssumeRole", Err: &awshttp.ResponseError{
		ResponseError: &smithyhttp.ResponseError{Response: &smithyhttp.Response{Response: &http.Response{StatusCode: status}}, Err: apiErr},
		RequestID:     "req",
	}}
}

func TestRetryableWaitsOutPropagationButNeverAnExplicitDeny(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{apiError{"AccessDenied", "User: x is not authorized to perform: sts:AssumeRole on resource: y"}, true},
		{apiError{"AccessDenied", "... with an explicit deny in a permissions boundary: arn"}, false},
		{apiError{"AccessDenied", "... with an explicit deny in a service control policy"}, false},
		{apiError{"ExpiredToken", "expired"}, false},
		{apiError{"ExpiredTokenException", "expired"}, false},
		{apiError{"MalformedPolicyDocument", "bad"}, false},
		{apiError{"ValidationError", "bad"}, false},
		{apiError{"Throttling", "Rate exceeded"}, true},
		{apiError{"ThrottlingException", "Rate exceeded"}, true},
		{httpError(503, &smithy.GenericAPIError{Code: "ServiceUnavailable", Message: "later"}), true},
		{httpError(500, &smithy.GenericAPIError{Code: "InternalFailure", Message: "oops"}), true},
		{httpError(400, &smithy.GenericAPIError{Code: "SomethingElse", Message: "no"}), false},
		{&smithy.GenericAPIError{Code: "SomethingElse", Fault: smithy.FaultServer}, true},
		{&net.OpError{Op: "dial", Net: "tcp", Err: errors.New("i/o timeout")}, true},
		{presignedLooking(), true},
		{fmt.Errorf("request send failed, %w", &url.Error{Op: "Post", URL: "https://sts.amazonaws.com/", Err: &net.DNSError{Err: "no such host", Name: "sts.amazonaws.com"}}), true},
		{io.ErrUnexpectedEOF, true},
		{fmt.Errorf("failed to refresh cached credentials, %w", errors.New("static credentials are empty")), false},
		{fmt.Errorf("operation error STS: AssumeRole, failed to retrieve credentials: %w", errors.New("no EC2 IMDS role found")), false},
		{errors.New("the session and environment ids may only hold letters"), false},
		{fmt.Errorf("wrapped: %w", context.DeadlineExceeded), true},
		{fmt.Errorf("wrapped: %w", context.Canceled), false},
		{nil, false},
	}
	for _, c := range cases {
		if got := Retryable(c.err); got != c.want {
			t.Errorf("Retryable(%v) = %v, want %v", c.err, got, c.want)
		}
		// Redacting an error never changes how it is classified.
		if got := Retryable(Redact(c.err, "Rate", "oops")); got != c.want {
			t.Errorf("Retryable(Redact(%v)) = %v, want %v", c.err, got, c.want)
		}
	}
}

// presignedLooking is a *url.Error the way net/http returns one for a presigned URL.
func presignedLooking() error {
	return &url.Error{
		Op:  "Get",
		URL: "https://abc-ats.iot.us-east-1.amazonaws.com/mqtt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAEXAMPLE&X-Amz-Security-Token=secret-token",
		Err: errors.New("dial tcp 10.0.0.1:443: i/o timeout"),
	}
}

func TestRedactKeepsTheOperationAndCauseButNeverTheURL(t *testing.T) {
	wrapped := &smithy.OperationError{ServiceID: "IoT Data Plane", OperationName: "SendDirectMessage", Err: fmt.Errorf("request send failed, %w", presignedLooking())}
	for _, err := range []error{presignedLooking(), wrapped, fmt.Errorf("could not connect: %w", presignedLooking())} {
		got := Redact(err)
		msg := got.Error()
		for _, banned := range []string{"X-Amz-", "https://", "secret-token", "amazonaws.com/mqtt"} {
			if strings.Contains(msg, banned) {
				t.Errorf("%q contains %q", msg, banned)
			}
		}
		if !strings.Contains(msg, "Get") || !strings.Contains(msg, "i/o timeout") {
			t.Errorf("%q lost the operation or the cause", msg)
		}
		var u *url.Error
		if errors.As(got, &u) {
			t.Errorf("the *url.Error is still reachable from %q", msg)
		}
	}
	if got, want := Redact(presignedLooking()).Error(), "Get: dial tcp 10.0.0.1:443: i/o timeout"; got != want {
		t.Errorf("%q, want %q", got, want)
	}
	if got, want := Redact(wrapped).Error(), "operation error IoT Data Plane: SendDirectMessage, Get: dial tcp 10.0.0.1:443: i/o timeout"; got != want {
		t.Errorf("%q, want %q", got, want)
	}
	var opErr *net.OpError
	if !errors.As(Redact(&url.Error{Op: "Get", URL: "https://x/?X-Amz-Signature=1", Err: &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("refused")}}), &opErr) {
		t.Error("the network error under the *url.Error is no longer reachable")
	}
	timeout := Redact(&url.Error{Op: "Post", URL: "https://x/?X-Amz-Signature=1", Err: context.DeadlineExceeded})
	if !errors.Is(timeout, context.DeadlineExceeded) {
		t.Errorf("%v no longer is a deadline", timeout)
	}
	plain := errors.New("plain")
	if Redact(plain) != plain {
		t.Error("an error with nothing to hide is replaced")
	}
	if Redact(nil) != nil {
		t.Error("nil is not nil")
	}
	text := Redact(fmt.Errorf("upload to https://bucket.s3.amazonaws.com/k?X-Amz-Signature=abc failed"))
	if strings.Contains(text.Error(), "X-Amz-") || strings.Contains(text.Error(), "https://") {
		t.Errorf("a URL in plain error text survived: %q", text)
	}
}

// Presigned query parameters are removed wherever they appear: in a URL, a bare path, loose
// key=value text, or URL-encoded.
func TestRedactRemovesPresignedQueriesWithoutAScheme(t *testing.T) {
	for _, text := range []string{
		"GET /mqtt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAEXAMPLE%2F20130524%2Fus-east-1%2Fiotdevicegateway%2Faws4_request&X-Amz-Security-Token=tok3n failed",
		"host/mqtt?X-Amz-Signature=e8df4926f8cbb2d1 refused",
		"handshake: X-Amz-Date=20130524T000000Z X-Amz-Security-Token=tok3n, status 403",
		"upgrade /mqtt?x-amz-security-token=tok3n: bad status",
		"path%3FX-Amz-Security-Token%3Dtok3n%26X-Amz-Signature%3De8df4926f8cbb2d1 failed",
		"wss://abc-ats.iot.us-east-1.amazonaws.com/mqtt?X-Amz-Security-Token=tok%2Fen%2B%3D",
		// Quoted values and keys: JSON, single and double quotes, values holding = / + %2F.
		`{"X-Amz-Signature":"e8df4926f8cbb2d1"}`,
		`{"X-Amz-Security-Token": "tok3n/a+b=c%2Fd", "status": 403}`,
		`X-Amz-Signature='e8df4926=f8/cb+b2%2Fd1' rejected`,
		`X-Amz-Security-Token="tok3n=a/b+c%2Fd" rejected`,
		`X-Amz-Security-Token = "tok3n" rejected`,
		`header X-Amz-Security-Token: 'tok3n/a+b=' rejected`,
		"X-Amz-Date: 20130524T000000Z, status 403",
		"X-Amz-Security-Token: tok3n/a+b= rejected",
		"double%253FX-Amz-Security-Token%253Dtok3n%2526x failed",
	} {
		got := Redact(errors.New(text)).Error()
		for _, banned := range []string{"X-Amz-", "x-amz-", "tok3n", "tok%2F", "ASIAEXAMPLE", "e8df4926", "AWS4-HMAC", "20130524", "a/b+", "f8/cb"} {
			if strings.Contains(got, banned) {
				t.Errorf("%q -> %q still contains %q", text, got, banned)
			}
		}
	}
	for text, want := range map[string]string{
		"GET /mqtt?X-Amz-Security-Token=tok3n failed":        "GET /mqtt?<redacted> failed",
		`{"X-Amz-Signature":"e8df4926f8cbb2d1"}`:             `{<redacted>}`,
		`{"X-Amz-Signature":"e8df","X-Amz-Date":"20130524"}`: `{<redacted>,<redacted>}`,
		`X-Amz-Security-Token="tok3n=a/b" rejected`:          `<redacted> rejected`,
		`X-Amz-Signature='e8df' rejected`:                    `<redacted> rejected`,
	} {
		if got := Redact(errors.New(text)).Error(); got != want {
			t.Errorf("%q -> %q, want %q", text, got, want)
		}
	}
	// A header named in prose keeps the words after it: only a value that looks like a
	// credential, a signature or a date (a digit or one of / + = %) is taken for one.
	for _, prose := range []string{
		"missing header X-Amz-Date: the request was rejected",
		"missing X-Amz-Security-Token header",
		"X-Amz-Security-Token: expired",
	} {
		if err := errors.New(prose); Redact(err) != err {
			t.Errorf("%q -> %q", prose, Redact(err))
		}
	}
}

func TestRedactRemovesSecretsFromAPIErrors(t *testing.T) {
	err := httpError(400, &smithy.GenericAPIError{Code: "ValidationError", Message: "Value '" + externalID + "' at 'externalId' failed to satisfy constraint"})
	got := Redact(err, externalID, "")
	if strings.Contains(got.Error(), externalID) {
		t.Fatalf("%q carries the ExternalId", got)
	}
	var apiErr smithy.APIError
	if !errors.As(got, &apiErr) || apiErr.ErrorCode() != "ValidationError" || strings.Contains(apiErr.ErrorMessage(), externalID) {
		t.Fatalf("%v", got)
	}
	for e := error(got); e != nil; e = errors.Unwrap(e) {
		if strings.Contains(e.Error(), externalID) {
			t.Fatalf("an unwrapped error carries the ExternalId: %q", e)
		}
	}
}

// The URL the CLI's signer produces for the same inputs (sigv4.test.js, GOLDEN_URL): both sides
// sign the AWS IoT Core WebSocket URL the same way.
const goldenURL = "wss://abc-ats.iot.us-east-1.amazonaws.com/mqtt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fiotdevicegateway%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=e8df4926f8cbb2d1b2a1d83d2d811455ac8bce957bccea59b55bff870389d73c&X-Amz-Security-Token=tok%2Fen%2B%3D"

var goldenTime = time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC)

func TestPresignIoTMatchesTheCLIsSignerByteForByte(t *testing.T) {
	creds := aws.Credentials{AccessKeyID: "AKIAIOSFODNN7EXAMPLE", SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", SessionToken: "tok/en+="}
	signed, err := PresignIoT(context.Background(), creds, "abc-ats.iot.us-east-1.amazonaws.com", "us-east-1", goldenTime)
	if err != nil {
		t.Fatal(err)
	}
	if signed != goldenURL {
		t.Fatalf("got  %s\nwant %s", signed, goldenURL)
	}
	creds.SessionToken = ""
	unsigned, err := PresignIoT(context.Background(), creds, "abc-ats.iot.us-east-1.amazonaws.com", "us-east-1", goldenTime)
	if err != nil {
		t.Fatal(err)
	}
	if want := strings.TrimSuffix(goldenURL, "&X-Amz-Security-Token=tok%2Fen%2B%3D"); unsigned != want {
		t.Fatalf("without a token: %s", unsigned)
	}
}

func TestPresignIoTErrorsCarryNoURL(t *testing.T) {
	creds := aws.Credentials{AccessKeyID: "AKID", SecretAccessKey: "secret", SessionToken: "token"}
	for _, endpoint := range []string{"", "bad host", "host/with/path", "host?q=1"} {
		_, err := PresignIoT(context.Background(), creds, endpoint, "us-east-1", goldenTime)
		if err == nil {
			t.Errorf("%q: accepted", endpoint)
			continue
		}
		if strings.Contains(err.Error(), "X-Amz-") || strings.Contains(err.Error(), "://") || strings.Contains(err.Error(), "secret") {
			t.Errorf("%q: %v", endpoint, err)
		}
	}
}

type fakeSTS struct {
	mu      sync.Mutex
	inputs  []*sts.AssumeRoleInput
	expires time.Duration
	err     error
}

func (f *fakeSTS) AssumeRole(_ context.Context, in *sts.AssumeRoleInput, _ ...func(*sts.Options)) (*sts.AssumeRoleOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.inputs = append(f.inputs, in)
	if f.err != nil {
		return nil, f.err
	}
	n := fmt.Sprint(len(f.inputs))
	return &sts.AssumeRoleOutput{Credentials: &ststypes.Credentials{
		AccessKeyId:     aws.String("ASIA" + n),
		SecretAccessKey: aws.String("secret" + n),
		SessionToken:    aws.String("token" + n),
		Expiration:      aws.Time(time.Now().Add(f.expires)),
	}}, nil
}

func (f *fakeSTS) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.inputs)
}

const roleARN = "arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1"

func mustBroker(t *testing.T, client stscreds.AssumeRoleAPIClient, s Scope) aws.CredentialsProvider {
	t.Helper()
	p, err := BrokerCredentials(client, roleARN, externalID, s)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// A Scope built by hand is checked as strictly as one from ScopeFromRoleARN: a wildcard or a
// stray character in any part would widen the session policy, so it is refused instead.
func TestAScopeThatWouldWidenThePolicyIsRefused(t *testing.T) {
	for name, bad := range map[string]func(*Scope){
		"session *":       func(s *Scope) { s.Session = "*" },
		"environment *":   func(s *Scope) { s.Environment = "*" },
		"environment +":   func(s *Scope) { s.Environment = "+" },
		"session /":       func(s *Scope) { s.Session = "s/1" },
		"empty session":   func(s *Scope) { s.Session = "" },
		"long session":    func(s *Scope) { s.Session = strings.Repeat("s", 49) },
		"partition *":     func(s *Scope) { s.Partition = "*" },
		"empty partition": func(s *Scope) { s.Partition = "" },
		"account *":       func(s *Scope) { s.Account = "*" },
		"short account":   func(s *Scope) { s.Account = "12345" },
		"region *":        func(s *Scope) { s.Region = "*" },
		"region with :":   func(s *Scope) { s.Region = "us-east-1:x" },
		"empty region":    func(s *Scope) { s.Region = "" },
	} {
		s := scope
		bad(&s)
		if doc, err := SessionPolicy(s); err == nil || doc != "" {
			t.Errorf("%s: policy %q, error %v", name, doc, err)
		}
		f := &fakeSTS{expires: time.Hour}
		if p, err := BrokerCredentials(f, roleARN, externalID, s); err == nil || p != nil {
			t.Errorf("%s: provider %v, error %v", name, p, err)
		} else if Retryable(err) {
			t.Errorf("%s: %v is retryable", name, err)
		}
		if f.calls() != 0 {
			t.Errorf("%s: STS was called", name)
		}
	}
	if err := scope.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestBrokerCredentialsAssumeTheRoleNarrowedToThisEnvironment(t *testing.T) {
	f := &fakeSTS{expires: time.Hour}
	creds, err := mustBroker(t, f, scope).Retrieve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if creds.AccessKeyID != "ASIA1" || creds.SessionToken != "token1" || !creds.CanExpire {
		t.Fatalf("%+v", creds)
	}
	in := f.inputs[0]
	if aws.ToString(in.RoleArn) != roleARN || aws.ToString(in.RoleSessionName) != "sls-dev-e0123456789ab" || aws.ToInt32(in.DurationSeconds) != 3600 {
		t.Errorf("role %s, session name %s, duration %d", aws.ToString(in.RoleArn), aws.ToString(in.RoleSessionName), aws.ToInt32(in.DurationSeconds))
	}
	if aws.ToString(in.ExternalId) != externalID {
		t.Error("the ExternalId was not sent")
	}
	if policy, _ := SessionPolicy(scope); aws.ToString(in.Policy) != policy {
		t.Errorf("session policy %s", aws.ToString(in.Policy))
	}
	if len(in.Tags) != 0 || len(in.PolicyArns) != 0 {
		t.Errorf("tags %v, managed policies %v", in.Tags, in.PolicyArns)
	}
}

func TestBrokerCredentialsAreCachedAndRefreshedBeforeTheyExpire(t *testing.T) {
	f := &fakeSTS{expires: time.Hour}
	p := mustBroker(t, f, scope)
	for range 3 {
		if _, err := p.Retrieve(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if f.calls() != 1 {
		t.Fatalf("an hour-long session was assumed %d times", f.calls())
	}
	if _, ok := p.(*aws.CredentialsCache); !ok {
		// An SDK client given a provider that is not a cache may wrap it in one without the
		// refresh window.
		t.Fatalf("%T is not an *aws.CredentialsCache", p)
	}

	soon := &fakeSTS{expires: RefreshBefore - time.Minute}
	p = mustBroker(t, soon, scope)
	first, _ := p.Retrieve(context.Background())
	second, _ := p.Retrieve(context.Background())
	if soon.calls() != 2 || first.AccessKeyID == second.AccessKeyID {
		t.Fatalf("credentials %s left of their life were reused (%d calls)", RefreshBefore-time.Minute, soon.calls())
	}
}

func TestBrokerCredentialErrorsCarryNoExternalId(t *testing.T) {
	for _, apiErr := range []error{
		&smithy.GenericAPIError{Code: "ValidationError", Message: "Value '" + externalID + "' at 'externalId' failed to satisfy constraint"},
		apiError{"AccessDenied", "not authorized (" + externalID + ")"},
	} {
		f := &fakeSTS{err: httpError(400, apiErr)}
		_, err := mustBroker(t, f, scope).Retrieve(context.Background())
		if err == nil {
			t.Fatal("no error")
		}
		for e := err; e != nil; e = errors.Unwrap(e) {
			if strings.Contains(e.Error(), externalID) {
				t.Fatalf("%q carries the ExternalId", e)
			}
		}
		var a smithy.APIError
		if !errors.As(err, &a) {
			t.Fatalf("%v lost its API error", err)
		}
	}
	f := &fakeSTS{err: httpError(400, apiError{"AccessDenied", "not authorized"})}
	_, err := mustBroker(t, f, scope).Retrieve(context.Background())
	if !Retryable(err) {
		t.Errorf("%v is no longer retryable after the credentials cache", err)
	}
}

// An STS endpoint answering like AWS does, so the SDK's own error types are exercised.
func stsServer(t *testing.T, status int, code, message string) *sts.Client {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), "Action=AssumeRole") {
			t.Errorf("request %s", body)
		}
		w.Header().Set("Content-Type", "text/xml")
		w.WriteHeader(status)
		fmt.Fprintf(w, `<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><Error><Type>Sender</Type><Code>%s</Code><Message>%s</Message></Error><RequestId>r</RequestId></ErrorResponse>`, code, message)
	}))
	t.Cleanup(server.Close)
	return sts.New(sts.Options{
		Region:           "us-east-1",
		BaseEndpoint:     aws.String(server.URL),
		HTTPClient:       server.Client(),
		Credentials:      aws.NewCredentialsCache(staticCreds{}),
		RetryMaxAttempts: 1,
	})
}

func TestBrokerCredentialsThroughTheSDK(t *testing.T) {
	cases := []struct {
		status    int
		code, msg string
		retryable bool
	}{
		{503, "ServiceUnavailable", "later", true},
		{403, "AccessDenied", "User: x is not authorized to perform: sts:AssumeRole", true},
		{403, "AccessDenied", "User: x is not authorized to perform: sts:AssumeRole with an explicit deny in a service control policy", false},
		{400, "ValidationError", "Value '" + externalID + "' at 'externalId' failed to satisfy constraint", false},
		{400, "RegionDisabledException", "STS is not activated in this region", false},
	}
	for _, c := range cases {
		_, err := mustBroker(t, stsServer(t, c.status, c.code, c.msg), scope).Retrieve(context.Background())
		if err == nil {
			t.Fatalf("%s: no error", c.code)
		}
		if got := Retryable(err); got != c.retryable {
			t.Errorf("%s: Retryable(%v) = %v", c.code, err, got)
		}
		if strings.Contains(err.Error(), externalID) || strings.Contains(err.Error(), "://") {
			t.Errorf("%s: %v", c.code, err)
		}
	}
}

func TestBrokerCredentialsWhenSTSIsUnreachable(t *testing.T) {
	server := httptest.NewTLSServer(http.NotFoundHandler())
	client := sts.New(sts.Options{Region: "us-east-1", BaseEndpoint: aws.String(server.URL), HTTPClient: server.Client(), Credentials: staticCreds{}, RetryMaxAttempts: 1})
	server.Close()
	_, err := mustBroker(t, client, scope).Retrieve(context.Background())
	if err == nil || !Retryable(err) {
		t.Fatalf("%v", err)
	}
	if strings.Contains(err.Error(), "://") || strings.Contains(err.Error(), externalID) {
		t.Errorf("%v", err)
	}
}

type staticCreds struct{}

func (staticCreds) Retrieve(context.Context) (aws.Credentials, error) {
	return aws.Credentials{AccessKeyID: "AKID", SecretAccessKey: "secret", SessionToken: "token"}, nil
}

type fakeDataPlane struct {
	in  *iotdataplane.SendDirectMessageInput
	err error
}

func (f *fakeDataPlane) SendDirectMessage(_ context.Context, in *iotdataplane.SendDirectMessageInput, _ ...func(*iotdataplane.Options)) (*iotdataplane.SendDirectMessageOutput, error) {
	f.in = in
	if f.err != nil {
		return nil, f.err
	}
	return &iotdataplane.SendDirectMessageOutput{}, nil
}

func TestPingMapsTheAnswer(t *testing.T) {
	cases := []struct {
		err     error
		want    Liveness
		wantErr bool
	}{
		{nil, Live, false},
		{&iottypes.ResourceNotFoundException{Message: aws.String("no such client")}, Gone, false},
		{&iottypes.GatewayTimeoutException{Message: aws.String("no PUBACK")}, Unknown, false},
		{&iottypes.ForbiddenException{Message: aws.String("denied")}, Denied, true},
		{&iottypes.UnauthorizedException{Message: aws.String("denied")}, Denied, true},
		{&iottypes.ThrottlingException{Message: aws.String("slow down")}, Failed, true},
		{presignedLooking(), Failed, true},
	}
	for _, c := range cases {
		f := &fakeDataPlane{err: c.err}
		got, err := DirectMessenger{Client: f}.Ping(context.Background(), "sls-dev-s_1-cli", "sls-dev/s_1/ping")
		if got != c.want || (err != nil) != c.wantErr {
			t.Errorf("%v: %v %v, want %v", c.err, got, err, c.want)
		}
		if err != nil && (strings.Contains(err.Error(), "X-Amz-") || strings.Contains(err.Error(), "://")) {
			t.Errorf("%v", err)
		}
		in := f.in
		if aws.ToString(in.ClientId) != "sls-dev-s_1-cli" || aws.ToString(in.Topic) != "sls-dev/s_1/ping" || !in.Confirmation || in.Timeout != 1 {
			t.Errorf("input %+v", in)
		}
	}
	for l, s := range map[Liveness]string{Unknown: "unknown", Live: "live", Gone: "gone", Denied: "denied", Failed: "failed", Liveness(99): "Liveness(99)"} {
		if l.String() != s {
			t.Errorf("%d: %s", int(l), l)
		}
	}
}

// The real SDK client against an endpoint that answers like AWS IoT Core: the request goes to the
// account's endpoint, is signed for iotdata with the broker's token, and the answers map.
func TestPingThroughTheSDK(t *testing.T) {
	for _, c := range []struct {
		status int
		code   string
		want   Liveness
	}{
		{200, "", Live},
		{404, "ResourceNotFoundException", Gone},
		{504, "GatewayTimeoutException", Unknown},
		// What AWS IoT Core answers for a connected client whose machine is frozen or asleep: the
		// delivery confirmation did not come within the timeout.
		{504, "InternalFailureException", Unknown},
		{500, "InternalFailureException", Failed},
		{403, "ForbiddenException", Denied},
		{429, "ThrottlingException", Failed},
	} {
		status := c.status
		var seen *http.Request
		server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			seen = r
			if c.code != "" {
				w.Header().Set("X-Amzn-ErrorType", c.code)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			if c.code != "" {
				fmt.Fprint(w, `{"message":"answer"}`)
			}
		}))
		cfg := aws.Config{Region: "us-east-1", HTTPClient: server.Client(), Credentials: staticCreds{}}
		d := NewDirectMessenger(cfg, strings.TrimPrefix(server.URL, "https://"))
		got, err := d.Ping(context.Background(), "sls-dev-s_1-cli", "sls-dev/s_1/ping")
		server.Close()
		if got != c.want {
			t.Errorf("%d: %v (%v), want %v", status, got, err, c.want)
		}
		if seen == nil {
			t.Fatalf("%d: no request", status)
		}
		if seen.Method != http.MethodPost || seen.URL.Path != "/connections/sls-dev-s_1-cli/messages" {
			t.Errorf("%s %s", seen.Method, seen.URL.Path)
		}
		q := seen.URL.Query()
		if q.Get("confirmation") != "true" || q.Get("timeout") != "1" || q.Get("topic") != "sls-dev/s_1/ping" {
			t.Errorf("query %v", q)
		}
		if !strings.Contains(seen.Header.Get("Authorization"), "/us-east-1/iotdata/aws4_request") || seen.Header.Get("X-Amz-Security-Token") != "token" {
			t.Errorf("not signed for iotdata: %v", seen.Header)
		}
	}
}

func TestPingWhenTheEndpointIsUnreachableTriesOnceAndNamesNoURL(t *testing.T) {
	var calls int
	var mu sync.Mutex
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls++
		mu.Unlock()
		w.WriteHeader(http.StatusInternalServerError)
	}))
	cfg := aws.Config{Region: "us-east-1", HTTPClient: server.Client(), Credentials: staticCreds{}}
	d := NewDirectMessenger(cfg, strings.TrimPrefix(server.URL, "https://"))
	if got, _ := d.Ping(context.Background(), "sls-dev-s_1-cli", "sls-dev/s_1/ping"); got != Failed {
		t.Errorf("500: %v", got)
	}
	if calls != 1 {
		t.Errorf("asked %d times; a retried question only answers later", calls)
	}
	server.Close()
	got, err := d.Ping(context.Background(), "sls-dev-s_1-cli", "sls-dev/s_1/ping")
	if got != Failed || err == nil {
		t.Fatalf("%v %v", got, err)
	}
	for _, banned := range []string{"X-Amz-", "://", "/connections/", "topic="} {
		if strings.Contains(err.Error(), banned) {
			t.Errorf("%q contains %q", err, banned)
		}
	}
}
