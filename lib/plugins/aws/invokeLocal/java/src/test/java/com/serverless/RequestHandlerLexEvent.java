package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.LexEvent;

public class RequestHandlerLexEvent implements RequestHandler<LexEvent, Object> {
  public static LexEvent input;

  @Override
  public Object handleRequest(LexEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerLexEvent invoke Complete.";
  }
}
