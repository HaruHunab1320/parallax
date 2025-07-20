module github.com/parallax/demo-go

go 1.21

require (
    github.com/parallax/sdk-go v0.1.0
    google.golang.org/grpc v1.59.0
)

replace github.com/parallax/sdk-go => ../../packages/sdk-go