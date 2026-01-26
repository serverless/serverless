# AgentCore Dev Mode

Local development mode for AWS Bedrock AgentCore runtimes with support for both Docker and code deployment methods.

## Supported Modes

### Docker Mode
- **When:** Agent has `artifact.docker` configuration or Dockerfile exists
- **Process:** Builds Docker image, runs container
- **Benefits:** Full isolation, exact production match
- **File watching:** Watches Dockerfile directory

### Code Mode
- **When:** Agent has `artifact.entryPoint` configuration
- **Process:** Runs Python directly (no Docker)
- **Benefits:** Faster startup, easier debugging
- **File watching:** Watches all `.py` files in project

## Mode Detection

Priority order (matches packaging logic):
1. `artifact.docker` exists → Docker mode
2. `artifact.entryPoint` exists (no docker, containerImage, or s3.bucket) → Code mode  
3. `Dockerfile` exists in project root → Docker mode (implicit)
4. None found → Error

## Features (Both Modes)

- ✅ AWS credentials injection via STS AssumeRole
- ✅ IAM trust policy automatic configuration
- ✅ File watching with hot reload
- ✅ Interactive chat interface
- ✅ Streaming responses
- ✅ Session management

## Code Mode Requirements

### User Handler Requirements
For custom port support, users should modify their handler:

```python
if __name__ == "__main__":
    port = int(os.getenv('PORT', 8080))
    app.run(port=port, host='0.0.0.0')
```

### Python Environment
- Python 3.12+ recommended
- **Virtual environment strongly recommended** for proper AWS credential isolation
  - Prevents boto3 from accessing system-level AWS config (`~/.aws/config`, SSO cache)
  - Create with: `python3 -m venv venv && source venv/bin/activate`
  - Detected automatically via `VIRTUAL_ENV` environment variable
- Dependencies must be installed (`pip install -r requirements.txt`)

### File Structure
```
my-agent/
├── handler.py          # Entry point (artifact.entryPoint)
├── requirements.txt    # Dependencies
├── serverless.yml      # Configuration
└── venv/              # Virtual environment (strongly recommended)
```

## Architecture

```
dev/index.js (main)
├── Detects mode (Docker vs Code)
├── Manages AWS credentials
├── Handles file watching
├── Provides chat interface
└── Delegates to:
    ├── Docker mode (inline in index.js)
    │   ├── DockerBuilder (builds image)
    │   └── DockerClient (runs container)
    └── Code mode (code-mode.js)
        └── Spawns Python process directly
```

## Files

- `index.js` - Main dev mode orchestration (both modes)
- `code-mode.js` - Python process management for code deployment
- `../docker/builder.js` - Shared Docker build logic

## Configuration

### Docker Mode Example
```yaml
agents:
  myAgent:
    type: runtime
    artifact:
      docker:
        path: .
        platform: linux/arm64
```

### Code Mode Example
```yaml
agents:
  myAgent:
    type: runtime
    artifact:
      entryPoint:
        - handler.py
      runtime: PYTHON_3_13
```

## Usage

```bash
# Start dev mode (auto-detects mode)
serverless dev --agent myAgent

# Specify custom port
serverless dev --agent myAgent --port 9000
```

## Implementation Notes

### AWS Credentials
- **Both modes use identical credential handling:**
  - Temporary STS credentials obtained via AssumeRole (60-minute expiration)
  - Credentials automatically refreshed on rebuild (when file changes detected)
  - 10-minute expiration window triggers proactive refresh
- **Code mode isolation:**
  - Uses temporary HOME directory to prevent boto3 from finding `~/.aws/config`
  - Sets `AWS_CONFIG_FILE=/dev/null` and `AWS_SHARED_CREDENTIALS_FILE=/dev/null`
  - Virtual environment provides additional isolation from system boto3 config

### Port Configuration
- Docker mode: Maps container port 8080 to host `--port`
- Code mode: Sets `PORT` environment variable (user handler must read it)

### Crash Handling
- Process/container crashes → Show error and exit dev mode
- No auto-restart (user fixes issue and restarts manually)

### Python Version Detection
- Converts `PYTHON_3_13` → `python3.13` command
- Windows: Uses `python.exe`
- Checks installed version and warns on mismatch

### File Watching Exclusions
Both modes exclude:
- `venv/`, `.venv/`
- `__pycache__/`, `*.pyc`
- `node_modules/`
- `.git/`
- `.pytest_cache/`, `.mypy_cache/`
- Test files (`*_test.py`, `*.test.py`)

Code mode additionally only watches `.py` files.
