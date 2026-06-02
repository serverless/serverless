// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
//
// Helpers for accessing context information from an Invoke request. Context information
// is stored in a https://golang.org/pkg/context/#Context. The functions FromContext and NewContext
// are used to retrieving and inserting an instance of LambdaContext.

package lambdacontext

import (
	"context"
	"os"
	"strconv"
)

// LogGroupName is the name of the log group that contains the log streams of the current Lambda Function
var LogGroupName string

// LogStreamName name of the log stream that the current Lambda Function's logs will be sent to
var LogStreamName string

// FunctionName the name of the current Lambda Function
var FunctionName string

// MemoryLimitInMB is the configured memory limit for the current instance of the Lambda Function
var MemoryLimitInMB int

// FunctionVersion is the published version of the current instance of the Lambda Function
var FunctionVersion string

func init() {
	LogGroupName = os.Getenv("AWS_LAMBDA_LOG_GROUP_NAME")
	LogStreamName = os.Getenv("AWS_LAMBDA_LOG_STREAM_NAME")
	FunctionName = os.Getenv("AWS_LAMBDA_FUNCTION_NAME")
	if limit, err := strconv.Atoi(os.Getenv("AWS_LAMBDA_FUNCTION_MEMORY_SIZE")); err != nil {
		MemoryLimitInMB = 0
	} else {
		MemoryLimitInMB = limit
	}
	FunctionVersion = os.Getenv("AWS_LAMBDA_FUNCTION_VERSION")
}

// ClientApplication is metadata about the calling application.
type ClientApplication struct {
	InstallationID string `json:"installation_id"`
	AppTitle       string `json:"app_title"`
	AppVersionCode string `json:"app_version_code"`
	AppPackageName string `json:"app_package_name"`
}

// ClientContext is information about the client application passed by the calling application.
type ClientContext struct {
	Client ClientApplication
	Env    map[string]string `json:"env"`
	Custom map[string]string `json:"custom"`
}

// CognitoIdentity is the cognito identity used by the calling application.
type CognitoIdentity struct {
	CognitoIdentityID     string
	CognitoIdentityPoolID string
}

// LambdaContext is the set of metadata that is passed for every Invoke.
type LambdaContext struct {
	AwsRequestID       string //nolint: stylecheck
	InvokedFunctionArn string //nolint: stylecheck
	Identity           CognitoIdentity
	ClientContext      ClientContext
}

// An unexported type to be used as the key for types in this package.
// This prevents collisions with keys defined in other packages.
type key struct{}

// The key for a LambdaContext in Contexts.
// Users of this package must use lambdacontext.NewContext and lambdacontext.FromContext
// instead of using this key directly.
var contextKey = &key{}

// NewContext returns a new Context that carries value lc.
func NewContext(parent context.Context, lc *LambdaContext) context.Context {
	return context.WithValue(parent, contextKey, lc)
}

// FromContext returns the LambdaContext value stored in ctx, if any.
func FromContext(ctx context.Context) (*LambdaContext, bool) {
	lc, ok := ctx.Value(contextKey).(*LambdaContext)
	return lc, ok
}
