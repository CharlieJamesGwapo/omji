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
		DBUser:     getEnv("DB_USER", "oneride_user"),
		DBPassword: getEnv("DB_PASSWORD", "oneride_password"),
		DBName:     getEnv("DB_NAME", "oneride_db"),
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
