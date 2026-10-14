package bridge

import "testing"

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestConfigFromEnvDefaultsToPort9140(t *testing.T) {
	cfg, err := ConfigFromEnv(env(map[string]string{"SLS_DEV_REAL_RUNTIME_API": "169.254.100.1:9001"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RealRuntimeAPI != "169.254.100.1:9001" || cfg.ListenAddr != "127.0.0.1:9140" {
		t.Fatalf("got %+v", cfg)
	}
}

func TestConfigFromEnvHonoursThePort(t *testing.T) {
	cfg, err := ConfigFromEnv(env(map[string]string{"SLS_DEV_REAL_RUNTIME_API": "127.0.0.1:9001", "SLS_DEV_BRIDGE_PORT": "9555"}))
	if err != nil || cfg.ListenAddr != "127.0.0.1:9555" {
		t.Fatalf("got %+v %v", cfg, err)
	}
}

func TestConfigFromEnvRejectsBadInput(t *testing.T) {
	cases := []map[string]string{
		{},
		{"SLS_DEV_REAL_RUNTIME_API": "127.0.0.1:9001", "SLS_DEV_BRIDGE_PORT": "99999"},
		{"SLS_DEV_REAL_RUNTIME_API": "127.0.0.1:9001", "SLS_DEV_BRIDGE_PORT": "abc"},
		{"SLS_DEV_REAL_RUNTIME_API": "127.0.0.1:9001", "SLS_DEV_BRIDGE_PORT": "0"},
	}
	for _, c := range cases {
		if _, err := ConfigFromEnv(env(c)); err == nil {
			t.Errorf("expected an error for %v", c)
		}
	}
}
