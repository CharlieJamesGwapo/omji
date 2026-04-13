package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

// TicketLifetime is the TTL for a one-time WebSocket upgrade ticket.
const TicketLifetime = 30 * time.Second

// ErrTicketInvalid is returned when a ticket is missing, already consumed,
// or past its expiry time.
var ErrTicketInvalid = errors.New("invalid or expired ticket")

type ticket struct {
	userID    uint
	email     string
	role      string
	expiresAt time.Time
}

var (
	ticketMu    sync.Mutex
	ticketStore = make(map[string]ticket)
)

// IssueTicket generates a one-time, 30-second ticket for the given identity.
// The returned key is 32 random bytes encoded as base64.RawURLEncoding.
func IssueTicket(userID uint, email, role string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	key := base64.RawURLEncoding.EncodeToString(b)

	ticketMu.Lock()
	ticketStore[key] = ticket{
		userID:    userID,
		email:     email,
		role:      role,
		expiresAt: time.Now().Add(TicketLifetime),
	}
	ticketMu.Unlock()

	return key, nil
}

// ConsumeTicket performs an atomic lookup-and-delete. It returns the stored
// identity if the ticket exists and has not expired; otherwise ErrTicketInvalid.
func ConsumeTicket(key string) (userID uint, email, role string, err error) {
	ticketMu.Lock()
	defer ticketMu.Unlock()

	t, ok := ticketStore[key]
	if !ok {
		return 0, "", "", ErrTicketInvalid
	}
	// Always delete — single-use regardless of expiry.
	delete(ticketStore, key)

	if time.Now().After(t.expiresAt) {
		return 0, "", "", ErrTicketInvalid
	}

	return t.userID, t.email, t.role, nil
}

// SweepExpired removes all expired tickets from the store. It is safe to call
// from a background goroutine.
func SweepExpired() {
	now := time.Now()
	ticketMu.Lock()
	defer ticketMu.Unlock()
	for k, t := range ticketStore {
		if now.After(t.expiresAt) {
			delete(ticketStore, k)
		}
	}
}
