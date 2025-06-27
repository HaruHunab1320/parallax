# Build stage
FROM golang:1.21-alpine AS builder

# Install dependencies
RUN apk add --no-cache git make

# Set working directory
WORKDIR /workspace

# Copy go mod files
COPY go.mod go.mod
COPY go.sum go.sum

# Download dependencies
RUN go mod download

# Copy source code
COPY cmd/ cmd/
COPY pkg/ pkg/

# Build
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -o manager cmd/manager/main.go

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /

# Copy the binary from builder
COPY --from=builder /workspace/manager .

# Run as non-root user
USER 65532:65532

ENTRYPOINT ["/manager"]