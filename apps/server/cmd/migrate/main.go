package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func usage() {
	fmt.Fprintln(os.Stderr, "usage: migrate <up|down [n]|force <v>|version> -path <migrations-dir> -database <dsn>")
	os.Exit(2)
}

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		usage()
	}

	var migrationsPath, dsn string
	var cmdArgs []string
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-path":
			if i+1 < len(args) {
				migrationsPath = args[i+1]
				i++
			}
		case "-database":
			if i+1 < len(args) {
				dsn = args[i+1]
				i++
			}
		default:
			cmdArgs = append(cmdArgs, args[i])
		}
	}

	if migrationsPath == "" {
		migrationsPath = "apps/server/migrations"
	}
	abs, err := filepath.Abs(migrationsPath)
	if err != nil {
		log.Fatalf("resolve migrations path: %v", err)
	}
	migrationsPath = abs

	if dsn == "" {
		dsn = os.Getenv("PALADIN_DATABASE_URL")
	}
	if dsn == "" {
		log.Fatal("PALADIN_DATABASE_URL must be set or -database provided")
	}

	if len(cmdArgs) == 0 {
		usage()
	}
	cmd := cmdArgs[0]

	m, err := migrate.New(fmt.Sprintf("file://%s", migrationsPath), dsn)
	if err != nil {
		log.Fatalf("migrate.New: %v", err)
	}
	defer m.Close()

	switch cmd {
	case "up":
		if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			log.Fatalf("up: %v", err)
		}
		fmt.Println("migrations applied")
	case "down":
		n := 0
		if len(cmdArgs) >= 2 {
			fmt.Sscanf(cmdArgs[1], "%d", &n)
		}
		if n > 0 {
			if err := m.Steps(-n); err != nil && !errors.Is(err, migrate.ErrNoChange) {
				log.Fatalf("down %d: %v", n, err)
			}
		} else {
			if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
				log.Fatalf("down: %v", err)
			}
		}
		fmt.Println("migrations rolled back")
	case "force":
		if len(cmdArgs) < 2 {
			log.Fatal("force requires a version number")
		}
		var v int
		fmt.Sscanf(cmdArgs[1], "%d", &v)
		if err := m.Force(v); err != nil {
			log.Fatalf("force %d: %v", v, err)
		}
		fmt.Printf("forced version %d\n", v)
	case "version":
		v, dirty, err := m.Version()
		if err != nil {
			log.Fatalf("version: %v", err)
		}
		fmt.Printf("version=%d dirty=%v\n", v, dirty)
	default:
		usage()
	}
}
