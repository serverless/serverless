// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
)

// DynamoDBAttributeValue provides convenient access for a value stored in DynamoDB.
// For more information,  please see http://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_AttributeValue.html
type DynamoDBAttributeValue struct {
	value    anyValue
	dataType DynamoDBDataType
}

// This struct represents DynamoDBAttributeValue which doesn't
// implement fmt.Stringer interface and safely `fmt.Sprintf`able
type dynamoDbAttributeValue DynamoDBAttributeValue //nolint: stylecheck

// Binary provides access to an attribute of type Binary.
// Method panics if the attribute is not of type Binary.
func (av DynamoDBAttributeValue) Binary() []byte {
	av.ensureType(DataTypeBinary)
	return av.value.([]byte)
}

// Boolean provides access to an attribute of type Boolean.
// Method panics if the attribute is not of type Boolean.
func (av DynamoDBAttributeValue) Boolean() bool {
	av.ensureType(DataTypeBoolean)
	return av.value.(bool)
}

// BinarySet provides access to an attribute of type Binary Set.
// Method panics if the attribute is not of type BinarySet.
func (av DynamoDBAttributeValue) BinarySet() [][]byte {
	av.ensureType(DataTypeBinarySet)
	return av.value.([][]byte)
}

// List provides access to an attribute of type List. Each element
// of the list is an DynamoDBAttributeValue itself.
// Method panics if the attribute is not of type List.
func (av DynamoDBAttributeValue) List() []DynamoDBAttributeValue {
	av.ensureType(DataTypeList)
	return av.value.([]DynamoDBAttributeValue)
}

// Map provides access to an attribute of type Map. They Keys are strings
// and the values are DynamoDBAttributeValue instances.
// Method panics if the attribute is not of type Map.
func (av DynamoDBAttributeValue) Map() map[string]DynamoDBAttributeValue {
	av.ensureType(DataTypeMap)
	return av.value.(map[string]DynamoDBAttributeValue)
}

// Number provides access to an attribute of type Number.
// DynamoDB sends the values as strings. For convenience please see also
// the methods Integer() and Float().
// Method panics if the attribute is not of type Number.
func (av DynamoDBAttributeValue) Number() string {
	av.ensureType(DataTypeNumber)
	return av.value.(string)
}

// Int64 provides access to an attribute of type Number.
// DynamoDB sends the values as strings. For convenience this method
// provides conversion to int.
// Method panics if the attribute is not of type Number.
func (av DynamoDBAttributeValue) Int64() (int64, error) {
	number := av.Number()
	return strconv.ParseInt(number, 10, 64)
}

// Integer provides access to an attribute of type Number.
// DynamoDB sends the values as strings. For convenience this method
// provides conversion to int. If the value cannot be represented by
// a signed integer, err.Err = ErrRange and the returned value is the maximum magnitude integer
// of an int64 of the appropriate sign.
// Method panics if the attribute is not of type Number.
func (av DynamoDBAttributeValue) Integer() (int64, error) {
	number := av.Number()
	value, err := av.Int64()
	if err == nil {
		return value, nil
	}
	s, err := strconv.ParseFloat(number, 64)
	return int64(s), err
}

// Float provides access to an attribute of type Number.
// DynamoDB sends the values as strings. For convenience this method
// provides conversion to float64.
// The returned value is the nearest floating point number rounded using IEEE754 unbiased rounding.
// If the number is more than 1/2 ULP away from the largest floating point number of the given size,
// the value returned is ±Inf, err.Err = ErrRange.
// Method panics if the attribute is not of type Number.
func (av DynamoDBAttributeValue) Float() (float64, error) {
	s, err := strconv.ParseFloat(av.Number(), 64)
	return s, err
}

// NumberSet provides access to an attribute of type Number Set.
// DynamoDB sends the numbers as strings.
// Method panics if the attribute is not of type Number.
func (av DynamoDBAttributeValue) NumberSet() []string {
	av.ensureType(DataTypeNumberSet)
	return av.value.([]string)
}

// String provides access to an attribute of type String.
// Method panics if the attribute is not of type String.
func (av DynamoDBAttributeValue) String() string {
	if av.dataType == DataTypeString {
		return av.value.(string)
	}
	// If dataType is not DataTypeString during fmt.Sprintf("%#v", ...)
	// compiler confuses with fmt.Stringer interface and panics
	// instead of printing the struct.
	return fmt.Sprintf("%v", dynamoDbAttributeValue(av))
}

// StringSet provides access to an attribute of type String Set.
// Method panics if the attribute is not of type String Set.
func (av DynamoDBAttributeValue) StringSet() []string {
	av.ensureType(DataTypeStringSet)
	return av.value.([]string)
}

// IsNull returns true if the attribute is of type Null.
func (av DynamoDBAttributeValue) IsNull() bool {
	return av.value == nil
}

// DataType provides access to the DynamoDB type of the attribute
func (av DynamoDBAttributeValue) DataType() DynamoDBDataType {
	return av.dataType
}

// NewBinaryAttribute creates an DynamoDBAttributeValue containing a Binary
func NewBinaryAttribute(value []byte) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeBinary
	return av
}

// NewBooleanAttribute creates an DynamoDBAttributeValue containing a Boolean
func NewBooleanAttribute(value bool) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeBoolean
	return av
}

// NewBinarySetAttribute creates an DynamoDBAttributeValue containing a BinarySet
func NewBinarySetAttribute(value [][]byte) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeBinarySet
	return av
}

// NewListAttribute creates an DynamoDBAttributeValue containing a List
func NewListAttribute(value []DynamoDBAttributeValue) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeList
	return av
}

// NewMapAttribute creates an DynamoDBAttributeValue containing a Map
func NewMapAttribute(value map[string]DynamoDBAttributeValue) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeMap
	return av
}

// NewNumberAttribute creates an DynamoDBAttributeValue containing a Number
func NewNumberAttribute(value string) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeNumber
	return av
}

// NewNumberSetAttribute creates an DynamoDBAttributeValue containing a NumberSet
func NewNumberSetAttribute(value []string) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeNumberSet
	return av
}

// NewNullAttribute creates an DynamoDBAttributeValue containing a Null
func NewNullAttribute() DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.dataType = DataTypeNull
	return av
}

// NewStringAttribute creates an DynamoDBAttributeValue containing a String
func NewStringAttribute(value string) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeString
	return av
}

// NewStringSetAttribute creates an DynamoDBAttributeValue containing a StringSet
func NewStringSetAttribute(value []string) DynamoDBAttributeValue {
	var av DynamoDBAttributeValue
	av.value = value
	av.dataType = DataTypeStringSet
	return av
}

// DynamoDBDataType specifies the type supported natively by DynamoDB for an attribute
type DynamoDBDataType int

const (
	DataTypeBinary DynamoDBDataType = iota
	DataTypeBoolean
	DataTypeBinarySet
	DataTypeList
	DataTypeMap
	DataTypeNumber
	DataTypeNumberSet
	DataTypeNull
	DataTypeString
	DataTypeStringSet
)

type anyValue interface{}

// UnsupportedDynamoDBTypeError is the error returned when trying to unmarshal a DynamoDB Attribute type not recognized by this library
type UnsupportedDynamoDBTypeError struct {
	Type string
}

func (e UnsupportedDynamoDBTypeError) Error() string {
	return fmt.Sprintf("unsupported DynamoDB attribute type, %v", e.Type)
}

// IncompatibleDynamoDBTypeError is the error passed in a panic when calling an accessor for an incompatible type
type IncompatibleDynamoDBTypeError struct {
	Requested DynamoDBDataType
	Actual    DynamoDBDataType
}

func (e IncompatibleDynamoDBTypeError) Error() string {
	return fmt.Sprintf("accessor called for incompatible type, requested type %v but actual type was %v", e.Requested, e.Actual)
}

func (av *DynamoDBAttributeValue) ensureType(expectedType DynamoDBDataType) {
	if av.dataType != expectedType {
		panic(IncompatibleDynamoDBTypeError{Requested: expectedType, Actual: av.dataType})
	}
}

// MarshalJSON implements custom marshaling to be used by the standard json/encoding package
func (av DynamoDBAttributeValue) MarshalJSON() ([]byte, error) {

	var buff bytes.Buffer
	var err error
	var b []byte

	switch av.dataType {
	case DataTypeBinary:
		buff.WriteString(`{ "B":`)
		b, err = json.Marshal(av.value.([]byte))
		buff.Write(b)

	case DataTypeBoolean:
		buff.WriteString(`{ "BOOL":`)
		b, err = json.Marshal(av.value.(bool))
		buff.Write(b)

	case DataTypeBinarySet:
		buff.WriteString(`{ "BS":`)
		b, err = json.Marshal(av.value.([][]byte))
		buff.Write(b)

	case DataTypeList:
		buff.WriteString(`{ "L":`)
		b, err = json.Marshal(av.value.([]DynamoDBAttributeValue))
		buff.Write(b)

	case DataTypeMap:
		buff.WriteString(`{ "M":`)
		b, err = json.Marshal(av.value.(map[string]DynamoDBAttributeValue))
		buff.Write(b)

	case DataTypeNumber:
		buff.WriteString(`{ "N":`)
		b, err = json.Marshal(av.value.(string))
		buff.Write(b)

	case DataTypeNumberSet:
		buff.WriteString(`{ "NS":`)
		b, err = json.Marshal(av.value.([]string))
		buff.Write(b)

	case DataTypeNull:
		buff.WriteString(`{ "NULL": true `)

	case DataTypeString:
		buff.WriteString(`{ "S":`)
		b, err = json.Marshal(av.value.(string))
		buff.Write(b)

	case DataTypeStringSet:
		buff.WriteString(`{ "SS":`)
		b, err = json.Marshal(av.value.([]string))
		buff.Write(b)
	}

	buff.WriteString(`}`)
	return buff.Bytes(), err
}

func unmarshalNull(target *DynamoDBAttributeValue) error {
	target.value = nil
	target.dataType = DataTypeNull
	return nil
}

func unmarshalString(target *DynamoDBAttributeValue, value interface{}) error {
	var ok bool
	target.value, ok = value.(string)
	target.dataType = DataTypeString
	if !ok {
		return errors.New("DynamoDBAttributeValue: S type should contain a string")
	}
	return nil
}

func unmarshalBinary(target *DynamoDBAttributeValue, value interface{}) error {
	stringValue, ok := value.(string)
	if !ok {
		return errors.New("DynamoDBAttributeValue: B type should contain a base64 string")
	}

	binaryValue, err := base64.StdEncoding.DecodeString(stringValue)
	if err != nil {
		return err
	}

	target.value = binaryValue
	target.dataType = DataTypeBinary
	return nil
}

func unmarshalBoolean(target *DynamoDBAttributeValue, value interface{}) error {
	booleanValue, ok := value.(bool)
	if !ok {
		return errors.New("DynamoDBAttributeValue: BOOL type should contain a boolean")
	}

	target.value = booleanValue
	target.dataType = DataTypeBoolean
	return nil
}

func unmarshalBinarySet(target *DynamoDBAttributeValue, value interface{}) error {
	list, ok := value.([]interface{})
	if !ok {
		return errors.New("DynamoDBAttributeValue: BS type should contain a list of base64 strings")
	}

	binarySet := make([][]byte, len(list))

	for index, element := range list {
		var err error
		elementString := element.(string)
		binarySet[index], err = base64.StdEncoding.DecodeString(elementString)
		if err != nil {
			return err
		}
	}

	target.value = binarySet
	target.dataType = DataTypeBinarySet
	return nil
}

func unmarshalList(target *DynamoDBAttributeValue, value interface{}) error {
	list, ok := value.([]interface{})
	if !ok {
		return errors.New("DynamoDBAttributeValue: L type should contain a list")
	}

	DynamoDBAttributeValues := make([]DynamoDBAttributeValue, len(list))
	for index, element := range list {

		elementMap, ok := element.(map[string]interface{})
		if !ok {
			return errors.New("DynamoDBAttributeValue: element of a list is not an DynamoDBAttributeValue")
		}

		var elementDynamoDBAttributeValue DynamoDBAttributeValue
		err := unmarshalDynamoDBAttributeValueMap(&elementDynamoDBAttributeValue, elementMap)
		if err != nil {
			return errors.New("DynamoDBAttributeValue: unmarshal of child DynamoDBAttributeValue failed")
		}
		DynamoDBAttributeValues[index] = elementDynamoDBAttributeValue
	}
	target.value = DynamoDBAttributeValues
	target.dataType = DataTypeList
	return nil
}

func unmarshalMap(target *DynamoDBAttributeValue, value interface{}) error {
	m, ok := value.(map[string]interface{})
	if !ok {
		return errors.New("DynamoDBAttributeValue: M type should contain a map")
	}

	DynamoDBAttributeValues := make(map[string]DynamoDBAttributeValue)
	for k, v := range m {

		elementMap, ok := v.(map[string]interface{})
		if !ok {
			return errors.New("DynamoDBAttributeValue: element of a map is not an DynamoDBAttributeValue")
		}

		var elementDynamoDBAttributeValue DynamoDBAttributeValue
		err := unmarshalDynamoDBAttributeValueMap(&elementDynamoDBAttributeValue, elementMap)
		if err != nil {
			return errors.New("DynamoDBAttributeValue: unmarshal of child DynamoDBAttributeValue failed")
		}
		DynamoDBAttributeValues[k] = elementDynamoDBAttributeValue
	}
	target.value = DynamoDBAttributeValues
	target.dataType = DataTypeMap
	return nil
}

func unmarshalNumber(target *DynamoDBAttributeValue, value interface{}) error {
	var ok bool
	target.value, ok = value.(string)
	target.dataType = DataTypeNumber
	if !ok {
		return errors.New("DynamoDBAttributeValue: N type should contain a string")
	}
	return nil
}

func unmarshalNumberSet(target *DynamoDBAttributeValue, value interface{}) error {
	list, ok := value.([]interface{})
	if !ok {
		return errors.New("DynamoDBAttributeValue: NS type should contain a list of strings")
	}

	numberSet := make([]string, len(list))

	for index, element := range list {
		numberSet[index], ok = element.(string)
		if !ok {
			return errors.New("DynamoDBAttributeValue: NS type should contain a list of strings")
		}
	}

	target.value = numberSet
	target.dataType = DataTypeNumberSet
	return nil
}

func unmarshalStringSet(target *DynamoDBAttributeValue, value interface{}) error {
	list, ok := value.([]interface{})
	if !ok {
		return errors.New("DynamoDBAttributeValue: SS type should contain a list of strings")
	}

	stringSet := make([]string, len(list))

	for index, element := range list {
		stringSet[index], ok = element.(string)
		if !ok {
			return errors.New("DynamoDBAttributeValue: SS type should contain a list of strings")
		}
	}

	target.value = stringSet
	target.dataType = DataTypeStringSet
	return nil
}

func unmarshalDynamoDBAttributeValue(target *DynamoDBAttributeValue, typeLabel string, jsonValue interface{}) error {

	switch typeLabel {
	case "NULL":
		return unmarshalNull(target)
	case "B":
		return unmarshalBinary(target, jsonValue)
	case "BOOL":
		return unmarshalBoolean(target, jsonValue)
	case "BS":
		return unmarshalBinarySet(target, jsonValue)
	case "L":
		return unmarshalList(target, jsonValue)
	case "M":
		return unmarshalMap(target, jsonValue)
	case "N":
		return unmarshalNumber(target, jsonValue)
	case "NS":
		return unmarshalNumberSet(target, jsonValue)
	case "S":
		return unmarshalString(target, jsonValue)
	case "SS":
		return unmarshalStringSet(target, jsonValue)
	default:
		target.value = nil
		target.dataType = DataTypeNull
		return UnsupportedDynamoDBTypeError{typeLabel}
	}
}

// UnmarshalJSON unmarshals a JSON description of this DynamoDBAttributeValue
func (av *DynamoDBAttributeValue) UnmarshalJSON(b []byte) error {
	var m map[string]interface{}

	err := json.Unmarshal(b, &m)
	if err != nil {
		return err
	}

	return unmarshalDynamoDBAttributeValueMap(av, m)
}

func unmarshalDynamoDBAttributeValueMap(target *DynamoDBAttributeValue, m map[string]interface{}) error {
	if m == nil {
		return errors.New("DynamoDBAttributeValue: does not contain a map")
	}

	if len(m) != 1 {
		return errors.New("DynamoDBAttributeValue: map must contain a single type")
	}

	for k, v := range m {
		return unmarshalDynamoDBAttributeValue(target, k, v)
	}

	return nil
}
