package events

type LexEvent struct {
	MessageVersion     string                  `json:"messageVersion,omitempty"`
	InvocationSource   string                  `json:"invocationSource,omitempty"`
	UserID             string                  `json:"userId,omitempty"`
	InputTranscript    string                  `json:"inputTranscript,omitempty"`
	SessionAttributes  SessionAttributes       `json:"sessionAttributes,omitempty"`
	RequestAttributes  map[string]string       `json:"requestAttributes,omitempty"`
	Bot                *LexBot                 `json:"bot,omitempty"`
	OutputDialogMode   string                  `json:"outputDialogMode,omitempty"`
	CurrentIntent      *LexCurrentIntent       `json:"currentIntent,omitempty"`
	AlternativeIntents []LexAlternativeIntents `json:"alternativeIntents,omitempty"`
	// Deprecated: the DialogAction field is never populated by Lex events
	DialogAction *LexDialogAction `json:"dialogAction,omitempty"`
}

type LexBot struct {
	Name    string `json:"name,omitempty"`
	Alias   string `json:"alias,omitempty"`
	Version string `json:"version,omitempty"`
}

type LexCurrentIntent struct {
	Name                     string                `json:"name,omitempty"`
	NLUIntentConfidenceScore float64               `json:"nluIntentConfidenceScore,omitempty"`
	Slots                    Slots                 `json:"slots,omitempty"`
	SlotDetails              map[string]SlotDetail `json:"slotDetails,omitempty"`
	ConfirmationStatus       string                `json:"confirmationStatus,omitempty"`
}

type LexAlternativeIntents struct {
	Name                     string                `json:"name,omitempty"`
	NLUIntentConfidenceScore float64               `json:"nluIntentConfidenceScore,omitempty"`
	Slots                    Slots                 `json:"slots,omitempty"`
	SlotDetails              map[string]SlotDetail `json:"slotDetails,omitempty"`
	ConfirmationStatus       string                `json:"confirmationStatus,omitempty"`
}

type SlotDetail struct {
	Resolutions   []map[string]string `json:"resolutions,omitempty"`
	OriginalValue string              `json:"originalValue,omitempty"`
}

type LexDialogAction struct {
	Type             string            `json:"type,omitempty"`
	FulfillmentState string            `json:"fulfillmentState,omitempty"`
	Message          map[string]string `json:"message,omitempty"`
	IntentName       string            `json:"intentName,omitempty"`
	Slots            Slots             `json:"slots,omitempty"`
	SlotToElicit     string            `json:"slotToElicit,omitempty"`
	ResponseCard     *LexResponseCard  `json:"responseCard,omitempty"`
}

type SessionAttributes map[string]string

type Slots map[string]*string

type LexResponse struct {
	SessionAttributes SessionAttributes `json:"sessionAttributes"`
	DialogAction      LexDialogAction   `json:"dialogAction,omitempty"`
}

type LexResponseCard struct {
	Version            int64        `json:"version,omitempty"`
	ContentType        string       `json:"contentType,omitempty"`
	GenericAttachments []Attachment `json:"genericAttachments,omitempty"`
}

type Attachment struct {
	Title             string              `json:"title,omitempty"`
	SubTitle          string              `json:"subTitle,omitempty"`
	ImageURL          string              `json:"imageUrl,omitempty"`
	AttachmentLinkURL string              `json:"attachmentLinkUrl,omitempty"`
	Buttons           []map[string]string `json:"buttons,omitempty"`
}

func (h *LexEvent) Clear() {
	h.Bot = nil
	h.CurrentIntent = nil
}
