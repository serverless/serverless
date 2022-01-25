package com.serverless;

import java.util.HashMap;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketResponse;

public class RequestHandlerAPIGatewayV2WebSocketEvent
    implements RequestHandler<APIGatewayV2WebSocketEvent, APIGatewayV2WebSocketResponse> {
  public static APIGatewayV2WebSocketEvent input;

  public APIGatewayV2WebSocketResponse handleRequest(
      APIGatewayV2WebSocketEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    APIGatewayV2WebSocketResponse response = new APIGatewayV2WebSocketResponse();
    response.setStatusCode(200);
    HashMap<String, String> headers = new HashMap<String, String>();
    headers.put("Content-Type", "text/plain; charset=US-ASCII");
    response.setHeaders(headers);
    response.setBody("RequestHandlerAPIGatewayV2WebSocketEvent invoke Complete.");
    return response;
  }
}
