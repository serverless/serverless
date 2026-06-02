package events

import "time"

type ECRImageActionEvent struct {
	Version    string                        `json:"version"`
	ID         string                        `json:"id"`
	DetailType string                        `json:"detail-type"`
	Source     string                        `json:"source"`
	Account    string                        `json:"account"`
	Time       time.Time                     `json:"time"`
	Region     string                        `json:"region"`
	Resources  []string                      `json:"resources"`
	Detail     ECRImageActionEventDetailType `json:"detail"`
}

type ECRImageActionEventDetailType struct {
	Result         string `json:"result"`
	RepositoryName string `json:"repository-name"`
	ImageDigest    string `json:"image-digest"`
	ActionType     string `json:"action-type"`
	ImageTag       string `json:"image-tag"`
}
