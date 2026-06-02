require 'json'

# Returns a runtime-identifying payload plus a couple of the Lambda runtime
# env vars the runner injects, so the integration test can assert both that
# the host ruby child-process runner served the request and that IS_OFFLINE /
# AWS_LAMBDA_FUNCTION_NAME are present in the handler env.
def hello(event:, context:)
  {
    statusCode: 200,
    headers: { 'content-type' => 'application/json' },
    body: JSON.generate(
      runtime: 'ruby',
      rubyVersion: RUBY_VERSION,
      isOffline: ENV['IS_OFFLINE'],
      functionName: ENV['AWS_LAMBDA_FUNCTION_NAME'],
    ),
  }
end
