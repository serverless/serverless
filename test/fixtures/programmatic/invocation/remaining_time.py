from time import sleep


def handler(event, context):
    start = context.get_remaining_time_in_millis()
    sleep(0.1)
    stop = context.get_remaining_time_in_millis()

    return {
        "start": start,
        "stop": stop
    }
