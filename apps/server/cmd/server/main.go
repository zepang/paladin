package main

import (
	"fmt"
	"log"

	"paladin/apps/server/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	fmt.Println("Paladin Go Server")
	fmt.Printf("地址:       http://localhost:%d\n", cfg.Port)
	fmt.Printf("健康检查:   http://localhost:%d/healthz\n", cfg.Port)
}
