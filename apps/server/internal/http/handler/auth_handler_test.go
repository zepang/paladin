package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"

	sqlcgen "paladin/apps/server/internal/db/sqlc"
)

const testJWTSecret = "0123456789abcdef0123456789abcdef0123456789"

type fakeStore struct {
	users     map[string]sqlcgen.User
	byID      map[int64]sqlcgen.User
	nextID    int64
	roles     map[int64][]string
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		users: map[string]sqlcgen.User{},
		byID:  map[int64]sqlcgen.User{},
		roles: map[int64][]string{},
	}
}

func (f *fakeStore) CreateUserTx(ctx context.Context, email, hashedPassword string) (int64, error) {
	key := strings.ToLower(email)
	if _, exists := f.users[key]; exists {
		return 0, &pgconn.PgError{Code: "23505"}
	}
	f.nextID++
	u := sqlcgen.User{ID: f.nextID, Email: email, PasswordHash: hashedPassword}
	f.users[key] = u
	f.byID[u.ID] = u
	return u.ID, nil
}

func (f *fakeStore) AssignDefaultRoleTx(ctx context.Context, userID int64) error {
	f.roles[userID] = appendUnique(f.roles[userID], "user")
	return nil
}

func (f *fakeStore) GetUserByEmail(ctx context.Context, email string) (sqlcgen.User, error) {
	if u, ok := f.users[strings.ToLower(email)]; ok {
		return u, nil
	}
	return sqlcgen.User{}, errNotFound
}

func (f *fakeStore) GetRolesByUserID(ctx context.Context, userID int64) ([]string, error) {
	return f.roles[userID], nil
}

var errNotFound = &pgconn.PgError{Code: "P0002"}

func appendUnique(s []string, v string) []string {
	for _, x := range s {
		if x == v {
			return s
		}
	}
	return append(s, v)
}

func newAuthRouter(s *fakeStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewAuthHandler(testJWTSecret, 15*time.Minute, s, 4)
	r.POST("/auth/register", h.Register)
	r.POST("/auth/login", h.Login)
	return r
}

func doJSON(r *gin.Engine, method, path string, body any) *httptest.ResponseRecorder {
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRegister_NewEmail_201(t *testing.T) {
	s := newFakeStore()
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/register", gin.H{"email": "new@x.com", "password": "password123"})
	if w.Code != 201 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestRegister_DuplicateNormalized_409(t *testing.T) {
	s := newFakeStore()
	s.users["foo@x.com"] = sqlcgen.User{ID: 1, Email: "foo@x.com"}
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/register", gin.H{"email": "FOO@x.com", "password": "password123"})
	if w.Code != 409 {
		t.Fatalf("status = %d, want 409", w.Code)
	}
}

func TestRegister_EmptyEmail_400(t *testing.T) {
	s := newFakeStore()
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/register", gin.H{"email": "", "password": "password123"})
	if w.Code != 400 {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestRegister_EmptyPassword_400(t *testing.T) {
	s := newFakeStore()
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/register", gin.H{"email": "x@x.com", "password": ""})
	if w.Code != 400 {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestRegister_ShortPassword_400(t *testing.T) {
	s := newFakeStore()
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/register", gin.H{"email": "x@x.com", "password": "short"})
	if w.Code != 400 {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestRegister_CaseInsensitiveEmailCollision(t *testing.T) {
	s := newFakeStore()
	r := newAuthRouter(s)
	w1 := doJSON(r, "POST", "/auth/register", gin.H{"email": "Foo@x.com", "password": "password123"})
	if w1.Code != 201 {
		t.Fatalf("first register status = %d", w1.Code)
	}
	w2 := doJSON(r, "POST", "/auth/register", gin.H{"email": "foo@x.com", "password": "password123"})
	if w2.Code != 409 {
		t.Fatalf("second register status = %d, want 409 (case-insensitive collision)", w2.Code)
	}
}

func TestLogin_Valid_ReturnsJWT(t *testing.T) {
	s := newFakeStore()
	hashed, _ := hashForTest("password123")
	s.users["foo@x.com"] = sqlcgen.User{ID: 1, Email: "foo@x.com", PasswordHash: hashed}
	s.roles[1] = []string{"user"}
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/login", gin.H{"email": "foo@x.com", "password": "password123"})
	if w.Code != 200 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	var body struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Token == "" {
		t.Error("token empty")
	}
}

func TestLogin_WrongPassword_401NoToken(t *testing.T) {
	s := newFakeStore()
	hashed, _ := hashForTest("right-password")
	s.users["foo@x.com"] = sqlcgen.User{ID: 1, Email: "foo@x.com", PasswordHash: hashed}
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/login", gin.H{"email": "foo@x.com", "password": "wrong-password"})
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401", w.Code)
	}
	if strings.Contains(w.Body.String(), "token") {
		t.Errorf("body echoes token: %s", w.Body.String())
	}
	if strings.Contains(w.Body.String(), "wrong-password") {
		t.Errorf("body echoes password")
	}
}

func TestLogin_ResponseHasNoSecretEcho(t *testing.T) {
	s := newFakeStore()
	hashed, _ := hashForTest("password123")
	s.users["foo@x.com"] = sqlcgen.User{ID: 1, Email: "foo@x.com", PasswordHash: hashed}
	s.roles[1] = []string{"user"}
	r := newAuthRouter(s)
	w := doJSON(r, "POST", "/auth/login", gin.H{"email": "foo@x.com", "password": "password123"})
	if strings.Contains(w.Body.String(), "password123") {
		t.Errorf("body echoes password: %s", w.Body.String())
	}
}
