// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

// CognitoEvent contains data from an event sent from AWS Cognito Sync
type CognitoEvent struct {
	DatasetName    string                          `json:"datasetName"`
	DatasetRecords map[string]CognitoDatasetRecord `json:"datasetRecords"`
	EventType      string                          `json:"eventType"`
	IdentityID     string                          `json:"identityId"`
	IdentityPoolID string                          `json:"identityPoolId"`
	Region         string                          `json:"region"`
	Version        int                             `json:"version"`
}

// CognitoDatasetRecord represents a record from an AWS Cognito Sync event
type CognitoDatasetRecord struct {
	NewValue string `json:"newValue"`
	OldValue string `json:"oldValue"`
	Op       string `json:"op"`
}

// CognitoEventUserPoolsPreSignup is sent by AWS Cognito User Pools when a user attempts to register
// (sign up), allowing a Lambda to perform custom validation to accept or deny the registration request
type CognitoEventUserPoolsPreSignup struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsPreSignupRequest  `json:"request"`
	Response CognitoEventUserPoolsPreSignupResponse `json:"response"`
}

// CognitoEventUserPoolsPreAuthentication is sent by AWS Cognito User Pools when a user submits their information
// to be authenticated, allowing you to perform custom validations to accept or deny the sign in request.
type CognitoEventUserPoolsPreAuthentication struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsPreAuthenticationRequest  `json:"request"`
	Response CognitoEventUserPoolsPreAuthenticationResponse `json:"response"`
}

// CognitoEventUserPoolsPostConfirmation is sent by AWS Cognito User Pools after a user is confirmed,
// allowing the Lambda to send custom messages or add custom logic.
type CognitoEventUserPoolsPostConfirmation struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsPostConfirmationRequest  `json:"request"`
	Response CognitoEventUserPoolsPostConfirmationResponse `json:"response"`
}

// CognitoEventUserPoolsPreTokenGen is sent by AWS Cognito User Pools when a user attempts to retrieve
// credentials, allowing a Lambda to perform insert, suppress or override claims
type CognitoEventUserPoolsPreTokenGen struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsPreTokenGenRequest  `json:"request"`
	Response CognitoEventUserPoolsPreTokenGenResponse `json:"response"`
}

// CognitoEventUserPoolsPostAuthentication is sent by AWS Cognito User Pools after a user is authenticated,
// allowing the Lambda to add custom logic.
type CognitoEventUserPoolsPostAuthentication struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsPostAuthenticationRequest  `json:"request"`
	Response CognitoEventUserPoolsPostAuthenticationResponse `json:"response"`
}

// CognitoEventUserPoolsMigrateUser is sent by AWS Cognito User Pools when a user does not exist in the
// user pool at the time of sign-in with a password, or in the forgot-password flow.
type CognitoEventUserPoolsMigrateUser struct {
	CognitoEventUserPoolsHeader
	CognitoEventUserPoolsMigrateUserRequest  `json:"request"`
	CognitoEventUserPoolsMigrateUserResponse `json:"response"`
}

// CognitoEventUserPoolsCallerContext contains information about the caller
type CognitoEventUserPoolsCallerContext struct {
	AWSSDKVersion string `json:"awsSdkVersion"`
	ClientID      string `json:"clientId"`
}

// CognitoEventUserPoolsHeader contains common data from events sent by AWS Cognito User Pools
type CognitoEventUserPoolsHeader struct {
	Version       string                             `json:"version"`
	TriggerSource string                             `json:"triggerSource"`
	Region        string                             `json:"region"`
	UserPoolID    string                             `json:"userPoolId"`
	CallerContext CognitoEventUserPoolsCallerContext `json:"callerContext"`
	UserName      string                             `json:"userName"`
}

// CognitoEventUserPoolsPreSignupRequest contains the request portion of a PreSignup event
type CognitoEventUserPoolsPreSignupRequest struct {
	UserAttributes map[string]string `json:"userAttributes"`
	ValidationData map[string]string `json:"validationData"`
	ClientMetadata map[string]string `json:"clientMetadata"`
}

// CognitoEventUserPoolsPreSignupResponse contains the response portion of a PreSignup event
type CognitoEventUserPoolsPreSignupResponse struct {
	AutoConfirmUser bool `json:"autoConfirmUser"`
	AutoVerifyEmail bool `json:"autoVerifyEmail"`
	AutoVerifyPhone bool `json:"autoVerifyPhone"`
}

// CognitoEventUserPoolsPreAuthenticationRequest contains the request portion of a PreAuthentication event
type CognitoEventUserPoolsPreAuthenticationRequest struct {
	UserAttributes map[string]string `json:"userAttributes"`
	ValidationData map[string]string `json:"validationData"`
}

// CognitoEventUserPoolsPreAuthenticationResponse contains the response portion of a PreAuthentication event
type CognitoEventUserPoolsPreAuthenticationResponse struct {
}

// CognitoEventUserPoolsPostConfirmationRequest contains the request portion of a PostConfirmation event
type CognitoEventUserPoolsPostConfirmationRequest struct {
	UserAttributes map[string]string `json:"userAttributes"`
	ClientMetadata map[string]string `json:"clientMetadata"`
}

// CognitoEventUserPoolsPostConfirmationResponse contains the response portion of a PostConfirmation event
type CognitoEventUserPoolsPostConfirmationResponse struct {
}

// CognitoEventUserPoolsPreTokenGenRequest contains request portion of PreTokenGen event
type CognitoEventUserPoolsPreTokenGenRequest struct {
	UserAttributes     map[string]string  `json:"userAttributes"`
	GroupConfiguration GroupConfiguration `json:"groupConfiguration"`
	ClientMetadata     map[string]string  `json:"clientMetadata"`
}

// CognitoEventUserPoolsPreTokenGenResponse containst the response portion of  a PreTokenGen event
type CognitoEventUserPoolsPreTokenGenResponse struct {
	ClaimsOverrideDetails ClaimsOverrideDetails `json:"claimsOverrideDetails"`
}

// CognitoEventUserPoolsPostAuthenticationRequest contains the request portion of a PostAuthentication event
type CognitoEventUserPoolsPostAuthenticationRequest struct {
	NewDeviceUsed  bool              `json:"newDeviceUsed"`
	UserAttributes map[string]string `json:"userAttributes"`
	ClientMetadata map[string]string `json:"clientMetadata"`
}

// CognitoEventUserPoolsPostAuthenticationResponse contains the response portion of a PostAuthentication event
type CognitoEventUserPoolsPostAuthenticationResponse struct {
}

// CognitoEventUserPoolsMigrateUserRequest contains the request portion of a MigrateUser event
type CognitoEventUserPoolsMigrateUserRequest struct {
	Password       string            `json:"password"`
	ValidationData map[string]string `json:"validationData"`
	ClientMetadata map[string]string `json:"clientMetadata"`
}

// CognitoEventUserPoolsMigrateUserResponse contains the response portion of a MigrateUser event
type CognitoEventUserPoolsMigrateUserResponse struct {
	UserAttributes         map[string]string `json:"userAttributes"`
	FinalUserStatus        string            `json:"finalUserStatus"`
	MessageAction          string            `json:"messageAction"`
	DesiredDeliveryMediums []string          `json:"desiredDeliveryMediums"`
	ForceAliasCreation     bool              `json:"forceAliasCreation"`
}

// ClaimsOverrideDetails allows lambda to add, suppress or override claims in the token
type ClaimsOverrideDetails struct {
	GroupOverrideDetails  GroupConfiguration `json:"groupOverrideDetails"`
	ClaimsToAddOrOverride map[string]string  `json:"claimsToAddOrOverride"`
	ClaimsToSuppress      []string           `json:"claimsToSuppress"`
}

// GroupConfiguration allows lambda to override groups, roles and set a perferred role
type GroupConfiguration struct {
	GroupsToOverride   []string `json:"groupsToOverride"`
	IAMRolesToOverride []string `json:"iamRolesToOverride"`
	PreferredRole      *string  `json:"preferredRole"`
}

// CognitoEventUserPoolsChallengeResult represents a challenge that is presented to the user in the authentication
// process that is underway, along with the corresponding result.
type CognitoEventUserPoolsChallengeResult struct {
	ChallengeName     string `json:"challengeName"`
	ChallengeResult   bool   `json:"challengeResult"`
	ChallengeMetadata string `json:"challengeMetadata"`
}

// CognitoEventUserPoolsDefineAuthChallengeRequest defines auth challenge request parameters
type CognitoEventUserPoolsDefineAuthChallengeRequest struct {
	UserAttributes map[string]string                       `json:"userAttributes"`
	Session        []*CognitoEventUserPoolsChallengeResult `json:"session"`
	ClientMetadata map[string]string                       `json:"clientMetadata"`
	UserNotFound   bool                                    `json:"userNotFound"`
}

// CognitoEventUserPoolsDefineAuthChallengeResponse defines auth challenge response parameters
type CognitoEventUserPoolsDefineAuthChallengeResponse struct {
	ChallengeName      string `json:"challengeName"`
	IssueTokens        bool   `json:"issueTokens"`
	FailAuthentication bool   `json:"failAuthentication"`
}

// CognitoEventUserPoolsDefineAuthChallenge sent by AWS Cognito User Pools to initiate custom authentication flow
type CognitoEventUserPoolsDefineAuthChallenge struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsDefineAuthChallengeRequest  `json:"request"`
	Response CognitoEventUserPoolsDefineAuthChallengeResponse `json:"response"`
}

// CognitoEventUserPoolsCreateAuthChallengeRequest defines create auth challenge request parameters
type CognitoEventUserPoolsCreateAuthChallengeRequest struct {
	UserAttributes map[string]string                       `json:"userAttributes"`
	ChallengeName  string                                  `json:"challengeName"`
	Session        []*CognitoEventUserPoolsChallengeResult `json:"session"`
	ClientMetadata map[string]string                       `json:"clientMetadata"`
}

// CognitoEventUserPoolsCreateAuthChallengeResponse defines create auth challenge response rarameters
type CognitoEventUserPoolsCreateAuthChallengeResponse struct {
	PublicChallengeParameters  map[string]string `json:"publicChallengeParameters"`
	PrivateChallengeParameters map[string]string `json:"privateChallengeParameters"`
	ChallengeMetadata          string            `json:"challengeMetadata"`
}

// CognitoEventUserPoolsCreateAuthChallenge sent by AWS Cognito User Pools to create a challenge to present to the user
type CognitoEventUserPoolsCreateAuthChallenge struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsCreateAuthChallengeRequest  `json:"request"`
	Response CognitoEventUserPoolsCreateAuthChallengeResponse `json:"response"`
}

// CognitoEventUserPoolsVerifyAuthChallengeRequest defines verify auth challenge request parameters
type CognitoEventUserPoolsVerifyAuthChallengeRequest struct {
	UserAttributes             map[string]string `json:"userAttributes"`
	PrivateChallengeParameters map[string]string `json:"privateChallengeParameters"`
	ChallengeAnswer            interface{}       `json:"challengeAnswer"`
	ClientMetadata             map[string]string `json:"clientMetadata"`
}

// CognitoEventUserPoolsVerifyAuthChallengeResponse defines verify auth challenge response parameters
type CognitoEventUserPoolsVerifyAuthChallengeResponse struct {
	AnswerCorrect bool `json:"answerCorrect"`
}

// CognitoEventUserPoolsVerifyAuthChallenge sent by AWS Cognito User Pools to verify if the response from the end user
// for a custom Auth Challenge is valid or not
type CognitoEventUserPoolsVerifyAuthChallenge struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsVerifyAuthChallengeRequest  `json:"request"`
	Response CognitoEventUserPoolsVerifyAuthChallengeResponse `json:"response"`
}

// CognitoEventUserPoolsCustomMessage is sent by AWS Cognito User Pools before a verification or MFA message is sent,
// allowing a user to customize the message dynamically.
type CognitoEventUserPoolsCustomMessage struct {
	CognitoEventUserPoolsHeader
	Request  CognitoEventUserPoolsCustomMessageRequest  `json:"request"`
	Response CognitoEventUserPoolsCustomMessageResponse `json:"response"`
}

// CognitoEventUserPoolsCustomMessageRequest contains the request portion of a CustomMessage event
type CognitoEventUserPoolsCustomMessageRequest struct {
	UserAttributes    map[string]interface{} `json:"userAttributes"`
	CodeParameter     string                 `json:"codeParameter"`
	UsernameParameter string                 `json:"usernameParameter"`
	ClientMetadata    map[string]string      `json:"clientMetadata"`
}

// CognitoEventUserPoolsCustomMessageResponse contains the response portion of a CustomMessage event
type CognitoEventUserPoolsCustomMessageResponse struct {
	SMSMessage   string `json:"smsMessage"`
	EmailMessage string `json:"emailMessage"`
	EmailSubject string `json:"emailSubject"`
}
