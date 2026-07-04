package handler

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "paladin/apps/server/internal/db/sqlc"
)

type PgStore struct {
	queries *sqlcgen.Queries
	pool    *pgxpool.Pool
}

func NewPgStore(queries *sqlcgen.Queries, pool *pgxpool.Pool) *PgStore {
	return &PgStore{queries: queries, pool: pool}
}

func (s *PgStore) CreateUserTx(ctx context.Context, email, hashedPassword string) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)
	u, err := qtx.CreateUser(ctx, sqlcgen.CreateUserParams{Email: email, PasswordHash: hashedPassword})
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return u.ID, nil
}

func (s *PgStore) AssignDefaultRoleTx(ctx context.Context, userID int64) error {
	return s.queries.AssignDefaultRole(ctx, userID)
}

func (s *PgStore) GetUserByEmail(ctx context.Context, email string) (sqlcgen.User, error) {
	return s.queries.GetUserByEmail(ctx, email)
}

func (s *PgStore) GetRolesByUserID(ctx context.Context, userID int64) ([]string, error) {
	return s.queries.GetRolesByUserID(ctx, userID)
}

var _ pgx.Tx = (pgx.Tx)(nil)
