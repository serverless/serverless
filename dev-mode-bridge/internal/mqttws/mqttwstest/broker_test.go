package mqttwstest

import "testing"

func TestTopicFiltersMatchLikeMQTT(t *testing.T) {
	cases := []struct {
		filter, topic string
		want          bool
	}{
		{"sls-dev/s_1/down/e1", "sls-dev/s_1/down/e1", true},
		{"sls-dev/s_1/down/e1", "sls-dev/s_1/down/e2", false},
		{"sls-dev/s_1/down/e1", "sls-dev/s_1/down/e1/x", false},
		{"sls-dev/s_1/down/e1", "sls-dev/s_1/down", false},
		{"sls-dev/s_1/#", "sls-dev/s_1/up", true},
		{"sls-dev/s_1/#", "sls-dev/s_1/down/e1", true},
		{"sls-dev/s_1/#", "sls-dev/s_1", true},
		{"sls-dev/s_1/#", "sls-dev/s_10/up", false},
		{"sls-dev/s_1/#", "sls-dev/s_2/up", false},
		{"sls-dev/+/up", "sls-dev/s_1/up", true},
		{"sls-dev/+/up", "sls-dev/s_1/down/e1", false},
		{"#", "sls-dev/s_1/up", true},
		{"#", "$aws/events/presence/connected/c1", false},
		{"+/events/#", "$aws/events/x", false},
		{"$aws/events/#", "$aws/events/x", true},
		{"sls-dev/#/up", "sls-dev/s_1/up", false},
	}
	for _, c := range cases {
		if got := Matches(c.filter, c.topic); got != c.want {
			t.Errorf("Matches(%q, %q) = %v, want %v", c.filter, c.topic, got, c.want)
		}
	}
}
