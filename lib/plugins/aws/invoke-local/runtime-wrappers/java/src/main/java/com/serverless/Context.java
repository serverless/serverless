package com.serverless;

import com.amazonaws.services.lambda.runtime.Client;
import com.amazonaws.services.lambda.runtime.ClientContext;
import com.amazonaws.services.lambda.runtime.CognitoIdentity;
import com.amazonaws.services.lambda.runtime.LambdaLogger;

import java.util.Map;

public class Context implements com.amazonaws.services.lambda.runtime.Context {
  private String name;
  private String version;
  private String logGroupName;
  private long endTime;

  Context(String name, String version, String logGroupName, int timeout) {
    this.name = name;
    this.version = version;
    this.logGroupName = logGroupName;
    this.endTime = System.currentTimeMillis() + (timeout * 1000);
  }

  public String getAwsRequestId() {
    return "1234567890";
  }

  public String getLogGroupName() {
    return this.logGroupName;
  }

  public String getLogStreamName() {
    return "LogStream_" + this.name;
  }

  public String getFunctionName() {
    return this.name;
  }

  public String getFunctionVersion() {
    return this.version;
  }

  public String getInvokedFunctionArn() {
    return "arn:aws:lambda:serverless:" + this.name;
  }

  public CognitoIdentity getIdentity() {
    return new CognitoIdentity() {
      public String getIdentityId() {
        return "1";
      }

      public String getIdentityPoolId() {
        return "1";
      }
    };
  }

  public ClientContext getClientContext() {
    return new ClientContext() {
      public Client getClient() {
        return null;
      }

      public Map<String, String> getCustom() {
        return null;
      }

      public Map<String, String> getEnvironment() {
        return System.getenv();
      }
    };
  }

  public int getRemainingTimeInMillis() {
    return Math.max(0, (int) (this.endTime - System.currentTimeMillis()));
  }

  public int getMemoryLimitInMB() {
    return 1024;
  }

  public LambdaLogger getLogger() {
	  return new com.serverless.LambdaLogger();
  }
}
