def withRemainingTime(event:, context:)
  start = context.get_remaining_time_in_millis()
  sleep(0.001)
  stop = context.get_remaining_time_in_millis()

  {"start" => start, "stop" => stop}
end
