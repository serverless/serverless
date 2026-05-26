def handler(event, context):
    return {"ok": True, "echo": event, "fn": context.function_name}
