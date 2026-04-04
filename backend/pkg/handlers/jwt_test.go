package handlers

import (
	"os"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

const testJWTSecret = "test-secret-for-unit-tests"

func TestMain(m *testing.M) {
	os.Setenv("JWT_SECRET", testJWTSecret)
	os.Exit(m.Run())
}

func TestGenerateToken(t *testing.T) {
	t.Run("returns a valid JWT string", func(t *testing.T) {
		tokenStr, err := GenerateToken(1, "user@example.com", "user")
		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}
		if tokenStr == "" {
			t.Fatal("GenerateToken returned empty string")
		}
	})

	t.Run("token contains correct claims", func(t *testing.T) {
		userID := uint(42)
		email := "test@oneride.app"
		role := "driver"

		tokenStr, err := GenerateToken(userID, email, role)
		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			return []byte(testJWTSecret), nil
		})
		if err != nil {
			t.Fatalf("failed to parse token: %v", err)
		}
		if !token.Valid {
			t.Fatal("parsed token is not valid")
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			t.Fatal("could not cast claims to MapClaims")
		}

		if got := uint(claims["user_id"].(float64)); got != userID {
			t.Errorf("user_id = %d, want %d", got, userID)
		}
		if got := claims["email"].(string); got != email {
			t.Errorf("email = %q, want %q", got, email)
		}
		if got := claims["role"].(string); got != role {
			t.Errorf("role = %q, want %q", got, role)
		}
	})

	t.Run("token is parseable and uses HS256", func(t *testing.T) {
		tokenStr, err := GenerateToken(1, "a@b.com", "admin")
		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				t.Fatalf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(testJWTSecret), nil
		})
		if err != nil {
			t.Fatalf("failed to parse token: %v", err)
		}
		if !token.Valid {
			t.Fatal("token should be valid")
		}
	})

	t.Run("token has an expiration claim", func(t *testing.T) {
		tokenStr, err := GenerateToken(1, "a@b.com", "user")
		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			return []byte(testJWTSecret), nil
		})
		if err != nil {
			t.Fatalf("failed to parse token: %v", err)
		}

		claims := token.Claims.(jwt.MapClaims)
		if _, ok := claims["exp"]; !ok {
			t.Error("token missing exp claim")
		}
	})
}
