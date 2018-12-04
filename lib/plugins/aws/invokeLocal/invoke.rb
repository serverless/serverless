require 'json'

class FakeLambdaContext
  attr_reader :function_name, :function_version

  def initialize(name: 'Fake', version: 'LATEST', timeout: 6, **options)
    @function_name = name
    @function_version = version
    @created_time = Time.now()
    @timeout = timeout
    options.each {|k,v|
      send(k, v)
    }
  end

  def get_remaining_time_in_millis
    [@timeout*1000 - ((Time.now() - @created_time)*1000).round, 0].max
  end

  def invoked_function_arn
    "arn:aws:lambda:serverless:#{function_name}"
  end

  def memory_limit_in_mb
    return '1024'
  end

  def aws_request_id
    return '1234567890'
  end

  def log_group_name
    return "/aws/lambda/#{function_name}"
  end

  def log_stream_name
    return Time.now.strftime('%Y/%m/%d') +'/[$' + function_version + ']58419525dade4d17a495dceeeed44708'
  end

  def log(message)
    puts message
  end
end

if __FILE__ == $0
  unless ARGV[0] && ARGV[1]
    puts "Usage: invoke.rb <handler_path> <handler_name>"
    exit 1
  end

  handler_path = "#{ARGV[0]}.rb"
  handler_name = ARGV[1]

  # handler name is either a global method or a static method in a class
  # my_method or MyModule::MyClass.my_method
  input = JSON.load($stdin) || {}
  $LOAD_PATH << "."
  $LOAD_PATH << "lib"
  load(handler_path)
  handler = method(handler_name)

  context = FakeLambdaContext.new(**input.fetch('context', {}))
  result = handler.call(event: input['event'], context: context)

  puts result.to_json
end
