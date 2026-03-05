# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Set Go proxy with fallback
ENV GOPROXY=https://proxy.golang.org,direct
ENV GOSUMDB=sum.golang.org
ENV CGO_ENABLED=0

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies with retry
RUN go mod download || go mod download || go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o bin/server cmd/main.go

# Runtime stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy binary from builder
COPY --from=builder /app/bin/server .

# Expose port
EXPOSE 8080

# Run the application
CMD ["./server"]
