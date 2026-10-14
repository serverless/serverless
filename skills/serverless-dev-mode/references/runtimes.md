# Handlers on this machine

What a handler sees under Dev Mode, where it can differ from the deployed
function. The guide's "Runtimes on your machine", "What a handler gets from
your machine" and "Credentials and security" sections have the full text:
`serverless agent docs providers/aws/guide/dev-mode`.

## Node.js and TypeScript

- Handlers run on the Node.js that runs the CLI, which needs 18.19, 20.6 or
  later; an MCP server function needs 20.6 or later and otherwise stays
  `deployed` with `local_runtime_missing`. When its major version differs from the deployed runtime's, the
  session prints one line, for example
  `Node.js on this machine is 24.21.0; api is deployed on nodejs22.x.`
- TypeScript runs from the Framework's esbuild build when the service uses
  it, otherwise from the source files through the tsx loader. That build
  has the files `package.patterns` select, where the deployed artifact has
  them (with `package.individually`, each attached function's own too, in
  one shared build); dependencies come from the service's `node_modules`. The loader
  emits no decorator metadata: a `tsconfig.json` with
  `emitDecoratorMetadata` prints a warning.
- From the deployed `NODE_OPTIONS`, handlers keep the runtime settings this
  Node.js accepts and `--require`/`-r`/`--import` of your own files in the
  service directory (outside `node_modules`). Packages, code loaders,
  debuggers, library loader variables (`LD_*`, `DYLD_*`) and the function's
  proxy, certificate, TLS and OpenSSL variables, host-name resolver variables
  (`HOSTALIASES`, `RES_OPTIONS`, `LOCALDOMAIN`), variables that make a
  shell, Python, Perl, Ruby, Java, Git or Node.js the handler starts run
  other code (`SHELLOPTS`, `PS4`, `BASH_FUNC_*`, git's own such as `GIT_SSH_COMMAND`, `PYTHONWARNINGS`
  naming a module and the like), and variables that make Node.js or Python read or write files
  elsewhere (`NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE`, `PYTHONPYCACHEPREFIX`
  and the like) are left out; the session names what it left out once. This
  machine's own proxy, certificate, TLS, OpenSSL, host-name resolver, Python
  installation, coverage (`NODE_V8_COVERAGE`) and bytecode cache
  (`PYTHONPYCACHEPREFIX`) settings apply instead. Other variables come
  from the deployed configuration only, never from what an invocation
  brings, except the values Lambda sets per execution environment (the
  role's credentials, the log stream and the like).

## Python

- The first Python 3.9 or later in this order: the active virtualenv
  (`VIRTUAL_ENV`), the service's `.venv`, then `python3` and `python` on
  `PATH` (on Windows `python`, then `python3`, the pyenv-win interpreter and
  the `py` launcher). A version manager's shim on `PATH` (pyenv) is not
  what runs the handler: the interpreter it starts is. A different
  major.minor than the deployed runtime prints one line. None found: the function stays `deployed` with
  `local_runtime_missing`.
- Dev Mode installs nothing. Dependencies built for Lambda's Linux can fail
  to import on macOS or Windows: install the requirements into `.venv` on
  this machine. Its packages, including editable installs that add their
  directory to the path (src layouts, hatch, poetry, pdm, uv), win over
  `.serverless/requirements`, which only fills in what the environment lacks.
  An activated named conda environment counts as an environment too; conda's
  `base` does not. Without a virtual or named conda environment,
  `.serverless/requirements` comes ahead of installed packages.

## Processes, reloads, timeouts

- Each warm Lambda execution environment gets one handler process here,
  reused while warm, so module state carries over between its invocations
  as in a warm Lambda. Memory grows with the number of environments Lambda
  starts, up to 24 handler processes per session: at 24 the process idle the
  longest stops to make room, and when all 24 are busy a new environment's
  invocation runs the deployed code, counted as `invocation.passed_through`
  with reason `worker_limit`. A replay counts as a new environment: when all
  24 are busy it is refused (exit 1) with that message, and nothing is
  recorded. Idle processes exit after 5 minutes.
- A save rebuilds and reloads every function the session runs here,
  whichever file changed: a running invocation finishes on the old code, the
  next one runs the new code. When a build fails, the functions it affects
  keep the last good build and the others reload. The watcher ignores `.serverless`,
  `node_modules`, `.git`, `__pycache__`, `.venv`, `venv`, `.pytest_cache`,
  `.mypy_cache`, `coverage` and test files (`*.test.*`, `*.spec.*`,
  `*_test.py`). A function's configured handler module is watched even when
  its name looks like a test file, but not inside an ignored directory.
- An invocation still running 1 s after its deadline ends as Lambda ends it
  (`Sandbox.Timedout`) and its process is replaced. A response over 6 MB
  ends with `Function.ResponseSizeTooLarge`, as deployed.
- A relayed invocation adds about 0.4–0.8 s (1.1–1.6 s through S3).

## Credentials and environment

- The handler gets the deployed function's environment variables and role,
  not those in `serverless.yml`: run `serverless deploy` after changing
  them.
- From this machine it gets only what it needs to run here: path, home and
  temporary directories, locale, Windows system variables, the
  Python environment (virtual or conda environment), library loader
  settings, a local X-Ray daemon address (`AWS_XRAY_DAEMON_ADDRESS`), the
  proxy, certificate, TLS, OpenSSL and host-name resolver settings, the
  Python installation settings (`PYTHONHOME`, `PYTHONUSERBASE`,
  `PYTHONEXECUTABLE`), the debugging setting `PYTHONBREAKPOINT` (which
  debugger `breakpoint()` starts), and where Node.js writes coverage and
  Python keeps its bytecode cache (`NODE_V8_COVERAGE`, `PYTHONPYCACHEPREFIX`).
  Its time zone is UTC (`TZ=UTC`), as in Lambda. No other variable of the
  shell reaches it, start-up, warning and compile-cache settings such as
  `BASH_ENV`, `PYTHONSTARTUP`, `PYTHONINSPECT`, `NODE_REDIRECT_WARNINGS` or
  `NODE_COMPILE_CACHE` included; set what a handler needs on the function.
- Role credentials come from an endpoint on `127.0.0.1`, as in Lambda; the
  AWS SDKs find them as usual. Your own `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE` and other
  credential variables are unset, and the AWS configuration files it sees
  are empty.
- The code reaches real resources with the function's IAM permissions.

## Known differences from Lambda

- The stack frames below your code are not Lambda's.
- Lambda's metadata endpoint is not available here: `AWS_LAMBDA_METADATA_API`
  and `AWS_LAMBDA_METADATA_TOKEN` are left out.
- An init error the deployed code also has is answered by the deployed code.
- A direct invocation cannot tell synchronous from asynchronous, so
  `caller_received` names both.
- A function URL caller does not see an error raised after a response
  stream started; the session shows it.
- On Windows, stopping a handler process does not reach a child that starts
  its own process group.
