package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"

	"paladin/apps/server/internal/audit"
	"paladin/apps/server/internal/auth"
	sqlcgen "paladin/apps/server/internal/db/sqlc"
	"paladin/apps/server/internal/http/middleware"
)

type AuthStore interface {
	CreateUserTx(ctx context.Context, email, hashedPassword string) (int64, error)
	AssignDefaultRoleTx(ctx context.Context, userID int64) error
	GetUserByEmail(ctx context.Context, email string) (sqlcgen.User, error)
	GetRolesByUserID(ctx context.Context, userID int64) ([]string, error)
}

type AuthHandler struct {
	jwtSecret     string
	jwtTTL        time.Duration
	store         AuthStore
	bcryptCost    int
	auditRecorder *audit.Recorder
}

func NewAuthHandler(jwtSecret string, jwtTTL time.Duration, store AuthStore, bcryptCost int) *AuthHandler {
	return &AuthHandler{
		jwtSecret:  jwtSecret,
		jwtTTL:     jwtTTL,
		store:      store,
		bcryptCost: bcryptCost,
	}
}

func (h *AuthHandler) WithAuditRecorder(r *audit.Recorder) *AuthHandler {
	h.auditRecorder = r
	return h
}

func (h *AuthHandler) record(c *gin.Context, rec audit.Record) {
	if h.auditRecorder == nil {
		return
	}
	if rec.RequestIP == "" {
		rec.RequestIP = c.ClientIP()
	}
	if rec.Metadata == nil {
		rec.Metadata = map[string]any{}
	}
	rec.Metadata["ip"] = c.ClientIP()
	rec.Metadata["user_agent"] = c.Request.UserAgent()
	_ = h.auditRecorder.Record(c.Request.Context(), rec)
}

type registerReq struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

type loginReq struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		middleware.WriteError(c, http.StatusBadRequest, "invalid_input", "email and password (>=8 chars) required")
		return
	}
	req.Email = normalizeEmail(req.Email)

	hashed, err := auth.HashPassword(req.Password, h.bcryptCost)
	if err != nil {
		middleware.WriteError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		return
	}

	ctx := c.Request.Context()
	userID, err := h.store.CreateUserTx(ctx, req.Email, hashed)
	if err != nil {
		if isUniqueViolation(err) {
			h.record(c, audit.Record{Action: "auth.register", Status: "failure"})
			middleware.WriteError(c, http.StatusConflict, "email_taken", "email already registered")
			return
		}
		h.record(c, audit.Record{Action: "auth.register", Status: "failure"})
		middleware.WriteError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		return
	}
	if err := h.store.AssignDefaultRoleTx(ctx, userID); err != nil {
		h.record(c, audit.Record{Action: "auth.register", Status: "failure"})
		middleware.WriteError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		return
	}

	h.record(c, audit.Record{UserID: &userID, Action: "auth.register", Status: "success"})

	c.JSON(http.StatusCreated, gin.H{
		"id":    userID,
		"email": req.Email,
		"roles": []string{"user"},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		middleware.WriteError(c, http.StatusBadRequest, "invalid_input", "email and password required")
		return
	}
	req.Email = normalizeEmail(req.Email)

	ctx := c.Request.Context()
	user, err := h.store.GetUserByEmail(ctx, req.Email)
	if err != nil {
		h.record(c, audit.Record{Action: "auth.login", Status: "failure"})
		middleware.WriteError(c, http.StatusUnauthorized, "invalid_credentials", "invalid credentials")
		return
	}
	if err := auth.ComparePassword(user.PasswordHash, req.Password); err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			uid := user.ID
			h.record(c, audit.Record{UserID: &uid, Action: "auth.login", Status: "failure"})
			middleware.WriteError(c, http.StatusUnauthorized, "invalid_credentials", "invalid credentials")
			return
		}
		middleware.WriteError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		return
	}

	roles, err := h.store.GetRolesByUserID(ctx, user.ID)
	if err != nil {
		middleware.WriteError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		return
	}

	tok, err := auth.Issue(h.jwtSecret, user.ID, user.Email, roles, h.jwtTTL)
	if err != nil {
		middleware.WriteError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		return
	}

	h.record(c, audit.Record{UserID: &user.ID, Action: "auth.login", Status: "success"})

	expiresAt := time.Now().Add(h.jwtTTL)
	c.JSON(http.StatusOK, gin.H{
		"token":      tok,
		"token_type": "Bearer",
		"expires_at": expiresAt.Format(time.RFC3339),
	})
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
