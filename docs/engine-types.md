# Serverless Container Framework - Zod Types Documentation

## Table of Contents

- [General Types](#general-types)
  - [JSONValue](#jsonvalue)
- [Configuration Types](#configuration-types)
  - [ConfigDeploymentAwsApi](#configdeploymentawsapi)
  - [ConfigDeploymentSfaiAws](#configdeploymentsfaiaws)
  - [ConfigEssential](#configessential)
  - [ConfigSfaiAwsIntegrationEventbridgeSchema](#configsfaiawsintegrationeventbridgeschema)
  - [ConfigSfaiAwsIntegrationMcpSchema](#configsfaiawsintegrationmcpschema)
  - [ConfigSfaiAwsIntegrationScheduleSchema](#configsfaiawsintegrationscheduleschema)
  - [ConfigSfaiAwsIntegrationStreamSchema](#configsfaiawsintegrationstreamschema)
  - [ConfigSfaiAwsIntegrationsSchema](#configsfaiawsintegrationsschema)
- [State Types](#state-types)
  - [StateDeploymentTypeAwsApi](#statedeploymenttypeawsapi)
  - [StateDeploymentTypeSfaiAws](#statedeploymenttypesfaiaws)
- [Other Types](#other-types)
  - [ServerlessEngineDeploymentStateBase](#serverlessenginedeploymentstatebase)

# General Types

## JSONValue

A scaling object specifying a minimum scaling value.

# Configuration Types

## ConfigDeploymentAwsApi

ID of an existing VPC to use

### Properties

- **type**: 
- **id**: 

### Validation Rules

- **enum**: Values: awsApi@1.0 - Must be one of the allowed values

## ConfigDeploymentSfaiAws

Configuration for the SFAI AWS deployment architecture

### Properties

- **type**: 

### Validation Rules

- **enum**: Values: sfaiAws@1.0 - Must be one of the allowed values

## ConfigEssential

A scaling object specifying a minimum scaling value.

## ConfigSfaiAwsIntegrationEventbridgeSchema

Path to the handler function

### Properties

- **type**: 
- **handler**: 

## ConfigSfaiAwsIntegrationMcpSchema

Path to the handler function

### Properties

- **type**: 
- **handler**: 

## ConfigSfaiAwsIntegrationScheduleSchema

Path to the handler function

### Properties

- **type**: 
- **handler**: 

## ConfigSfaiAwsIntegrationStreamSchema

Path to the handler function

### Properties

- **type**: 
- **handler**: 

## ConfigSfaiAwsIntegrationsSchema

The name of the agent

### Validation Rules

- **enum**: Values: mastraAgent - Must be one of the allowed values

### References

- [JSONValue](#jsonvalue)
- [ConfigSfaiAwsIntegrationEventbridgeSchema](#configsfaiawsintegrationeventbridgeschema)
- [ConfigSfaiAwsIntegrationScheduleSchema](#configsfaiawsintegrationscheduleschema)
- [ConfigSfaiAwsIntegrationStreamSchema](#configsfaiawsintegrationstreamschema)
- [ConfigSfaiAwsIntegrationMcpSchema](#configsfaiawsintegrationmcpschema)

# State Types

## StateDeploymentTypeAwsApi

Path to the handler function

### Validation Rules

- **enum**: Values: awsApi@1.0 - Must be one of the allowed values

## StateDeploymentTypeSfaiAws

No description available

### Validation Rules

- **enum**: Values: sfaiAws@1.0 - Must be one of the allowed values

# Other Types

## ServerlessEngineDeploymentStateBase

Path to the handler function

