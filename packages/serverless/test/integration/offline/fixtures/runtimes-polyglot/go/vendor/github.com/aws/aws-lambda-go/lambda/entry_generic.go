//go:build go1.18
// +build go1.18

// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved

package lambda

import (
	"context"
)

// HandlerFunc represents a valid input with two arguments and two returns as described by Start
type HandlerFunc[TIn, TOut any] interface {
	func(context.Context, TIn) (TOut, error)
}

// StartHandlerFunc is the same as StartWithOptions except that it takes a generic input
// so that the function signature can be validated at compile time.
func StartHandlerFunc[TIn any, TOut any, H HandlerFunc[TIn, TOut]](handler H, options ...Option) {
	start(newHandler(handler, options...))
}
