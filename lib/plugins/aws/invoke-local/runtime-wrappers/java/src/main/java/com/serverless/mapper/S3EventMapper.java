package com.serverless.mapper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification.RequestParametersEntity;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification.ResponseElementsEntity;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification.S3BucketEntity;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification.S3Entity;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification.S3EventNotificationRecord;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification.S3ObjectEntity;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification.UserIdentityEntity;

public class S3EventMapper extends AbstractMapper {

  public S3EventMapper(Class<?> targetClass) {
    super(targetClass);
  }

  @Override
  public Object read(HashMap<String, Object> event) throws Exception {
    List<S3EventNotificationRecord> s3records = new ArrayList<S3EventNotificationRecord>();
    ArrayList<HashMap<String, ?>> records = ArrayList.class.cast(event.get("Records"));
    records.forEach(
        r -> {
          HashMapWrapper record = new HashMapWrapper(r);
          String awsRegion = record.getAsString("awsRegion");
          String eventName = record.getAsString("eventName");
          String eventSource = record.getAsString("eventSource");
          String eventTime = record.getAsString("eventTime");
          String eventVersion = record.getAsString("eventVersion");
          RequestParametersEntity requestParameters =
              createRequestParametersEntity(record.getAsHashMapWrapper("requestParameters"));
          ResponseElementsEntity responseElements =
              createResponseElementsEntity(record.getAsHashMapWrapper("responseElements"));
          S3Entity s3 = createS3Entity(record.getAsHashMapWrapper("s3"));
          UserIdentityEntity userIdentity =
              createUserIdentityEntity(record.getAsHashMapWrapper("userIdentity"));
          S3EventNotificationRecord s3record =
              new S3EventNotificationRecord(
                  awsRegion,
                  eventName,
                  eventSource,
                  eventTime,
                  eventVersion,
                  requestParameters,
                  responseElements,
                  s3,
                  userIdentity);
          s3records.add(s3record);
        });
    return new S3Event(s3records);
  }

  private RequestParametersEntity createRequestParametersEntity(HashMapWrapper requestParameters) {
    String sourceIPAddress = requestParameters.getAsString("sourceIPAddress");
    return new RequestParametersEntity(sourceIPAddress);
  }

  private ResponseElementsEntity createResponseElementsEntity(HashMapWrapper responseElements) {
    String xAmzId2 = responseElements.getAsString("x-amz-id-2");
    String xAmzRequestId = responseElements.getAsString("x-amz-id-2");
    return new ResponseElementsEntity(xAmzId2, xAmzRequestId);
  }

  private S3Entity createS3Entity(HashMapWrapper s3) {
    String configurationId = s3.getAsString("configurationId");
    String s3SchemaVersion = s3.getAsString("s3SchemaVersion");
    S3BucketEntity bucket = creatS3BucketEntity(s3.getAsHashMapWrapper("bucket"));
    S3ObjectEntity object = createS3ObjectEntity(s3.getAsHashMapWrapper("object"));
    return new S3Entity(configurationId, bucket, object, s3SchemaVersion);
  }

  private S3BucketEntity creatS3BucketEntity(HashMapWrapper bucket) {
    String name = bucket.getAsString("name");
    String arn = bucket.getAsString("arn");
    UserIdentityEntity ownerIdentity =
        createUserIdentityEntity(bucket.getAsHashMapWrapper("ownerIdentity"));
    return new S3BucketEntity(name, ownerIdentity, arn);
  }

  private UserIdentityEntity createUserIdentityEntity(HashMapWrapper userIdentity) {
    return new UserIdentityEntity(userIdentity.getAsString("principalId"));
  }

  private S3ObjectEntity createS3ObjectEntity(HashMapWrapper object) {
    String key = object.getAsString("key");
    Long size = object.getAsLong("size");
    String eTag = object.getAsString("eTag");
    String versionId = object.getAsString("versionId");
    String sequencer = object.getAsString("sequencer");
    return new S3ObjectEntity(key, size, eTag, versionId, sequencer);
  }
}
