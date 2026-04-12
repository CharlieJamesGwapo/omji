package config

import (
	"os"
	"strings"
	"testing"
)

func TestValidateStartup_FailsWithoutJWTSecret(t *testing.T) {
	os.Unsetenv("JWT_SECRET")
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected JWT_SECRET error, got %v", err)
	}
}

func TestValidateStartup_FailsWithShortJWTSecret(t *testing.T) {
	os.Setenv("JWT_SECRET", "tooshort")
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "32") {
		t.Fatalf("expected length error, got %v", err)
	}
}

func TestValidateStartup_FailsWithoutRefreshPepper(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	os.Unsetenv("REFRESH_TOKEN_PEPPER")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "REFRESH_TOKEN_PEPPER") {
		t.Fatalf("expected pepper error, got %v", err)
	}
}

func TestValidateStartup_FailsWithoutSSLMode(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("b", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "sslmode") {
		t.Fatalf("expected sslmode error, got %v", err)
	}
}

func TestValidateStartup_FailsOnCORSWildcard(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("b", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	os.Setenv("CORS_ORIGIN", "*")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "wildcard") {
		t.Fatalf("expected wildcard error, got %v", err)
	}
}

func TestValidateStartup_SucceedsWithAllRequired(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("b", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	os.Setenv("CORS_ORIGIN", "https://admin.example.com")
	if err := ValidateStartup(); err != nil {
		t.Fatalf("expected success, got %v", err)
	}
}
