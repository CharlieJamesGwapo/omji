package auth

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// setTicketExpiry is a test-only helper that backdates the expiry of a ticket
// already in the store. Tests are in-package so they can reach ticketStore directly.
func setTicketExpiry(key string, t time.Time) {
	ticketMu.Lock()
	defer ticketMu.Unlock()
	if rec, ok := ticketStore[key]; ok {
		rec.expiresAt = t
		ticketStore[key] = rec
	}
}

func TestTicket_RoundTrip(t *testing.T) {
	key, err := IssueTicket(42, "alice@example.com", "passenger")
	require.NoError(t, err)
	require.NotEmpty(t, key)

	uid, email, role, err := ConsumeTicket(key)
	require.NoError(t, err)
	require.Equal(t, uint(42), uid)
	require.Equal(t, "alice@example.com", email)
	require.Equal(t, "passenger", role)
}

func TestTicket_SingleUse(t *testing.T) {
	key, err := IssueTicket(7, "bob@example.com", "driver")
	require.NoError(t, err)

	// First consume succeeds.
	_, _, _, err = ConsumeTicket(key)
	require.NoError(t, err)

	// Second consume must fail — ticket was deleted on first use.
	_, _, _, err = ConsumeTicket(key)
	require.ErrorIs(t, err, ErrTicketInvalid)
}

func TestTicket_Expired(t *testing.T) {
	key, err := IssueTicket(99, "charlie@example.com", "admin")
	require.NoError(t, err)

	// Backdate the expiry using the test helper.
	setTicketExpiry(key, time.Now().Add(-time.Second))

	_, _, _, err = ConsumeTicket(key)
	require.ErrorIs(t, err, ErrTicketInvalid)
}
