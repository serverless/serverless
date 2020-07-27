package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;

public class RequestHandlerSQSEvent implements RequestHandler<SQSEvent, Object> {
  public static SQSEvent input;

  @Override
  public Object handleRequest(SQSEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerSQSEvent invoke Complete.";
  }
}
