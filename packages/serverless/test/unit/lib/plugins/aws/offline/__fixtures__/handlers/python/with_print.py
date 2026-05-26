def handler(event, context):
    print("log line A")
    print("log line B")
    return {"got": event}
