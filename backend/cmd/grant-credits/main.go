package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"sneepcut/backend-go/internal/admincredits"
	"sneepcut/backend-go/internal/data"
)

func main() {
	var batchKey, cutoffValue string
	var amount int
	var apply bool
	flag.StringVar(&batchKey, "batch-key", "", "stable unique identifier; reuse on retries")
	flag.IntVar(&amount, "amount", 0, "positive bonus added to every eligible account")
	flag.StringVar(&cutoffValue, "cutoff", "", "inclusive RFC3339 account creation cutoff")
	flag.BoolVar(&apply, "apply", false, "apply the grant; otherwise preview only")
	flag.Parse()
	cutoff, err := time.Parse(time.RFC3339, cutoffValue)
	if err != nil {
		fatal("cutoff must be RFC3339 and include a timezone")
	}
	db, err := data.Open(context.Background(), data.Config{DSN: os.Getenv("DATABASE_URL"), MaxOpenConns: 2, MaxIdleConns: 1, MaxIdleTime: time.Minute})
	if err != nil {
		fatal("database connection failed")
	}
	defer db.Close()
	service := admincredits.New(db)
	var report admincredits.Report
	if apply {
		report, err = service.Apply(context.Background(), batchKey, amount, cutoff)
	} else {
		report, err = service.Preview(context.Background(), batchKey, amount, cutoff)
	}
	if err != nil {
		fatal(err.Error())
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		fatal("encode report")
	}
}

func fatal(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }
