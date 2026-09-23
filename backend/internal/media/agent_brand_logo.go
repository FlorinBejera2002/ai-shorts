package media

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/data"
)

type AgentLogoInput struct {
	ExpectedState  string  `json:"expected_state"`
	LogoResourceID *string `json:"logo_resource_id,omitempty"`
	ReceiptID      string  `json:"receipt_id,omitempty"`
}
type AgentLogoResult struct {
	ExpectedState string `json:"expected_state"`
	HasLogo       bool   `json:"has_logo"`
	UndoReceiptID string `json:"undo_receipt_id"`
}
type agentLogoReceipt struct {
	Result   AgentLogoResult `json:"result"`
	Previous *string         `json:"previous"`
}

func readLogoState(ctx context.Context,tx *sql.Tx,user string)(AgentLogoResult,error){
	var out AgentLogoResult
	var raw []byte
	err:=tx.QueryRowContext(ctx,`SELECT to_jsonb(b) FROM brand_kits b WHERE user_id=$1 FOR UPDATE`,user).Scan(&raw)
	if errors.Is(err,sql.ErrNoRows){raw=[]byte("absent")}else if err!=nil{return out,err}else{
		var row struct{Logo *string `json:"logo_path"`};if err=json.Unmarshal(raw,&row);err!=nil{return out,err};out.HasLogo=row.Logo!=nil
	}
	out.ExpectedState=agentaction.SnapshotDigest(raw)
	return out,nil
}

// AgentBrandLogo changes only the attachment. Files remain available to stories,
// projects and guarded Undo; detaching never deletes shared stored media.
func (s *Service) AgentBrandLogo(ctx context.Context, user, request, action string, in AgentLogoInput) (AgentLogoResult, error) {
	var saved agentLogoReceipt
	if !data.ValidUUID(request) || len(in.ExpectedState) != 64 || (action != "brand.logo.update" && action != "brand.logo.restore") {
		return saved.Result, errors.New("Invalid logo action")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return saved.Result, err
	}
	defer tx.Rollback()
	replay, err := agentaction.Replay(ctx, tx, user, request, action, in, &saved)
	if err != nil || replay {
		return saved.Result, err
	}
	if err = lockBrandLogoUser(ctx, tx, user); err != nil {
		return saved.Result, err
	}
	state, err := readLogoState(ctx, tx, user)
	if err != nil {
		return saved.Result, err
	}
	if state.ExpectedState != in.ExpectedState {
		return saved.Result, agentaction.ErrConflict
	}
	var previous sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT logo_path FROM brand_kits WHERE user_id=$1`, user).Scan(&previous)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return saved.Result, err
	}
	if previous.Valid {
		value := previous.String
		saved.Previous = &value
	}
	var key *string
	if action == "brand.logo.restore" {
		if !data.ValidUUID(in.ReceiptID) || in.LogoResourceID != nil {
			return saved.Result, errors.New("Invalid logo restore")
		}
		var raw []byte
		if err = tx.QueryRowContext(ctx, `SELECT result FROM agent_action_receipts WHERE user_id=$1 AND request_id=$2 AND action IN ('brand.logo.update','brand.logo.restore')`, user, in.ReceiptID).Scan(&raw); err != nil {
			return saved.Result, err
		}
		var original agentLogoReceipt
		if err = json.Unmarshal(raw, &original); err != nil {
			return saved.Result, err
		}
		if original.Result.ExpectedState != in.ExpectedState {
			return saved.Result, agentaction.ErrConflict
		}
		key = original.Previous
	} else {
		if in.LogoResourceID == nil || in.ReceiptID != "" {
			return saved.Result, errors.New("Choose an attached logo or an empty resource ID to detach it")
		}
		if *in.LogoResourceID != "" {
			if !data.ValidUUID(*in.LogoResourceID) {
				return saved.Result, errors.New("Invalid logo resource")
			}
			var value string
			if err = tx.QueryRowContext(ctx, `SELECT reference FROM workspace_agent_resources WHERE id=$1 AND user_id=$2 AND kind='logo'`, *in.LogoResourceID, user).Scan(&value); err != nil {
				return saved.Result, err
			}
			key = &value
		}
	}
	if key != nil {
		canonical, e := s.ownedLogoKey(*key, user, action == "brand.logo.restore")
		if e != nil {
			return saved.Result, e
		}
		exists, e := s.Storage.Exists(ctx, canonical)
		if e != nil {
			return saved.Result, e
		}
		if !exists {
			return saved.Result, errors.New("Attached logo file is unavailable")
		}
		key = &canonical
	}
	if (key == nil && !previous.Valid) || (key != nil && previous.Valid && *key == previous.String) {
		return saved.Result, errors.New("The selected logo is already attached")
	}
	if err = writeBrandLogo(ctx, tx, user, key); err != nil {
		return saved.Result, err
	}
	state, err = readLogoState(ctx, tx, user)
	if err != nil {
		return saved.Result, err
	}
	saved.Result = AgentLogoResult{ExpectedState: state.ExpectedState, HasLogo: state.HasLogo, UndoReceiptID: request}
	if err = agentaction.Put(ctx, tx, user, request, action, in, saved); err != nil {
		return saved.Result, err
	}
	return saved.Result, tx.Commit()
}
