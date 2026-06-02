package events

// IAMPolicyDocument represents an IAM policy document.
type IAMPolicyDocument struct {
	Version   string
	Statement []IAMPolicyStatement
}

// IAMPolicyStatement represents one statement from IAM policy with action, effect and resource.
type IAMPolicyStatement struct {
	Action   []string
	Effect   string
	Resource []string
}
