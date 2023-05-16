package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.DynamodbEvent;

public class RequestHandlerDynamodbEvent implements RequestHandler<DynamodbEvent, Object> {
  public static DynamodbEvent input;

  @Override
  public Object handleRequest(DynamodbEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerDynamodbEvent invoke Complete.";
  }
}
