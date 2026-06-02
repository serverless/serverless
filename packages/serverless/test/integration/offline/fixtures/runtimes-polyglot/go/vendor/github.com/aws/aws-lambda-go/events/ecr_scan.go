package events

type ECRScanEvent struct {
	Version    string                 `json:"version"`
	ID         string                 `json:"id"`
	DetailType string                 `json:"detail-type"`
	Source     string                 `json:"source"`
	Time       string                 `json:"time"`
	Region     string                 `json:"region"`
	Resources  []string               `json:"resources"`
	Account    string                 `json:"account"`
	Detail     ECRScanEventDetailType `json:"detail"`
}

type ECRScanEventDetailType struct {
	ScanStatus            string                            `json:"scan-status"`
	RepositoryName        string                            `json:"repository-name"`
	FindingSeverityCounts ECRScanEventFindingSeverityCounts `json:"finding-severity-counts"`
	ImageDigest           string                            `json:"image-digest"`
	ImageTags             []string                          `json:"image-tags"`
}

type ECRScanEventFindingSeverityCounts struct {
	Critical      int64 `json:"CRITICAL"`
	High          int64 `json:"HIGH"`
	Medium        int64 `json:"MEDIUM"`
	Low           int64 `json:"LOW"`
	Informational int64 `json:"INFORMATIONAL"`
	Undefined     int64 `json:"UNDEFINED"`
}
