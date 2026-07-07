package parallax

import (
	"encoding/json"
	"time"
	
	"github.com/google/uuid"
)

// Time-related functions (wrapped for easier testing)
var (
	timeNow    = time.Now
	timeSecond = time.Second
	timeMinute = time.Minute
	timeHour   = time.Hour
	timeTicker = time.NewTicker
)

// generateID generates a unique ID
func generateID() string {
	return uuid.New().String()
}

// mustMarshalJSON marshals data to JSON string, panics on error
func mustMarshalJSON(v interface{}) string {
	data, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(data)
}