package main

import (
	"context"
	"log"
	"os"

	"github.com/sashabaranov/go-openai"
)

func main() {
	cfg := openai.DefaultConfig("sk-local")
	cfg.BaseURL = "http://127.0.0.1:8181/v1"
	client := openai.NewClientWithConfig(cfg)

	stream, err := client.CreateChatCompletionStream(context.Background(), openai.ChatCompletionRequest{
		Model: "qwen2.5-3b-instruct",
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleUser,
				Content: "Hello, how are you?",
			},
		},
		Stream: true,
	})
	if err != nil {
		log.Fatalf("ChatCompletionStream error: %v\n", err)
	}
	defer stream.Close()

	for {
		response, err := stream.Recv()
		if err != nil {
			log.Fatalf("Stream Recv error: %v\n", err)
		}
		os.Stdout.WriteString(response.Choices[0].Delta.Content)
	}
	
	// Server initialization and startup logic goes here
}