package <%= package %>;

import com.amazonaws.services.lambda.runtime.ClientContext;
import com.amazonaws.services.lambda.runtime.CognitoIdentity;
import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;

public class FakeContext implements Context {

	String pkgName;
	String clsName;

	public FakeContext(Class<?> cls) {
		this.pkgName = cls.getPackage().getName();
		this.clsName = cls.getName();
	}

	@Override
	public int getRemainingTimeInMillis() {
		return 1000;
	}

	@Override
	public int getMemoryLimitInMB() {
		return 1024;
	}

	@Override
	public LambdaLogger getLogger() {
		return null;
	}

	@Override
	public String getLogStreamName() {
		return clsName;
	}

	@Override
	public String getLogGroupName() {
		return "log_" + pkgName;
	}

	@Override
	public String getInvokedFunctionArn() {
		return "arn:aws:lambda:serverless:" + clsName;
	}

	@Override
	public CognitoIdentity getIdentity() {
		return null;
	}

	@Override
	public String getFunctionVersion() {
		return "Latest";
	}

	@Override
	public String getFunctionName() {
		return "Fake" + clsName;
	}

	@Override
	public ClientContext getClientContext() {
		return null;
	}

	@Override
	public String getAwsRequestId() {
		return "1234";
	}
}
