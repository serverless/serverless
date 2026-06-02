// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package lambda

import (
	"context"
	"log"
	"os"
)

// Start takes a handler and talks to an internal Lambda endpoint to pass requests to the handler. If the
// handler does not match one of the supported types an appropriate error message will be returned to the caller.
// Start blocks, and does not return after being called.
//
// Rules:
//
//   - handler must be a function
//   - handler may take between 0 and two arguments.
//   - if there are two arguments, the first argument must satisfy the "context.Context" interface.
//   - handler may return between 0 and two values.
//   - if there are two return values, the second return value must be an error.
//   - if there is one return value it must be an error.
//
// Valid function signatures:
//
//	func ()
//	func (TIn)
//	func () error
//	func (TIn) error
//	func () (TOut, error)
//	func (TIn) (TOut, error)
//	func (context.Context)
//	func (context.Context) error
//	func (context.Context) (TOut, error)
//	func (context.Context, TIn)
//	func (context.Context, TIn) error
//	func (context.Context, TIn) (TOut, error)
//
// Where "TIn" and "TOut" are types compatible with the "encoding/json" standard library.
// See https://golang.org/pkg/encoding/json/#Unmarshal for how deserialization behaves
//
// "TOut" may also implement the io.Reader interface.
// If "TOut" is both json serializable and implements io.Reader, then the json serialization is used.
func Start(handler interface{}) {
	StartWithOptions(handler)
}

// StartWithContext is the same as Start except sets the base context for the function.
//
// Deprecated: use lambda.StartWithOptions(handler, lambda.WithContext(ctx)) instead
func StartWithContext(ctx context.Context, handler interface{}) {
	StartWithOptions(handler, WithContext(ctx))
}

// StartHandler takes in a Handler wrapper interface which can be implemented either by a
// custom function or a struct.
//
// Handler implementation requires a single "Invoke()" function:
//
//	func Invoke(context.Context, []byte) ([]byte, error)
//
// Deprecated: use lambda.Start(handler) instead
func StartHandler(handler Handler) {
	StartWithOptions(handler)
}

// StartWithOptions is the same as Start after the application of any handler options specified
func StartWithOptions(handler interface{}, options ...Option) {
	start(newHandler(handler, options...))
}

type startFunction struct {
	env string
	f   func(envValue string, handler Handler) error
}

var (
	runtimeAPIStartFunction = &startFunction{
		env: "AWS_LAMBDA_RUNTIME_API",
		f:   startRuntimeAPILoop,
	}
	startFunctions = []*startFunction{runtimeAPIStartFunction}

	// This allows end to end testing of the Start functions, by tests overwriting this function to keep the program alive
	logFatalf = log.Fatalf
)

// StartHandlerWithContext is the same as StartHandler except sets the base context for the function.
//
// Handler implementation requires a single "Invoke()" function:
//
//	func Invoke(context.Context, []byte) ([]byte, error)
//
// Deprecated: use lambda.StartWithOptions(handler, lambda.WithContext(ctx)) instead
func StartHandlerWithContext(ctx context.Context, handler Handler) {
	StartWithOptions(handler, WithContext(ctx))
}

func start(handler *handlerOptions) {
	var keys []string
	for _, start := range startFunctions {
		config := os.Getenv(start.env)
		if config != "" {
			// in normal operation, the start function never returns
			// if it does, exit!, this triggers a restart of the lambda function
			err := start.f(config, handler)
			logFatalf("%v", err)
		}
		keys = append(keys, start.env)
	}
	logFatalf("expected AWS Lambda environment variables %s are not defined", keys)

}
