package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.ScheduledEvent;

public class RequestHandlerScheduledEvent implements RequestHandler<ScheduledEvent, Object> {
  public static ScheduledEvent input;

  @Override
  public Object handleRequest(ScheduledEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerScheduledEvent invoke Complete.";
  }
}
