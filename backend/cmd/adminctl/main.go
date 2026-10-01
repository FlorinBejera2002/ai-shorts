package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

func main() {
	if len(os.Args) != 3 || os.Args[1] != "grant" {
		log.Fatal("usage: adminctl grant <email>")
	}
	email := strings.ToLower(strings.TrimSpace(os.Args[2]))
	if email == "" || !strings.Contains(email, "@") {
		log.Fatal("a valid account email is required")
	}
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := db.ExecContext(ctx, `UPDATE users SET access_role='admin',account_status='active',session_version=session_version+1,updated_at=now() WHERE lower(email)=$1`, email)
	if err != nil {
		log.Fatal(err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		log.Fatal(err)
	}
	if count != 1 {
		log.Fatal("account not found; create the account in Sneep Cut first")
	}
	fmt.Printf("administrator access granted to %s; sign in again to continue\n", email)
}
