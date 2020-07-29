package com.serverless.mapper;

import java.lang.reflect.InvocationTargetException;
import java.util.HashMap;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent;
import com.amazonaws.services.lambda.runtime.events.ApplicationLoadBalancerRequestEvent;
import com.amazonaws.services.lambda.runtime.events.CloudFrontEvent;
import com.amazonaws.services.lambda.runtime.events.CloudWatchLogsEvent;
import com.amazonaws.services.lambda.runtime.events.CodeCommitEvent;
import com.amazonaws.services.lambda.runtime.events.DynamodbEvent;
import com.amazonaws.services.lambda.runtime.events.KinesisEvent;
import com.amazonaws.services.lambda.runtime.events.LexEvent;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.lambda.runtime.events.SNSEvent;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.amazonaws.services.lambda.runtime.events.ScheduledEvent;

public class MapperFactory {
  private static final Map<Class<?>, Class<? extends Mapper>> mappers;

  static {
    HashMap<Class<?>, Class<? extends Mapper>> map =
        new HashMap<Class<?>, Class<? extends Mapper>>();
    map.put(APIGatewayProxyRequestEvent.class, DefaultEventMapper.class);
    map.put(APIGatewayV2HTTPEvent.class, DefaultEventMapper.class);
    // We don't support APIGatewayV2ProxyRequestEvent. It's deprecated.
    map.put(APIGatewayV2WebSocketEvent.class, DefaultEventMapper.class);
    map.put(ApplicationLoadBalancerRequestEvent.class, DefaultEventMapper.class);
    map.put(CloudFrontEvent.class, DefaultEventMapper.class);
    map.put(CloudWatchLogsEvent.class, DefaultEventMapper.class);
    map.put(CodeCommitEvent.class, DefaultEventMapper.class);
    map.put(DynamodbEvent.class, DefaultEventMapper.class);
    map.put(KinesisEvent.class, DefaultEventMapper.class);
    map.put(LexEvent.class, DefaultEventMapper.class);
    map.put(S3Event.class, S3EventMapper.class);
    map.put(SNSEvent.class, DefaultEventMapper.class);
    map.put(SQSEvent.class, DefaultEventMapper.class);
    map.put(ScheduledEvent.class, DefaultEventMapper.class);
    mappers = map;
  }

  public static Mapper getMapper(Class<?> targetClass)
      throws InstantiationException, IllegalAccessException, IllegalArgumentException,
          InvocationTargetException, NoSuchMethodException, SecurityException {
    Class<? extends Mapper> mapperClass = mappers.getOrDefault(targetClass, DefaultMapper.class);
    return mapperClass.getDeclaredConstructor(Class.class).newInstance(targetClass);
  }
}
