package account

import (
	"context"
	"encoding/json"
	"strings"
	"unicode/utf8"
)

type Issue struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}
type ProfileInput struct {
	Name string `json:"name"`
}

func (p *ProfileInput) Validate() error {
	p.Name = strings.Join(strings.Fields(p.Name), " ")
	if utf8.RuneCountInString(p.Name) < 2 || utf8.RuneCountInString(p.Name) > 80 {
		return &apiError{Status: 400, Message: "Profile is invalid", Issues: []Issue{{"name", "Name must contain 2 to 80 characters"}}}
	}
	return nil
}
func (h *Handler) readProfile(ctx context.Context, userID string, authenticatedAt int64) (map[string]any, error) {
	var raw []byte
	err := h.db.QueryRowContext(ctx, `SELECT row_to_json(row) FROM (SELECT u.id,u.name,u.email,u.avatar_url AS image,CASE WHEN COALESCE(u.password_hash,'')<>'' THEN 'credentials' ELSE COALESCE((SELECT provider FROM accounts WHERE user_id=u.id ORDER BY provider LIMIT 1),u.provider) END AS provider,u.email_verified AS "emailVerified",u.created_at AS "createdAt",COALESCE(u.password_hash,'')<>'' AS "canChangePassword",EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=u.id) AS "deletionPending" FROM users u WHERE u.id=$1) row`, userID).Scan(&raw)
	if err != nil {
		return nil, err
	}
	var profile map[string]any
	if err = json.Unmarshal(raw, &profile); err != nil {
		return nil, err
	}
	profile["recentlyAuthenticated"] = recent(authenticatedAt, h.now().Unix())
	return profile, nil
}
func (h *Handler) saveProfile(ctx context.Context, userID, name string) error {
	result, err := h.db.ExecContext(ctx, `UPDATE users SET name=$2,updated_at=now() WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID, name)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return &apiError{Status: 409, Message: "Account is unavailable or deletion is pending"}
	}
	return nil
}
