package config

import (
	"fmt"
	"log"
	"os"
	"strings"
	"sync"

	"github.com/joho/godotenv"
)

var (
	jwtSecret     string
	jwtSecretOnce sync.Once
)

// GetJWTSecret returns the JWT secret from the JWT_SECRET env var.
// It log.Fatals if the env var is not set. The value is cached after first call.
func GetJWTSecret() string {
	jwtSecretOnce.Do(func() {
		jwtSecret = os.Getenv("JWT_SECRET")
		if jwtSecret == "" {
			log.Fatal("FATAL: JWT_SECRET environment variable is not set")
		}
	})
	return jwtSecret
}

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	JWTSecret  string
	SMTPHost   string
	SMTPPort   string
	SMTPUser   string
	SMTPPass   string
}

func LoadConfig() *Config {
	// Load .env file
	_ = godotenv.Load()

	return &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", ""),
		DBPassword: getEnv("DB_PASSWORD", ""),
		DBName:     getEnv("DB_NAME", ""),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		JWTSecret:  "", // Use config.GetJWTSecret() instead; validated at startup
		SMTPHost:   getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:   getEnv("SMTP_PORT", "587"),
		SMTPUser:   getEnv("SMTP_USER", ""),
		SMTPPass:   getEnv("SMTP_PASS", ""),
	}
}

func (c *Config) GetDSN() string {
	// Check if DATABASE_URL is set (for Render/Supabase deployment)
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		// Append sslmode=require for Supabase if not already present
		if !strings.Contains(databaseURL, "sslmode=") {
			return databaseURL + "?sslmode=require"
		}
		return databaseURL
	}

	// Fall back to individual environment variables (for local development)
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode,
	)
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// SecurityV2Enabled reports whether the SECURITY_V2 feature flag is active.
// When false, certain hardened behaviours (short access-token lifetime,
// CORS wildcard rejection, AdminFreshMiddleware) are relaxed to allow
// gradual rollout. Set SECURITY_V2=true in production to enable all guards.
func SecurityV2Enabled() bool {
	return os.Getenv("SECURITY_V2") == "true"
}

// ValidateStartup verifies required environment variables are present and safe.
// Returns a non-nil error describing the first problem found. Callers should
// log.Fatal on the returned error at process start.
func ValidateStartup() error {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}
	if len(secret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 bytes (got %d)", len(secret))
	}

	if os.Getenv("REFRESH_TOKEN_PEPPER") == "" {
		return fmt.Errorf("REFRESH_TOKEN_PEPPER is required")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if !strings.Contains(dbURL, "sslmode=require") && !strings.Contains(dbURL, "sslmode=verify-full") {
		return fmt.Errorf("DATABASE_URL must enforce sslmode=require (or verify-full)")
	}

	corsOrigin := os.Getenv("CORS_ORIGIN")
	if corsOrigin == "" {
		corsOrigin = os.Getenv("ALLOWED_ORIGINS")
	}
	for _, o := range strings.Split(corsOrigin, ",") {
		if strings.TrimSpace(o) == "*" {
			if !SecurityV2Enabled() {
				log.Printf("warning: CORS wildcard detected but SECURITY_V2 disabled — allowing")
			} else {
				return fmt.Errorf("CORS_ORIGIN wildcard '*' is not allowed")
			}
		}
	}

	return nil
}
