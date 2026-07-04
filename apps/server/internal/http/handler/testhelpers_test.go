package handler

import "golang.org/x/crypto/bcrypt"

func hashForTest(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.MinCost)
	return string(b), err
}
