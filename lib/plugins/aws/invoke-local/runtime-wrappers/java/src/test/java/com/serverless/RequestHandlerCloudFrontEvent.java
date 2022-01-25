package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CloudFrontEvent;

public class RequestHandlerCloudFrontEvent implements RequestHandler<CloudFrontEvent, Object> {
  public static CloudFrontEvent input;

  @Override
  public Object handleRequest(CloudFrontEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerCloudFrontEvent invoke Complete.";
  }
}
