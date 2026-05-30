def handler(event:, context:)
  {
    aws_request_id: context.aws_request_id,
    memory_limit_in_mb: context.memory_limit_in_mb,
    invoked_function_arn: context.invoked_function_arn,
    function_name: context.function_name,
    log_group_name: context.log_group_name,
    log_stream_name: context.log_stream_name,
    remaining: context.get_remaining_time_in_millis
  }
end
