"""Runs a Lambda handler on the developer's machine for Serverless Framework Dev Mode.

The counterpart of the Lambda Python runtime interface client: it speaks the Lambda Runtime API
that Dev Mode serves on loopback (AWS_LAMBDA_RUNTIME_API), imports the handler once (the init
phase), then runs one invocation at a time until that API goes away. One process stands for one
Lambda execution environment, so module state lives as long as it would in Lambda.

sys.argv[1] is JSON: {"handler": "src/app.handler", "taskRoot": "...", "serviceDir": "...",
"fallbackPaths": ["..."], "deployedRuntime": "python3.13", "parentPid": 123, "ownGroup": true}.
fallbackPaths (the requirements built for the function) go after an active virtual or named
conda environment's own packages and ahead of every other package directory (see requirements_index).
Python 3.9 or later, standard library only.
"""
import os

# This process's parent when it started, read before the other imports. watch_parent() compares
# it with the CLI's pid from the configuration.
STARTED_BY = os.getppid()

import base64
import decimal
import errno
import http.client
import importlib
import json
import logging
import re
import signal
import site
import socket
import sys
import sysconfig
import threading
import time
import traceback
import uuid
from urllib.parse import quote

# Anything the connection to the Runtime API raises: that API has gone away.
GONE = (OSError, http.client.HTTPException)
OWN_FILES = {os.path.abspath(__file__), os.path.realpath(__file__)}

# A directory is rewritten only where a path starts (line start, whitespace, a quote, a bracket,
# "=" or ",") and as whole segments, so /work/app leaves /backup/work/app and /work/application
# alone.
PATH_START = r"(?:^|(?<=[\s(\[<\"'`=,]))"
PATH_END = r"(?=[\\/:)\]>\"'`\s,]|$)"
# Where interpreters keep third-party packages, never shown as Lambda's standard library.
THIRD_PARTY = ("site-packages", "dist-packages")


class Fault(Exception):
    """A failure the runtime reports under its own error type, the way Lambda does."""

    def __init__(self, error_type, message, stack_trace=None):
        super().__init__(message)
        self.error_type = error_type
        self.message = message
        self.stack_trace = stack_trace or []


class CognitoIdentity:
    def __init__(self, value):
        value = value if isinstance(value, dict) else {}
        self.cognito_identity_id = value.get("cognitoIdentityId")
        self.cognito_identity_pool_id = value.get("cognitoIdentityPoolId")


class Client:
    def __init__(self, value):
        self.installation_id = value.get("installation_id")
        self.app_title = value.get("app_title")
        self.app_version_name = value.get("app_version_name")
        self.app_version_code = value.get("app_version_code")
        self.app_package_name = value.get("app_package_name")


class ClientContext:
    def __init__(self, value):
        client = value.get("client")
        self.client = Client(client) if isinstance(client, dict) else None
        self.custom = value.get("custom")
        self.env = value.get("env")


def parse_header(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except ValueError:
        pass
    try:
        return json.loads(base64.b64decode(value).decode("utf-8"))
    except ValueError:
        return None


class LambdaContext:
    def __init__(self, headers):
        self.aws_request_id = headers.get("lambda-runtime-aws-request-id")
        self.invoked_function_arn = headers.get("lambda-runtime-invoked-function-arn")
        self.function_name = os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        self.function_version = os.environ.get("AWS_LAMBDA_FUNCTION_VERSION")
        self.memory_limit_in_mb = os.environ.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE")
        self.log_group_name = os.environ.get("AWS_LAMBDA_LOG_GROUP_NAME")
        self.log_stream_name = os.environ.get("AWS_LAMBDA_LOG_STREAM_NAME")
        self.identity = CognitoIdentity(parse_header(headers.get("lambda-runtime-cognito-identity")))
        client_context = parse_header(headers.get("lambda-runtime-client-context"))
        self.client_context = ClientContext(client_context) if isinstance(client_context, dict) else None
        self.tenant_id = headers.get("lambda-runtime-aws-tenant-id")
        try:
            self._deadline_ms = int(headers.get("lambda-runtime-deadline-ms", "0"))
        except ValueError:
            self._deadline_ms = 0

    def get_remaining_time_in_millis(self):
        remaining = self._deadline_ms - int(time.time() * 1000)
        return remaining if remaining > 0 else 0


class RuntimeApi:
    def __init__(self, address):
        authority, _, prefix = address.partition("/")
        self.authority = authority
        self.base = ("/" + prefix if prefix else "") + "/2018-06-01/runtime"

    def call(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(self.authority)
        try:
            connection.request(method, self.base + path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, {k.lower(): v for k, v in response.getheaders()}, response.read()
        finally:
            connection.close()

    def post_error(self, path, body):
        self.call(
            "POST",
            path,
            json.dumps(body).encode("utf-8"),
            {"Content-Type": "application/json", "Lambda-Runtime-Function-Error-Type": body["errorType"]},
        )


def lambda_paths(locations):
    """What the caller receives never shows this machine's paths: each (directory, Lambda path,
    kept) location reads as the Lambda path, the directory matched as given and as its real path
    (symbolic links resolved), longest first, except where the next segment is one of the kept
    names. Separators after a Lambda path become forward slashes."""
    found = {}
    for directory, shown, kept in locations:
        directory = (directory or "").rstrip("/\\")
        if directory:
            found.setdefault(directory, (shown, kept))
            found.setdefault(os.path.realpath(directory), (shown, kept))

    def matcher(directory, kept):
        keep = "(?![\\\\/](?:%s)%s)" % ("|".join(re.escape(name) for name in kept), PATH_END) if kept else ""
        return re.compile(PATH_START + re.escape(directory) + keep + PATH_END, re.M)

    patterns = [
        (matcher(directory, kept), shown)
        for directory, (shown, kept) in sorted(found.items(), key=lambda item: len(item[0]), reverse=True)
    ]
    separators = re.compile(
        "(?:%s)\\\\[^\\s\"'`:)\\]>,]*" % "|".join(re.escape(shown) for shown, _ in set(found.values()))
    )

    def rewrite(text):
        for pattern, shown in patterns:
            text = pattern.sub(lambda match: shown, text)
        if not found:
            return text
        return separators.sub(lambda match: match.group(0).replace("\\", "/"), text)

    return rewrite


def text_of(value):
    try:
        return str(value)
    except Exception:
        return "<unprintable %s object>" % type(value).__name__


def stack_of(trace, rewrite):
    """The frames of a traceback, without this client's own, in Lambda's stackTrace form."""
    frames = [
        frame
        for frame in traceback.extract_tb(trace)
        if os.path.abspath(frame.filename) not in OWN_FILES
    ]
    return [rewrite(line) for line in traceback.format_list(frames)]


def syntax_stack(error, rewrite):
    """Where the code failed to parse, in the form Lambda's runtime gives it:
    '  File "<file>" Line <n>\n    <the line as written>'."""
    if not error.filename:
        return []
    line = '  File "%s"' % error.filename
    if error.lineno is not None:
        line += " Line %s" % error.lineno
    line += "\n"
    if error.text:
        line += "    %s" % error.text
        if not error.text.endswith("\n"):
            line += "\n"
    return [rewrite(line)]


def error_body(error, request_id, rewrite):
    if isinstance(error, Fault):
        error_type, message, stack_trace = error.error_type, error.message, error.stack_trace
    else:
        error_type = type(error).__name__
        message = text_of(error)
        stack_trace = stack_of(error.__traceback__, rewrite)
    return {
        "errorMessage": rewrite(message),
        "errorType": error_type,
        "requestId": request_id or "",
        "stackTrace": stack_trace,
    }


def load_handler(handler, rewrite):
    """Imports the handler's module once, the init phase; failures carry Lambda's error types and
    name the module the way the handler string does."""
    module_name, _, function_name = handler.rpartition(".")
    if not module_name or not function_name:
        raise Fault("Runtime.MalformedHandlerName", "Bad handler '%s': expected module.function" % handler)
    try:
        module = importlib.import_module(module_name.replace("/", "."))
    except ImportError as error:
        raise Fault("Runtime.ImportModuleError", "Unable to import module '%s': %s" % (module_name, text_of(error)))
    except SyntaxError as error:
        raise Fault(
            "Runtime.UserCodeSyntaxError",
            "Syntax error in module '%s': %s" % (module_name, text_of(error)),
            syntax_stack(error, rewrite),
        )
    except Exception as error:
        raise Fault(type(error).__name__, text_of(error), stack_of(error.__traceback__, rewrite))
    function = getattr(module, function_name, None)
    if function is None or not callable(function):
        raise Fault("Runtime.HandlerNotFound", "Handler '%s' missing on module '%s'" % (function_name, module_name))
    return function


def escapes_text(runtime):
    """Lambda's Python runtimes before 3.12 escape non-ASCII text in a JSON result; 3.12 and later
    return it as it is. An unknown runtime is taken as a current one."""
    match = re.match(r"python(\d+)\.(\d+)", runtime or "")
    return bool(match) and (int(match.group(1)), int(match.group(2))) < (3, 12)


def to_json(value, ensure_ascii=False):
    """JSON text as Lambda's runtime writes it: a Decimal is written as its own digits (str(), so
    1.10 stays 1.10 and no digit is lost to a float), a NaN one as NaN. The standard library has no
    raw JSON value, so each Decimal is written as a marker string first and replaced after."""
    marker = "\x00decimal-%s-" % uuid.uuid4().hex
    decimals = []

    def default(item):
        if isinstance(item, decimal.Decimal):
            decimals.append("NaN" if item.is_nan() else str(item))
            return "%s%d" % (marker, len(decimals) - 1)
        raise TypeError("Object of type %s is not JSON serializable" % type(item).__name__)

    text = json.dumps(value, default=default, ensure_ascii=ensure_ascii)
    if not decimals:
        return text
    quoted = json.dumps(marker, ensure_ascii=ensure_ascii)[:-1]
    return re.sub(re.escape(quoted) + r'(\d+)"', lambda match: decimals[int(match.group(1))], text)


def answer(handler, headers, body, request_id, rewrite, ensure_ascii=False):
    """Runs one invocation: ("response", payload, content type) or ("error", error body)."""
    try:
        try:
            # As in Lambda's runtime, the body is always JSON: an empty one is not.
            event = json.loads(body)
        except ValueError as error:
            raise Fault("Runtime.UnmarshalError", "Unable to unmarshal input: %s" % error)
        result = handler(event, LambdaContext(headers))
    except Exception as error:
        return "error", error_body(error, request_id, rewrite)
    # Like Lambda, bytes are the response as they are; anything else is serialised as JSON.
    if isinstance(result, bytes):
        return "response", result, "application/unknown"
    try:
        return "response", to_json(result, ensure_ascii).encode("utf-8"), "application/json"
    except Exception as error:
        return "error", {
            "errorMessage": rewrite("Unable to marshal response: %s" % text_of(error)),
            "errorType": "Runtime.MarshalError",
            "requestId": request_id,
            "stackTrace": [],
        }


def serve_next(api, handler, rewrite, ensure_ascii=False):
    status, headers, body = api.call("GET", "/invocation/next")
    if status != 200:
        sys.exit(1)
    request_id = headers.get("lambda-runtime-aws-request-id", "")
    trace_id = headers.get("lambda-runtime-trace-id")
    if trace_id:
        os.environ["_X_AMZN_TRACE_ID"] = trace_id
    else:
        os.environ.pop("_X_AMZN_TRACE_ID", None)
    try:
        outcome = answer(handler, headers, body, request_id, rewrite, ensure_ascii)
    except Exception as error:
        # A failure of this client, not of the handler: the invocation is answered all the same.
        outcome = "error", {
            "errorMessage": "The runtime client failed: %s" % text_of(error),
            "errorType": "Runtime.Unknown",
            "requestId": request_id,
            "stackTrace": [],
        }
    path = "/invocation/%s/" % quote(request_id, safe="")
    if outcome[0] == "response":
        api.call("POST", path + "response", outcome[1], {"Content-Type": outcome[2]})
    else:
        api.post_error(path + "error", outcome[1])


def parent_check(parent_pid):
    """Whether the CLI that started this process is gone. The CLI passes its pid, so a CLI that
    died before this process started is noticed too. Started by the CLI itself, this process is
    adopted away when the CLI ends; started through a launcher that stays in between, it asks
    whether the CLI still runs. On Windows neither works (no adoption, and os.kill would terminate
    the CLI): the Runtime API going away ends the process instead."""
    given = isinstance(parent_pid, int) and not isinstance(parent_pid, bool) and parent_pid > 0
    expected = parent_pid if given else STARTED_BY
    if STARTED_BY == expected:
        return lambda: os.getppid() != expected
    if os.name == "nt":
        return lambda: False

    def gone():
        try:
            os.kill(expected, 0)
        except (ProcessLookupError, PermissionError):
            # PermissionError: the pid now belongs to another user's process, so the CLI is gone.
            return True
        except OSError:
            return False
        return False

    return gone


def leave(own_group):
    """On POSIX the CLI starts this process as the leader of its own process group and says so with
    ownGroup: the whole group goes, with whatever the handler started. Only a group this process
    leads is ever signalled; elsewhere the process alone exits. The CLI starts this process
    unbuffered (-u), so nothing written is left to flush."""
    if own_group and os.name != "nt" and os.getpgrp() == os.getpid():
        try:
            os.killpg(os.getpid(), signal.SIGKILL)
        except OSError:
            pass
    os._exit(0)


# A connect that is refused or reset, or a host that cannot be reached: the listener is gone. A
# connect that is slow or times out is a busy CLI, not a gone one.
REFUSED = (ConnectionRefusedError, ConnectionResetError)
# Windows retries a refused loopback connect for about 2 s before reporting it.
LISTENER_CHECK_TIMEOUT = 3 if os.name == "nt" else 1


def runtime_api_refuses(address):
    """Whether a connect to the Runtime API is refused: the CLI that served it is gone."""
    authority = address.partition("/")[0]
    host, _, port = authority.rpartition(":")
    try:
        socket.create_connection((host, int(port)), timeout=LISTENER_CHECK_TIMEOUT).close()
        return False
    except REFUSED:
        return True
    except OSError as error:
        return error.errno == errno.EHOSTUNREACH
    except ValueError:
        return False


def watch_parent(parent_pid, address, own_group):
    """Once the CLI is gone (its process, or its Runtime API listener), nothing will invoke this
    process again. The listener goes away with the CLI on every platform, so a connect to it every
    2 s covers Windows and a handler that never returns; two refused in a row mean it is gone."""
    gone = parent_check(parent_pid)

    def loop():
        refused_in_a_row = 0
        ticks = 0
        while True:
            time.sleep(1)
            if gone():
                leave(own_group)
            ticks += 1
            if not address or ticks % 2:
                continue
            refused_in_a_row = refused_in_a_row + 1 if runtime_api_refuses(address) else 0
            if refused_in_a_row >= 2:
                leave(own_group)

    threading.Thread(target=loop, daemon=True).start()


def log_to_stdout():
    """Lambda's runtime gives the root logger a handler that writes to stdout, so a handler's
    logger.info() shows once it sets its level. The line keeps Lambda's level tag; the
    timestamp and request id stay out of the terminal."""
    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(logging.Formatter("[%(levelname)s]\t%(message)s"))
    logging.getLogger().addHandler(stream)


def under(entry, directory):
    """Whether the path entry is the directory or inside it."""
    entry = os.path.normcase(os.path.abspath(entry))
    directory = os.path.normcase(os.path.abspath(directory))
    return entry == directory or entry.startswith(directory.rstrip(os.sep) + os.sep)


def outside_site_directories(prefix):
    """The site directories that are not the environment's at `prefix`: the base interpreter's
    and the user's."""
    directories = []
    try:
        directories.extend(site.getsitepackages([getattr(sys, "base_prefix", prefix)]))
    except Exception:
        pass
    try:
        directories.append(site.getusersitepackages())
    except Exception:
        pass
    return [
        directory
        for directory in directories
        if directory and not under(directory, prefix) and not under(prefix, directory)
    ]


def requirements_index():
    """Where the requirements built for the function go on sys.path. In an active virtual
    environment or named conda environment (not conda's base, which holds the others), right after
    its own entries, including the paths its .pth files add (editable
    installs): the packages installed there for this machine win, and the requirements win over
    the base interpreter's site-packages that follow. Without one, right after the task root,
    ahead of every installed package, as PYTHONPATH would."""
    prefix = sys.prefix
    venv = os.path.normcase(os.path.abspath(prefix)) != os.path.normcase(
        os.path.abspath(getattr(sys, "base_prefix", prefix))
    )
    conda = os.path.isdir(os.path.join(prefix, "conda-meta")) and not os.path.isdir(
        os.path.join(prefix, "envs")
    )
    if not venv and not conda:
        return 1
    own = [index for index, entry in enumerate(sys.path) if entry and under(entry, prefix)]
    if not own:
        return len(sys.path)
    # The entries its .pth files add follow its site directory, up to the next site directory.
    outside = outside_site_directories(prefix)
    for index in range(own[-1] + 1, len(sys.path)):
        entry = sys.path[index]
        if entry and any(under(entry, directory) for directory in outside):
            return index
    return len(sys.path)


def main():
    # A SIGINT that reaches this process (on Windows, Ctrl+C in the console reaches it too; on
    # POSIX it runs in its own process group) ends it the way any process ends on SIGINT, without
    # a KeyboardInterrupt traceback. The CLI decides what happens to the session.
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    config = json.loads(sys.argv[1])
    own_group = config.get("ownGroup") is True
    address = os.environ.get("AWS_LAMBDA_RUNTIME_API", "")
    watch_parent(config.get("parentPid"), address, own_group)
    task_root = config.get("taskRoot") or os.getcwd()
    rewrite = lambda_paths(
        [
            (task_root, "/var/task", ()),
            (config.get("serviceDir"), "/var/task", ()),
            # Some interpreters keep third-party packages inside the standard library directory.
            # Those are not Lambda's: their frames keep this machine's path, so a package missing
            # from the deployment never looks like one the runtime provides.
            (sysconfig.get_paths()["stdlib"], "/var/lang/lib/python%d.%d" % sys.version_info[:2], THIRD_PARTY),
        ]
    )
    sys.path[:] = [task_root] + [entry for entry in sys.path if entry != task_root]
    at = requirements_index()
    for entry in config.get("fallbackPaths") or []:
        if entry not in sys.path:
            sys.path.insert(at, entry)
            at += 1
    log_to_stdout()
    api = RuntimeApi(address)
    try:
        handler = load_handler(config["handler"], rewrite)
    except Fault as fault:
        try:
            api.post_error("/init/error", error_body(fault, None, rewrite))
        except GONE:
            pass
        sys.exit(1)
    ensure_ascii = escapes_text(config.get("deployedRuntime"))
    while True:
        try:
            serve_next(api, handler, rewrite, ensure_ascii)
        except GONE:
            leave(own_group)


if __name__ == "__main__":
    main()
