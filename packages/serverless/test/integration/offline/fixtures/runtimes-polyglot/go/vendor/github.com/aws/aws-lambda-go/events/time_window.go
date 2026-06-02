package events

// Window is the object that captures the time window for the records in the event when using the tumbling windows feature
// Kinesis: https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html#services-kinesis-windows
// DDB: https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-windows
type Window struct {
	Start RFC3339EpochTime `json:"start"`
	End   RFC3339EpochTime `json:"end"`
}

// TimeWindowProperties is the object that captures properties that relate to the tumbling windows feature
// Kinesis: https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html#services-kinesis-windows
// DDB: https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-windows
type TimeWindowProperties struct {
	// Time window for the records in the event.
	Window Window `json:"window"`

	// State being built up to this invoke in the time window.
	State map[string]string `json:"state"`

	// Shard id of the records
	ShardID string `json:"shardId"`

	// The event source ARN of the service that generated the event (eg. DynamoDB or Kinesis)
	EventSourceARN string `json:"eventSourceARN"`

	// Set to true for the last invoke of the time window.
	// Subsequent invoke will start a new time window along with a fresh state.
	IsFinalInvokeForWindow bool `json:"isFinalInvokeForWindow"`

	// Set to true if window is terminated prematurely.
	// Subsequent invoke will continue the same window with a fresh state.
	IsWindowTerminatedEarly bool `json:"isWindowTerminatedEarly"`
}

// TimeWindowEventResponseProperties is the object that captures response properties that relate to the tumbling windows feature
// Kinesis: https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html#services-kinesis-windows
// DDB: https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-windows
type TimeWindowEventResponseProperties struct {
	// State being built up to this invoke in the time window.
	State map[string]string `json:"state"`
}
