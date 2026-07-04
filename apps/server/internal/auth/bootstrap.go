package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "paladin/apps/server/internal/db/sqlc"
)

type PoolLike interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

func BootstrapAdmin(ctx context.Context, q *sqlcgen.Queries, pool *pgxpool.Pool, email, password string, cost int) error {
	if email == "" || password == "" {
		return errors.New("bootstrap admin email/password must be set")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	qtx := q.WithTx(tx)

	hashed, err := HashPassword(password, cost)
	if err != nil {
		return err
	}

	var userID int64
	u, err := qtx.CreateUser(ctx, sqlcgen.CreateUserParams{Email: email, PasswordHash: hashed})
	if err != nil {
		if existing, lookupErr := qtx.GetUserByEmail(ctx, email); lookupErr == nil {
			userID = existing.ID
		} else {
			return err
		}
	} else {
		userID = u.ID
	}

	if err := qtx.AssignRoleByName(ctx, sqlcgen.AssignRoleByNameParams{UserID: userID, Name: "admin"}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
