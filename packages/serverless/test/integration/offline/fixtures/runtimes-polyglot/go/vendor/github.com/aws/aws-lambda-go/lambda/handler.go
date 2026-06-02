// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package lambda

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil" // nolint:staticcheck
	"reflect"
	"strings"

	"github.com/aws/aws-lambda-go/lambda/handlertrace"
)

type Handler interface {
	Invoke(ctx context.Context, payload []byte) ([]byte, error)
}

type handlerOptions struct {
	handlerFunc
	baseContext              context.Context
	jsonResponseEscapeHTML   bool
	jsonResponseIndentPrefix string
	jsonResponseIndentValue  string
	enableSIGTERM            bool
	sigtermCallbacks         []func()
}

type Option func(*handlerOptions)

// WithContext is a HandlerOption that sets the base context for all invocations of the handler.
//
// Usage:
//
//	lambda.StartWithOptions(
//	 	func (ctx context.Context) (string, error) {
//	 		return ctx.Value("foo"), nil
//	 	},
//	 	lambda.WithContext(context.WithValue(context.Background(), "foo", "bar"))
//	)
func WithContext(ctx context.Context) Option {
	return Option(func(h *handlerOptions) {
		h.baseContext = ctx
	})
}

// WithSetEscapeHTML sets the SetEscapeHTML argument on the underlying json encoder
//
// Usage:
//
//	lambda.StartWithOptions(
//		func () (string, error) {
//			return "<html><body>hello!></body></html>", nil
//		},
//		lambda.WithSetEscapeHTML(true),
//	)
func WithSetEscapeHTML(escapeHTML bool) Option {
	return Option(func(h *handlerOptions) {
		h.jsonResponseEscapeHTML = escapeHTML
	})
}

// WithSetIndent sets the SetIndent argument on the underling json encoder
//
// Usage:
//
//	lambda.StartWithOptions(
//		func (event any) (any, error) {
//			return event, nil
//		},
//		lambda.WithSetIndent(">"," "),
//	)
func WithSetIndent(prefix, indent string) Option {
	return Option(func(h *handlerOptions) {
		h.jsonResponseIndentPrefix = prefix
		h.jsonResponseIndentValue = indent
	})
}

// WithEnableSIGTERM enables SIGTERM behavior within the Lambda platform on container spindown.
// SIGKILL will occur ~500ms after SIGTERM.
// Optionally, an array of callback functions to run on SIGTERM may be provided.
//
// Usage:
//
//	lambda.StartWithOptions(
//	    func (event any) (any, error) {
//			return event, nil
//		},
//		lambda.WithEnableSIGTERM(func() {
//			log.Print("function container shutting down...")
//		})
//	)
func WithEnableSIGTERM(callbacks ...func()) Option {
	return Option(func(h *handlerOptions) {
		h.sigtermCallbacks = append(h.sigtermCallbacks, callbacks...)
		h.enableSIGTERM = true
	})
}

// handlerTakesContext returns whether the handler takes a context.Context as its first argument.
func handlerTakesContext(handler reflect.Type) (bool, error) {
	switch handler.NumIn() {
	case 0:
		return false, nil
	case 1:
		contextType := reflect.TypeOf((*context.Context)(nil)).Elem()
		argumentType := handler.In(0)
		if argumentType.Kind() != reflect.Interface {
			return false, nil
		}

		// handlers like func(event any) are valid.
		if argumentType.NumMethod() == 0 {
			return false, nil
		}

		if !contextType.Implements(argumentType) || !argumentType.Implements(contextType) {
			return false, fmt.Errorf("handler takes an interface, but it is not context.Context: %q", argumentType.Name())
		}
		return true, nil
	case 2:
		contextType := reflect.TypeOf((*context.Context)(nil)).Elem()
		argumentType := handler.In(0)
		if argumentType.Kind() != reflect.Interface || !contextType.Implements(argumentType) || !argumentType.Implements(contextType) {
			return false, fmt.Errorf("handler takes two arguments, but the first is not Context. got %s", argumentType.Kind())
		}
		return true, nil
	}
	return false, fmt.Errorf("handlers may not take more than two arguments, but handler takes %d", handler.NumIn())
}

func validateReturns(handler reflect.Type) error {
	errorType := reflect.TypeOf((*error)(nil)).Elem()

	switch n := handler.NumOut(); {
	case n > 2:
		return fmt.Errorf("handler may not return more than two values")
	case n > 1:
		if !handler.Out(1).Implements(errorType) {
			return fmt.Errorf("handler returns two values, but the second does not implement error")
		}
	case n == 1:
		if !handler.Out(0).Implements(errorType) {
			return fmt.Errorf("handler returns a single value, but it does not implement error")
		}
	}

	return nil
}

// NewHandler creates a base lambda handler from the given handler function. The
// returned Handler performs JSON serialization and deserialization, and
// delegates to the input handler function. The handler function parameter must
// satisfy the rules documented by Start. If handlerFunc is not a valid
// handler, the returned Handler simply reports the validation error.
func NewHandler(handlerFunc interface{}) Handler {
	return NewHandlerWithOptions(handlerFunc)
}

// NewHandlerWithOptions creates a base lambda handler from the given handler function. The
// returned Handler performs JSON serialization and deserialization, and
// delegates to the input handler function. The handler function parameter must
// satisfy the rules documented by Start. If handlerFunc is not a valid
// handler, the returned Handler simply reports the validation error.
func NewHandlerWithOptions(handlerFunc interface{}, options ...Option) Handler {
	return newHandler(handlerFunc, options...)
}

func newHandler(handlerFunc interface{}, options ...Option) *handlerOptions {
	if h, ok := handlerFunc.(*handlerOptions); ok {
		return h
	}
	h := &handlerOptions{
		baseContext:              context.Background(),
		jsonResponseEscapeHTML:   false,
		jsonResponseIndentPrefix: "",
		jsonResponseIndentValue:  "",
	}
	for _, option := range options {
		option(h)
	}
	if h.enableSIGTERM {
		enableSIGTERM(h.sigtermCallbacks)
	}
	h.handlerFunc = reflectHandler(handlerFunc, h)
	return h
}

type handlerFunc func(context.Context, []byte) (io.Reader, error)

// back-compat for the rpc mode
func (h handlerFunc) Invoke(ctx context.Context, payload []byte) ([]byte, error) {
	response, err := h(ctx, payload)
	if err != nil {
		return nil, err
	}
	// if the response needs to be closed (ex: net.Conn, os.File), ensure it's closed before the next invoke to prevent a resource leak
	if response, ok := response.(io.Closer); ok {
		defer response.Close()
	}
	// optimization: if the response is a *bytes.Buffer, a copy can be eliminated
	switch response := response.(type) {
	case *jsonOutBuffer:
		return response.Bytes(), nil
	case *bytes.Buffer:
		return response.Bytes(), nil
	}
	b, err := ioutil.ReadAll(response)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func errorHandler(err error) handlerFunc {
	return func(_ context.Context, _ []byte) (io.Reader, error) {
		return nil, err
	}
}

type jsonOutBuffer struct {
	*bytes.Buffer
}

func (j *jsonOutBuffer) ContentType() string {
	return contentTypeJSON
}

func reflectHandler(f interface{}, h *handlerOptions) handlerFunc {
	if f == nil {
		return errorHandler(errors.New("handler is nil"))
	}

	// back-compat: types with reciever `Invoke(context.Context, []byte) ([]byte, error)` need the return bytes wrapped
	if handler, ok := f.(Handler); ok {
		return func(ctx context.Context, payload []byte) (io.Reader, error) {
			b, err := handler.Invoke(ctx, payload)
			if err != nil {
				return nil, err
			}
			return bytes.NewBuffer(b), nil
		}
	}

	handler := reflect.ValueOf(f)
	handlerType := reflect.TypeOf(f)
	if handlerType.Kind() != reflect.Func {
		return errorHandler(fmt.Errorf("handler kind %s is not %s", handlerType.Kind(), reflect.Func))
	}

	takesContext, err := handlerTakesContext(handlerType)
	if err != nil {
		return errorHandler(err)
	}

	if err := validateReturns(handlerType); err != nil {
		return errorHandler(err)
	}

	out := &jsonOutBuffer{bytes.NewBuffer(nil)}
	return func(ctx context.Context, payload []byte) (io.Reader, error) {
		out.Reset()
		in := bytes.NewBuffer(payload)
		decoder := json.NewDecoder(in)
		encoder := json.NewEncoder(out)
		encoder.SetEscapeHTML(h.jsonResponseEscapeHTML)
		encoder.SetIndent(h.jsonResponseIndentPrefix, h.jsonResponseIndentValue)

		trace := handlertrace.FromContext(ctx)

		// construct arguments
		var args []reflect.Value
		if takesContext {
			args = append(args, reflect.ValueOf(ctx))
		}
		if (handlerType.NumIn() == 1 && !takesContext) || handlerType.NumIn() == 2 {
			eventType := handlerType.In(handlerType.NumIn() - 1)
			event := reflect.New(eventType)
			if err := decoder.Decode(event.Interface()); err != nil {
				return nil, err
			}
			if nil != trace.RequestEvent {
				trace.RequestEvent(ctx, event.Elem().Interface())
			}
			args = append(args, event.Elem())
		}

		response := handler.Call(args)

		// return the error, if any
		if len(response) > 0 {
			if errVal, ok := response[len(response)-1].Interface().(error); ok && errVal != nil {
				return nil, errVal
			}
		}
		// set the response value, if any
		var val interface{}
		if len(response) > 1 {
			val = response[0].Interface()
			if nil != trace.ResponseEvent {
				trace.ResponseEvent(ctx, val)
			}
		}

		// encode to JSON
		if err := encoder.Encode(val); err != nil {
			// if response is not JSON serializable, but the response type is a reader, return it as-is
			if reader, ok := val.(io.Reader); ok {
				return reader, nil
			}
			return nil, err
		}

		// if response value is an io.Reader, return it as-is
		if reader, ok := val.(io.Reader); ok {
			// back-compat, don't return the reader if the value serialized to a non-empty json
			if strings.HasPrefix(out.String(), "{}") {
				return reader, nil
			}
		}

		// back-compat, strip the encoder's trailing newline unless WithSetIndent was used
		if h.jsonResponseIndentValue == "" && h.jsonResponseIndentPrefix == "" {
			out.Truncate(out.Len() - 1)
		}
		return out, nil
	}
}
