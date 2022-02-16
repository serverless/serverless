require 'json'
require 'securerandom'

class FakeLambdaContext
  attr_reader :function_name, :function_version, :aws_request_id, :log_stream_name, :memory_limit_in_mb,
    :invoked_function_arn, :log_group_name, :deadline_ms

  def initialize(function_name: 'Fake', version: 'LATEST', timeout: 6, **options)
    @function_name = function_name
    @function_version = version
    @memory_limit_in_mb = 1024
    @timeout = timeout

    # Allow overriding defaults
    options.each do |k,v|
      instance_variable_set("@#{k}", v)
    end

    @aws_request_id = SecureRandom.uuid
    @invoked_function_arn = "arn:aws:lambda:aws-region:acct-id:function:#{@function_name}"
    @log_group_name = "/aws/lambda/#{@function_name}"
    @log_stream_name = Time.now.strftime('%Y/%m/%d') +'/[$' + @function_version + ']58419525dade4d17a495dceeeed44708'

    @created_time = Time.now
    @deadline_ms = (@created_time + @timeout).to_i * 1000
  end

  def get_remaining_time_in_millis
    [@timeout * 1000 - ((Time.now - @created_time) * 1000).round, 0].max
  end

  def log(message)
    puts message
  end
end


def attach_tty
  unless Gem.win_platform? || $stdin.tty? || !File.exist?("/dev/tty")
    $stdin.reopen "/dev/tty", "a+"
  end
rescue
  puts "tty unavailable"
end

if __FILE__ == $0
  unless ARGV[0] && ARGV[1]
    puts "Usage: invoke.rb <handler_path> <handler_name>"
    exit 1
  end

  handler_path, handler_name = ARGV

  input = JSON.load($stdin) || {}

  require("./#{handler_path}")

  # handler name is either a global method or a static method in a class
  # my_method or MyModule::MyClass.my_method
  handler_method, handler_class = handler_name.split('.').reverse
  handler_class ||= "Kernel"

  attach_tty

  context = FakeLambdaContext.new(**input.fetch('context', {}).transform_keys(&:to_sym))
  result = Object.const_get(handler_class).send(handler_method, event: input['event'], context: context)

  puts result.to_json
end
