package ws

import (
	"encoding/json"
	"time"
)

type Envelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
	Ts      int64           `json:"ts"`
}

func NewEnvelope(typeName string, payload any) (Envelope, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{
		Type:    typeName,
		Payload: raw,
		Ts:      time.Now().Unix(),
	}, nil
}

func (e Envelope) Marshal() ([]byte, error) {
	return json.Marshal(e)
}
