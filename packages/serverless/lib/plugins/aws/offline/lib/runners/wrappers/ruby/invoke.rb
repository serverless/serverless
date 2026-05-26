require 'json'

# Fake AWS Lambda context for Ruby handlers. Mirrors the AWS Lambda Ruby
# runtime's context interface — handlers read context.function_name,
# context.aws_request_id, context.get_remaining_time_in_millis, etc.
class FakeLambdaContext
  attr_reader :aws_request_id, :client_context, :function_name,
              :function_version, :identity, :invoked_function_arn,
              :log_group_name, :log_stream_name, :memory_limit_in_mb

  def initialize(context:)
    @aws_request_id = context['awsRequestId']
    @client_context = context['clientContext']
    @function_name = context['functionName']
    @function_version = context['functionVersion']
    @identity = context['identity']
    @invoked_function_arn = context['invokedFunctionArn']
    @log_group_name = context['logGroupName']
    @log_stream_name = context['logStreamName']
    @memory_limit_in_mb = context['memoryLimitInMB']
    @timeout = context['timeout']

    @created_time = Time.now
  end

  def get_remaining_time_in_millis
    [@timeout * 1000 - ((Time.now - @created_time) * 1000).round, 0].max
  end
end

if __FILE__ == $PROGRAM_NAME
  unless ARGV[0] && ARGV[1]
    warn 'Usage: invoke.rb <handler_path> <handler_name>'
    exit 1
  end

  handler_path = ARGV[0]
  handler_name = ARGV[1]

  # Load the handler module once. `require` is relative to the current
  # working directory; the Node-side runner spawns us with cwd set to the
  # handler's directory and passes the basename, mirroring the M5b Python
  # cwd+basename pattern.
  require("./#{handler_path}")

  # Handler name is either a global method or a Module::Class.method form.
  # Resolve once outside the loop.
  handler_method, handler_class = handler_name.split('.').reverse
  handler_class ||= 'Kernel'
  resolved_class = Object.const_get(handler_class)

  # NOTE: the community plugin calls `attach_tty` here to allow `binding.pry`
  # in user code. We deliberately omit it — our streaming child owns stdin
  # for the JSON-line protocol; reopening fd 0 to /dev/tty would either fail
  # or starve subsequent reads.

  # Streaming protocol: one JSON event per line in, one JSON envelope per
  # result line out. Mirrors the M5b Python wrapper's structure so the
  # long-lived child can serve multiple invocations on the same functionKey.
  loop do
    line = $stdin.gets
    break if line.nil? # parent closed stdin → exit gracefully

    input = JSON.parse(line)
    context = FakeLambdaContext.new(context: input['context'])
    result = resolved_class.send(handler_method,
                                 event: input['event'],
                                 context: context)

    data = {
      # Identifier to distinguish the result envelope from puts/log output.
      '__offline_payload__' => result
    }

    $stdout.puts(data.to_json)
    $stdout.flush
  end
end
