#Index

**Classes**

* [class: DynamoDBDatatype](#DynamoDBDatatype)
  * [dynamoDBDatatype.formatDataType(dataType)](#DynamoDBDatatype#formatDataType)
  * [dynamoDBDatatype.strToBin(value)](#DynamoDBDatatype#strToBin)
  * [dynamoDBDatatype.binToStr(value)](#DynamoDBDatatype#binToStr)
  * [dynamoDBDatatype.createSet(set, type)](#DynamoDBDatatype#createSet)
  * [dynamoDBDatatype.formatWireType(key, value)](#DynamoDBDatatype#formatWireType)
* [class: DynamoDB](#DynamoDB)
  * [new DynamoDB(dynamoDB)](#new_DynamoDB)
  * [dynamoDB.Set(set, type)](#DynamoDB#Set)
  * [dynamoDB.Condition(key, operator, val1, val2)](#DynamoDB#Condition)
  * [dynamoDB.StrToBin(value)](#DynamoDB#StrToBin)
  * [dynamoDB.BinToStr(value)](#DynamoDB#BinToStr)
* [class: DynamoDBFormatter](#DynamoDBFormatter)
  * [new DynamoDBFormatter()](#new_DynamoDBFormatter)
  * [dynamoDBFormatter.formatOutput()](#DynamoDBFormatter#formatOutput)
  * [dynamoDBFormatter.formatInput()](#DynamoDBFormatter#formatInput)

**Functions**

* [DynamoDBCondition(key, operator, val1, val2)](#DynamoDBCondition)
 
<a name="DynamoDBDatatype"></a>
#class: DynamoDBDatatype
Creates a DynamoDBDatatype that takes care of all datatype handling.

**Members**

* [class: DynamoDBDatatype](#DynamoDBDatatype)
  * [dynamoDBDatatype.formatDataType(dataType)](#DynamoDBDatatype#formatDataType)
  * [dynamoDBDatatype.strToBin(value)](#DynamoDBDatatype#strToBin)
  * [dynamoDBDatatype.binToStr(value)](#DynamoDBDatatype#binToStr)
  * [dynamoDBDatatype.createSet(set, type)](#DynamoDBDatatype#createSet)
  * [dynamoDBDatatype.formatWireType(key, value)](#DynamoDBDatatype#formatWireType)

<a name="DynamoDBDatatype#formatDataType"></a>
##dynamoDBDatatype.formatDataType(dataType)
Formats Javascript datatypes into DynamoDB wire format.

**Params**

- dataType  - Javascript datatype (i.e. string, number. For full information, check out the README).  

**Returns**: `object` - DynamoDB JSON-like wire format.  
<a name="DynamoDBDatatype#strToBin"></a>
##dynamoDBDatatype.strToBin(value)
Utility to convert a String to a Binary object.

**Params**

- value `string` - String value to converted to Binary object.  

**Returns**: `object` - (Buffer | Uint8Array) depending on Node or browser.  
<a name="DynamoDBDatatype#binToStr"></a>
##dynamoDBDatatype.binToStr(value)
Utility to convert a Binary object into a decoded String.

**Params**

- value `object` - Binary value (Buffer | Uint8Array) depending on Node or browser.  

**Returns**: `string` - decoded String in UTF-8  
<a name="DynamoDBDatatype#createSet"></a>
##dynamoDBDatatype.createSet(set, type)
Utility to create the DynamoDB Set Datatype.

**Params**

- set `array` - An array that contains elements of the same typed as defined by {type}.  
- type `string` - Can only be a [S]tring, [N]umber, or [B]inary type.  

**Returns**: `Set` - Custom Set object that follow {type}.  
<a name="DynamoDBDatatype#formatWireType"></a>
##dynamoDBDatatype.formatWireType(key, value)
Formats DynamoDB wire format into javascript datatypes.

**Params**

- key `string` - Key that represents the type of the attribute value  
- value  - Javascript datatype of the attribute value produced by DynamoDB  

<a name="DynamoDB"></a>
#class: DynamoDB
DynamoDB

**Members**

* [class: DynamoDB](#DynamoDB)
  * [new DynamoDB(dynamoDB)](#new_DynamoDB)
  * [dynamoDB.Set(set, type)](#DynamoDB#Set)
  * [dynamoDB.Condition(key, operator, val1, val2)](#DynamoDB#Condition)
  * [dynamoDB.StrToBin(value)](#DynamoDB#StrToBin)
  * [dynamoDB.BinToStr(value)](#DynamoDB#BinToStr)

<a name="new_DynamoDB"></a>
##new DynamoDB(dynamoDB)
Create an instance of the DynamoDB Document client.

**Params**

- dynamoDB `AWS.DynamoDB` - An instance of the service provided AWS SDK (optional).  

**Returns**: [DynamoDB](#DynamoDB) - Modified version of the service for Document support.  
<a name="DynamoDB#Set"></a>
##dynamoDB.Set(set, type)
Utility to create Set Object for requests.

**Params**

- set `array` - An array that contains elements of the same typed as defined by {type}.  
- type `string` - Can only be a [S]tring, [N]umber, or [B]inary type.  

**Returns**: `Set` - Custom Set object that follow {type}.  
<a name="DynamoDB#Condition"></a>
##dynamoDB.Condition(key, operator, val1, val2)
Creates an instance of Condition and should be used with the DynamoDB client.

**Params**

- key `string` - The attribute name being conditioned.  
- operator `string` - The operator in the conditional clause. (See lower level docs for full list of operators)  
- val1  - Potential first element in what would be the AttributeValueList  
- val2  - Potential second element in what would be the AttributeValueList  

**Returns**: `Condition` - Condition for your DynamoDB request.  
<a name="DynamoDB#StrToBin"></a>
##dynamoDB.StrToBin(value)
Utility to convert a String to the necessary Binary object.

**Params**

- value `string` - String value to converted to Binary object.  

**Returns**: `object` - Return value will be a Buffer or Uint8Array in the browser.  
<a name="DynamoDB#BinToStr"></a>
##dynamoDB.BinToStr(value)
Utility to convert a Binary object into its String equivalent.

**Params**

- value `object` - Binary value (Buffer | Uint8Array) depending on environment.  

**Returns**: `string` - Return value will be the string representation of the Binary object.  
<a name="DynamoDBFormatter"></a>
#class: DynamoDBFormatter
**Members**

* [class: DynamoDBFormatter](#DynamoDBFormatter)
  * [new DynamoDBFormatter()](#new_DynamoDBFormatter)
  * [dynamoDBFormatter.formatOutput()](#DynamoDBFormatter#formatOutput)
  * [dynamoDBFormatter.formatInput()](#DynamoDBFormatter#formatInput)

<a name="new_DynamoDBFormatter"></a>
##new DynamoDBFormatter()
Create an instance of the DynamoDBFormatter.

**Returns**: [DynamoDBFormatter](#DynamoDBFormatter) - A Formatter object that provides methods for formatting DynamoDB requests and responses.  
<a name="DynamoDBFormatter#formatOutput"></a>
##dynamoDBFormatter.formatOutput()
DynamoDBFormatter specifically for wrapping DynamoDB response objects.

**Returns**: `object` - Wrapped up response object.  
<a name="DynamoDBFormatter#formatInput"></a>
##dynamoDBFormatter.formatInput()
DynamoDBFormatter specifically for unwrapping DynamoDB request objects.

**Returns**: `object` - Returns aws sdk version of the request.  
<a name="DynamoDBCondition"></a>
#DynamoDBCondition(key, operator, val1, val2)
Creates an instance of Condition that is used by the DynamoDB Document client.

**Params**

- key `string` - The attribute name being conditioned on.  
- operator `string` - The operator in the conditional clause. (See aws sdk docs for full list of operators)  
- val1  - Potential first element in what would be the AttributeValueList  
- val2  - Potential second element in what would be the AttributeValueList  

**Returns**: `Condition` - Condition for your DynamoDB request.  
