import json
import os
import platform
import signal
import threading
import sys
import time
import traceback
import uuid
import gzip
import base64
from datetime import datetime
from contextlib import contextmanager
from importlib import import_module
from io import BytesIO

try:
    from urlparse import urlparse  # python 2
except ImportError:
    from urllib.parse import urlparse  # python 3

from serverless_sdk.spans import Span
from serverless_sdk.vendor import wrapt

module_start_time = time.time()

capture_hosts = {}
if "SERVERLESS_ENTERPRISE_SPANS_CAPTURE_HOSTS" in os.environ:
    for domain in os.environ.get("SERVERLESS_ENTERPRISE_SPANS_CAPTURE_HOSTS", "").split(
        ","
    ):
        if domain:
            capture_hosts[domain.lower()] = True
else:
    capture_hosts["*"] = True
ignore_hosts = {}
if "SERVERLESS_ENTERPRISE_SPANS_IGNORE_HOSTS" in os.environ:
    for domain in os.environ.get("SERVERLESS_ENTERPRISE_SPANS_IGNORE_HOSTS", "").split(
        ","
    ):
        if domain:
            ignore_hosts[domain] = True
            ignore_hosts[domain.lower()] = True


def get_user_handler(user_handler_value):
    orig_path = sys.path
    if "/" in user_handler_value:
        user_module_path, user_module_and_handler = user_handler_value.rsplit(
            "/", 1)
        sys.path.append(user_module_path)
    else:
        user_module_and_handler = user_handler_value

    user_module_name, user_handler_name = user_module_and_handler.rsplit(".", 1)
    user_module = import_module(user_module_name)
    if "/" in user_handler_value:
        sys.path.pop()

    return getattr(user_module, user_handler_name)


# will be replaced by real exception capture and span func in SDK.transaction
def _capture_exception(x): return None


def _span(x): return x


def capture_exception(exception):
    _capture_exception(exception)


def tag_event(tag, value='', custom=''):
    _tag_event(tag, value, custom)


def span(span_type):
    return _span(span_type)


def set_endpoint(endpoint, http_method=None, http_status_code=None, meta=None):
    _set_endpoint(endpoint, http_method=http_method, http_status_code=http_status_code, meta=meta)


def get_transaction_id():
    return _get_transaction_id()


def get_dashboard_url(transaction_id=None):
    return _get_dashboard_url(transaction_id)


class SDK(object):
    def __init__(
        self,
        org_id,
        application_name,
        app_uid,
        org_uid,
        deployment_uid,
        service_name,
        should_log_meta,
        should_compress_logs,
        disable_aws_spans,
        disable_http_spans,
        stage_name,
        plugin_version,
        disable_frameworks_instrumentation,
        serverless_platform_stage,
    ):
        self.org_id = org_id
        self.application_name = application_name
        self.app_uid = app_uid
        self.org_uid = org_uid
        self.deployment_uid = deployment_uid
        self.service_name = service_name
        self.should_log_meta = should_log_meta
        self.should_compress_logs = should_compress_logs
        self.disable_aws_spans = disable_aws_spans
        self.disable_http_spans = disable_http_spans
        self.stage_name = stage_name
        self.plugin_version = plugin_version
        self.serverless_platform_stage = serverless_platform_stage
        self.invokation_count = 0
        self.spans = []
        self.event_tags = []
        self.endpoint = None
        self.http_method = None
        self.http_status_code = None
        self.endpoint_meta = None

        self.instrument_botocore()
        self.instrument_urllib3()
        self.instrument_stdlib_urllib("urllib.request")
        self.instrument_stdlib_urllib("urllib2")

        if not disable_frameworks_instrumentation:
            self.instrument_flask("flask")

    def handler(self, user_handler, function_name, timeout):
        def wrapped_handler(event, context):
            with self.transaction(event, context, function_name, timeout):
                return user_handler(event, context)

        return wrapped_handler

    def span(self, span_type):
        """
        A wrapper around the Span context manager that sets the emitter to be
        appending to self.spans
        """
        return Span(self.spans.append, span_type)

    def user_span(self, span_type):
        """
        A wrapper around the Span context manager that sets the emitter to be
        appending to self.spans and sets span type to custom and the user
        specified span type as the label tag.
        """
        span = Span(self.spans.append, "custom")
        span.set_tag("label", span_type)
        return span

    @contextmanager
    def transaction(self, event, context, function_name, timeout):
        start = time.time()
        if self.invokation_count > 0:  # reset spans when not a cold start
            self.spans = []
            self.event_tags = []
            self.endpoint = None
        start_isoformat = datetime.utcnow().isoformat() + "Z"
        exception = None
        error_data = {
            "errorCulprit": None,
            "errorExceptionMessage": None,
            "errorExceptionStacktrace": None,
            "errorExceptionType": None,
            "errorId": None,
            "errorFatal": None,
        }

        def capture_exception(exception):
            try:
                raise exception
            except Exception as exc:
                exception = exc
                exc_type, exc_value, exc_traceback = sys.exc_info()
                stack_frames = traceback.extract_tb(exc_traceback)
                error_data["errorCulprit"] = "{} ({})".format(
                    stack_frames[-1][2], stack_frames[-1][0]
                )
                error_data["errorExceptionMessage"] = str(exc_value)
                error_data["errorExceptionStacktrace"] = json.dumps(
                    [
                        {
                            "filename": frame[0],
                            "lineno": frame[1],
                            "function": frame[2],
                            "library_frame": False,
                            "abs_path": os.path.abspath(frame[0]),
                            "pre_context": [],
                            "context_line": frame[3],
                            "post_context": [],
                        }
                        for frame in reversed(stack_frames)
                    ]
                )
                error_data["errorExceptionType"] = exc_type.__name__
                error_data["errorFatal"] = False
                error_data["errorId"] = "{}!${}".format(
                    exc_type.__name__, str(exc_value)[:200]
                )

        def tag_event(tag, value='', custom=''):
            self.event_tags.append(
                {'tagName': str(tag), 'tagValue': str(value), 'custom': json.dumps(custom)})
            if len(self.event_tags) > 10:
                self.event_tags.pop(0)

        def set_endpoint(endpoint, http_method=None, http_status_code=None, meta=None):
            if endpoint: self.endpoint = endpoint
            if http_method: self.http_method = http_method
            if http_status_code: self.http_status_code = str(http_status_code)
            self.endpoint_meta = meta

        is_custom_authorizer = "methodArn" in event and event.get("type") in (
            "TOKEN",
            "REQUEST",
        )
        is_apig = (
            all(
                key in event
                for key in [
                    "path",
                    "headers",
                    "requestContext",
                    "resource",
                    "httpMethod",
                ]
            )
            and "requestId" in event["requestContext"]
        )
        if not is_custom_authorizer and is_apig:
            # For APIGW access logs
            span_id = event["requestContext"]["requestId"]
        else:
            span_id = str(uuid.uuid4())

        def get_transaction_id():
            return span_id

        def get_dashboard_url(transaction_id=None):
            domain = "serverless" if self.serverless_platform_stage == "prod" else "serverless-dev"
            return "/".join([
              "https://app.{}.com".format(domain),
              self.org_id,
              "apps",
              self.application_name,
              self.service_name,
              self.stage_name,
              os.environ.get("AWS_REGION"),
              "explorer",
              span_id if transaction_id is None else transaction_id,
            ])

        class SDK_METHOD_WRAPPER:
            def __init__(self, capture_exception, tag_event, span, set_endpoint, get_transaction_id):
                self.capture_exception = capture_exception
                self.tag_event = tag_event
                self.span = span
                self.set_endpoint = set_endpoint
                self.get_transaction_id = get_transaction_id
                self.get_dashboard_url = get_dashboard_url

        global _capture_exception
        _capture_exception = capture_exception
        context.capture_exception = capture_exception

        global _tag_event
        _tag_event = tag_event

        global _span
        _span = self.user_span
        context.span = self.user_span

        global _set_endpoint
        _set_endpoint = set_endpoint

        global _get_transaction_id
        _get_transaction_id = get_transaction_id

        global _get_dashboard_url
        _get_dashboard_url = get_dashboard_url

        context.serverless_sdk = SDK_METHOD_WRAPPER(
            capture_exception, tag_event, span, set_endpoint, get_transaction_id)

        # handle getting a SIGTERM, which represents an imminent timeout
        def sigterm_handler(signal, frame):
            error_data["errorCulprit"] = "timeout"
            error_data["errorExceptionMessage"] = "Function execution duration going to exceeded configured timeout limit."
            error_data["errorExceptionStacktrace"] = "[]"
            error_data["errorExceptionType"] = "TimeoutError"
            error_data["errorFatal"] = True
            error_data["errorId"] = "TimeoutError!$Function execution duration going to exceeded configured timeout limit."
            finalize()

        signal.signal(signal.SIGTERM, sigterm_handler)

        # create a thread to SIGTERM self right before timeout
        def sigterm_sender():
            os.kill(os.getpid(), signal.SIGTERM)

        sigterm_timer = threading.Timer(timeout - 0.05, sigterm_sender)
        sigterm_timer.start()

        def finalize():
            sigterm_timer.cancel()
            if os.path.exists("/proc/meminfo"):
                meminfo = {
                    line.split(":")[0].strip(): int(
                        line.split(":")[1].strip().split(" kB")[0]
                    )
                    for line in open("/proc/meminfo").readlines()
                }
            else:
                meminfo = {}
            self.invokation_count += 1
            end_isoformat = datetime.utcnow().isoformat() + "Z"
            tags = {
                "appUid": self.app_uid,
                "applicationName": self.application_name,
                "computeContainerUptime": (time.time() - module_start_time) * 1000,
                "computeCustomArn": context.invoked_function_arn,
                "computeCustomAwsRequestId": context.aws_request_id,
                "computeCustomEnvArch": platform.architecture()[0],
                # TODO '[{"model":"Intel(R) Xeon(R) Processor @ 2.50GHz","speed":2500,"times":{"user":2200,"nice":0,"sys":2300,"idle":8511300,"irq":0}},{"model":"Intel(R) Xeon(R) Processor @ 2.50GHz","speed":2500,"times":{"user":1200,"nice":0,"sys":1700,"idle":8513400,"irq":0}}]',
                "computeCustomEnvCpus": None,
                "computeCustomEnvMemoryFree": meminfo.get("MemFree") * 1024
                if meminfo
                else None,
                "computeCustomEnvMemoryTotal": meminfo.get("MemTotal") * 1024
                if meminfo
                else None,
                "computeCustomEnvPlatform": sys.platform,
                "computeCustomFunctionName": os.environ.get("AWS_LAMBDA_FUNCTION_NAME"),
                "computeCustomFunctionVersion": os.environ.get(
                    "AWS_LAMBDA_FUNCTION_VERSION"
                ),
                "computeCustomInvokeId": None,
                "computeCustomLogGroupName": os.environ.get(
                    "AWS_LAMBDA_LOG_GROUP_NAME"
                ),
                "computeCustomLogStreamName": os.environ.get(
                    "AWS_LAMBDA_LOG_STREAM_NAME"
                ),
                "computeCustomMemorySize": os.environ.get(
                    "AWS_LAMBDA_FUNCTION_MEMORY_SIZE"
                ),
                "computeCustomRegion": os.environ.get("AWS_REGION"),
                "computeCustomSchemaType": "s-compute-aws-lambda",
                "computeCustomSchemaVersion": "0.0",
                "computeCustomXTraceId": os.environ.get("_X_AMZN_TRACE_ID"),
                "computeInstanceInvocationCount": self.invokation_count,
                "computeIsColdStart": self.invokation_count == 1,
                "computeMemoryPercentageUsed": (
                    meminfo["MemTotal"] - meminfo["MemFree"]
                )
                / meminfo["MemTotal"]
                if meminfo
                else None,
                "computeMemorySize": os.environ.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE"),
                # '{"rss":35741696,"heapTotal":11354112,"heapUsed":7258288,"external":8636}',
                "computeMemoryUsed": None,
                "computeRegion": os.environ.get("AWS_REGION"),
                "computeRuntime": "aws.lambda.python.{}".format(
                    sys.version.split(" ")[0]
                ),
                "computeType": "aws.lambda",
                "eventCustomStage": "dev",
                "eventSource": None,
                "eventTimestamp": start_isoformat,
                "eventType": "unknown",
                "functionName": function_name,
                "schemaType": "s-transaction-function",
                "schemaVersion": "0.0",
                "serviceName": self.service_name,
                "stageName": self.stage_name,
                "tenantId": self.org_id,
                "tenantUid": self.org_uid,
                "pluginVersion": self.plugin_version,
                "timeout": timeout,
                "timestamp": start_isoformat,
                "traceId": context.aws_request_id,
                "transactionId": span_id,
                "endpoint": self.endpoint,
                "httpMethod": self.http_method,
                "httpStatusCode": self.http_status_code,
                "endpointMechanism": self.endpoint_meta["mechanism"] if self.endpoint_meta else "explicit",
            }
            tags.update(error_data)
            if error_data["errorExceptionType"] == "TimeoutError":
                transaction_type = "report"
            elif error_data["errorId"]:
                transaction_type = "error"
            else:
                transaction_type = "transaction"
            transaction_data = {
                "type": transaction_type,
                "origin": "sls-agent",
                "payload": {
                    "duration": (time.time() - start) * 1000,
                    "endTime": end_isoformat,
                    "logs": {},
                    "operationName": "s-transaction-function",
                    "schemaType": "s-span",
                    "schemaVersion": "0.0",
                    "spanContext": {
                        "spanId": span_id,
                        "traceId": context.aws_request_id,
                        "xTraceId": os.environ.get("_X_AMZN_TRACE_ID"),
                    },
                    # Limit spans to only the first 50
                    "spans": self.spans[:50],
                    "eventTags": self.event_tags,
                    "startTime": start_isoformat,
                    "tags": tags,
                },
                "requestId": context.aws_request_id,
                "schemaVersion": "0.0",
                "timestamp": end_isoformat,
            }

            if exception and error_data["errorFatal"]:
                raise exception

        try:
            yield
        except Exception as exc:
            exception = exc
            exc_type, exc_value, exc_traceback = sys.exc_info()
            stack_frames = traceback.extract_tb(exc_traceback)
            error_data["errorCulprit"] = "{} ({})".format(
                stack_frames[-1][2], stack_frames[-1][0]
            )
            error_data["errorExceptionMessage"] = str(exc_value)
            error_data["errorExceptionStacktrace"] = json.dumps(
                [
                    {
                        "filename": frame[0],
                        "lineno": frame[1],
                        "function": frame[2],
                        "library_frame": False,
                        "abs_path": os.path.abspath(frame[0]),
                        "pre_context": [],
                        "context_line": frame[3],
                        "post_context": [],
                    }
                    for frame in reversed(stack_frames)
                ]
            )
            error_data["errorExceptionType"] = exc_type.__name__
            error_data["errorFatal"] = True
            error_data["errorId"] = "{}!${}".format(
                exc_type.__name__, str(exc_value)[:200]
            )
        finally:
            finalize()

    def instrument_botocore(self):
        def wrapper(wrapped, instance, args, kwargs):
            if (
                not self.disable_aws_spans
            ):
                with self.span("aws") as span:
                    try:
                        response = wrapped(*args, **kwargs)
                        return response
                    except Exception as error:
                        response = getattr(error, "response", {})
                        raise error
                    finally:
                        span.set_tag(
                            "requestHostname", instance._endpoint.host.split(
                                "://")[1]
                        )
                        span.set_tag(
                            "aws",
                            {
                                "region": instance.meta.region_name,
                                "service": instance._service_model.service_name,
                                "operation": args[0],
                                "requestId": response.get("ResponseMetadata", {}).get(
                                    "RequestId"
                                ),
                                "errorCode": response.get("Error", {}).get("Code"),
                            },
                        )

        try:
            wrapt.wrap_function_wrapper(
                "botocore.client", "BaseClient._make_api_call", wrapper
            )
        except ImportError:
            pass

    def instrument_urllib3(self):
        def wrapper(wrapped, instance, args, kwargs):
            if "method" in kwargs:
                method = kwargs["method"]
            else:
                method = args[0]
            if "url" in kwargs:
                path = kwargs["url"]
            else:
                path = args[1]
            user_agent = kwargs.get("headers", {}).get("User-Agent", "")
            # sometimes ua is binary string sometimes a normal string :/
            if hasattr(user_agent, "decode"):
                user_agent = user_agent.decode()
            status = None
            if (
                not self.disable_http_spans
                and (
                    # Ignore http calls from boto
                    not user_agent.startswith("Boto3")
                    or os.environ.get(
                        "SERVERLESS_ENTERPRISE_SPANS_CAPTURE_AWS_SDK_HTTP"
                    )
                )
                and (
                    capture_hosts.get("*", False)
                    or capture_hosts.get(instance.host.lower(), False)
                )
                and not ignore_hosts.get(instance.host.lower(), False)
            ):
                with self.span("http") as span:
                    span.set_tag("requestHostname", instance.host)
                    span.set_tag("requestPath", path)
                    span.set_tag("httpMethod", method)
                    try:
                        response = wrapped(*args, **kwargs)
                        return response
                    except Exception as e:
                        response = None
                        span.set_tag("httpStatus", "Exc")
                        raise e
                    finally:
                        if response:
                            span.set_tag("httpStatus", response.status)
            else:
                return wrapped(*args, **kwargs)

        try:
            wrapt.wrap_function_wrapper(
                "urllib3.connectionpool", "HTTPConnectionPool.urlopen", wrapper
            )
        except ImportError:
            pass
        try:
            wrapt.wrap_function_wrapper(
                "botocore.vendored.requests.packages.urllib3.connectionpool",
                "HTTPConnectionPool.urlopen",
                wrapper,
            )
        except ImportError:
            pass

    def instrument_stdlib_urllib(self, module):
        def wrapper(wrapped, instance, args, kwargs):
            http_class, req = args
            status = None
            if (
                capture_hosts.get("*", False)
                or capture_hosts.get(req.host.lower(), False)
            ) and not ignore_hosts.get(req.host.lower(), False):
                with self.span("http") as span:
                    try:
                        response = wrapped(*args, **kwargs)
                        return response
                    except Exception as error:
                        if getattr(error, "code", None) is not None:
                            response = error
                        else:
                            response = None
                            span.set_tag("httpStatus", "Exc")
                        raise error
                    finally:
                        if response:
                            status = response.code
                            span.set_tag("requestHostname", req.host.lower())
                            span.set_tag(
                                "requestPath", urlparse(
                                    req.get_full_url()).path
                            )
                            span.set_tag("httpMethod", req.get_method())
                            span.set_tag("httpStatus", status)
            else:
                return wrapped(*args, **kwargs)

        try:
            wrapt.wrap_function_wrapper(
                module, "AbstractHTTPHandler.do_open", wrapper)
        except ImportError:
            pass

    def instrument_flask(self, module):
        def wrap_init(wrapped, app, args, kwargs):
            wrapped(*args, **kwargs)
            app_dispatch_request = app.dispatch_request
            def dispatch_request(self):
                try:
                    from flask import _request_ctx_stack
                    req = _request_ctx_stack.top.request
                    set_endpoint(endpoint=req.url_rule.rule, meta={"mechanism": "flask-middleware"})
                except:
                    pass
                return app_dispatch_request()
            from types import MethodType
            app.dispatch_request = MethodType(dispatch_request, app)

            try:
                def after(response):
                    try:
                        from flask import request
                        try:
                            status = response.status_code.value # http.HTTPStatus?
                        except:
                            status = response.status_code or response.default_status
                        set_endpoint(
                            endpoint=None,
                            http_method=request.method,
                            http_status_code=status,
                            meta={"mechanism": "flask-middleware"}
                        )
                    except:
                        pass
                    return response
                app.after_request(after)
            except:
                pass

        try:
            wrapt.wrap_function_wrapper(module, "Flask.__init__", wrap_init)
        except ImportError:
            pass
