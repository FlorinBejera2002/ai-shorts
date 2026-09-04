package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	key := os.Getenv("INTERNAL_API_KEY")
	if key == "" {
		log.Fatal("INTERNAL_API_KEY is required")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	target, err := url.Parse(os.Getenv("PYTHON_BACKEND_URL"))
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") || target.User != nil {
		log.Fatal("PYTHON_BACKEND_URL must be an explicit trusted HTTP(S) origin")
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatal("database configuration invalid")
	}
	defer db.Close()
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	address := os.Getenv("LISTEN_ADDR")
	if address == "" {
		address = ":8080"
	}
	root := os.Getenv("LOCAL_MEDIA_ROOT")
	if root == "" {
		root = "/app/media"
	}
	app := &API{db: db, key: key, mediaRoot: root}
	server := &http.Server{Addr: address, Handler: app.handler(target),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 300 * time.Second,
		WriteTimeout: 300 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			log.Print("graceful shutdown deadline exceeded")
		}
	}()
	log.Print("Native job API starting")
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
