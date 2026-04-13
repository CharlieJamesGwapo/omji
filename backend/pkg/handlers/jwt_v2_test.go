package handlers

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func setJWTEnv(t *testing.T) {
	t.Helper()
	os.Setenv("JWT_SECRET", strings.Repeat("x", 32))
}

func TestGenerateAccessToken_ContainsRequiredClaims(t *testing.T) {
	setJWTEnv(t)
	tok, err := GenerateAccessToken(7, "a@b.c", "admin", 3, "oneride-admin")
	if err != nil {
		t.Fatal(err)
	}
	parsed, _, err := jwt.NewParser().ParseUnverified(tok, jwt.MapClaims{})
	if err != nil {
		t.Fatal(err)
	}
	claims := parsed.Claims.(jwt.MapClaims)
	for _, k := range []string{"sub", "role", "iss", "aud", "exp", "iat", "jti", "tver"} {
		if _, ok := claims[k]; !ok {
			t.Fatalf("missing claim %q", k)
		}
	}
	if claims["iss"] != "oneride-api" {
		t.Fatalf("bad iss: %v", claims["iss"])
	}
	if claims["aud"] != "oneride-admin" {
		t.Fatalf("bad aud: %v", claims["aud"])
	}
	if sub, _ := claims["sub"].(string); sub != "7" {
		t.Fatalf("sub should be string \"7\", got %v", claims["sub"])
	}
}

func TestGenerateAccessToken_ShortLifetime(t *testing.T) {
	setJWTEnv(t)
	tok, _ := GenerateAccessToken(1, "a@b.c", "user", 1, "oneride-mobile")
	parsed, _, _ := jwt.NewParser().ParseUnverified(tok, jwt.MapClaims{})
	claims := parsed.Claims.(jwt.MapClaims)
	exp := int64(claims["exp"].(float64))
	if time.Until(time.Unix(exp, 0)) > 2*time.Hour {
		t.Fatal("access token lifetime must be <= 1 hour")
	}
}
