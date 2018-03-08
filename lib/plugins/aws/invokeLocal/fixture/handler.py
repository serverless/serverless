from time import sleep

def withRemainingTime(event, context):
    start = context.get_remaining_time_in_millis()
    sleep(0.001)
    stop = context.get_remaining_time_in_millis()

    return {
        "start": start,
        "stop": stop
    }