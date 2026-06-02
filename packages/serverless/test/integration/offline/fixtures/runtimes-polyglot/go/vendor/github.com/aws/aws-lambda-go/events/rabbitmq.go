package events

type RabbitMQEvent struct {
	EventSource     string                       `json:"eventSource"`
	EventSourceARN  string                       `json:"eventSourceArn"`
	MessagesByQueue map[string][]RabbitMQMessage `json:"rmqMessagesByQueue"`
}

type RabbitMQMessage struct {
	BasicProperties RabbitMQBasicProperties `json:"basicProperties"`
	Data            string                  `json:"data"`
	Redelivered     bool                    `json:"redelivered"`
}

type RabbitMQBasicProperties struct {
	ContentType     string                 `json:"contentType"`
	ContentEncoding *string                `json:"contentEncoding"`
	Headers         map[string]interface{} `json:"headers"` // Application or header exchange table
	DeliveryMode    uint8                  `json:"deliveryMode"`
	Priority        uint8                  `json:"priority"`
	CorrelationID   *string                `json:"correlationId"`
	ReplyTo         *string                `json:"replyTo"`
	Expiration      string                 `json:"expiration"`
	MessageID       *string                `json:"messageId"`
	Timestamp       string                 `json:"timestamp"`
	Type            *string                `json:"type"`
	UserID          string                 `json:"userId"`
	AppID           *string                `json:"appId"`
	ClusterID       *string                `json:"clusterId"`
	BodySize        uint64                 `json:"bodySize"`
}
