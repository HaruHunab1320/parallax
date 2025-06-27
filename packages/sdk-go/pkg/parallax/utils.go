package parallax

import (
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