package com.serverless;

import com.google.gson.JsonObject;
import com.spotinst.functions.runtime.Context;
import com.spotinst.functions.runtime.Request;
import com.spotinst.functions.runtime.RequestHandler;
import com.spotinst.functions.runtime.Response;

import java.util.HashMap;
import java.util.Map;

/**
 * Please make sure your class implements the "RequestHandler" interface
 * The return value should be of type "Response"
 **/
public class Handler implements RequestHandler {

    @Override
    public Response handleRequest(Request request, Context context) {
        Map<String, String> queryParams = request.getQueryParams();

        String name         = queryParams.get("name");
        String responseBody = String.format("{\"hello\":\"%s\"}", name);

        Response response = new Response(200, responseBody);

        //Build response headers
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");

        response.setHeaders(headers);

        return response;
    }
}