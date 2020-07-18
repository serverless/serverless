package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SNSEvent;

public class RequestHandlerSNSEvent implements RequestHandler<SNSEvent, Object> {
  public static SNSEvent input;

  @Override
  public Object handleRequest(SNSEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerSNSEvent invoke Complete.";
  }
}
