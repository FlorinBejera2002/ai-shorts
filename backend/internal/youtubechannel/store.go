package youtubechannel

import (
	"context"
	"database/sql"
	"errors"
)

// Connection is the persisted grant for one user. Credentials is sealed.
type Connection struct {
	ID                string
	ChannelID         string
	Title             string
	AvatarURL         *string
	UploadsPlaylistID string
	Credentials       string
}

// Store persists connections. Account checks are part of each write so a
// suspended, deleted or re-authenticated account cannot gain a grant.
type Store interface {
	CanConnect(ctx context.Context, userID string, sessionVersion int) (bool, error)
	Connection(ctx context.Context, userID string) (Connection, error)
	SaveConnection(ctx context.Context, userID string, sessionVersion int, connection Connection) error
	UpdateCredentials(ctx context.Context, userID, connectionID, credentials string) error
	DeleteConnection(ctx context.Context, userID, connectionID string) error
}

// PostgresStore implements Store on the youtube_channel_connections table.
type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) CanConnect(ctx context.Context, userID string, sessionVersion int) (bool, error) {
	var allowed bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1 AND u.session_version=$2 AND u.account_status='active' AND u.access_role IN ('member','admin') AND NOT u.email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id))`, userID, sessionVersion).Scan(&allowed)
	return allowed, err
}

func (s *PostgresStore) Connection(ctx context.Context, userID string) (Connection, error) {
	var connection Connection
	var avatar sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT id,channel_id,title,avatar_url,uploads_playlist_id,credentials FROM youtube_channel_connections WHERE user_id=$1`, userID).Scan(&connection.ID, &connection.ChannelID, &connection.Title, &avatar, &connection.UploadsPlaylistID, &connection.Credentials)
	if errors.Is(err, sql.ErrNoRows) {
		return Connection{}, ErrNotConnected
	}
	if err != nil {
		return Connection{}, err
	}
	if avatar.Valid {
		connection.AvatarURL = &avatar.String
	}
	return connection, nil
}

// SaveConnection replaces any previous grant for the user in one statement that
// also verifies the account is still allowed to connect.
func (s *PostgresStore) SaveConnection(ctx context.Context, userID string, sessionVersion int, connection Connection) error {
	result, err := s.db.ExecContext(ctx, `INSERT INTO youtube_channel_connections(id,user_id,channel_id,title,avatar_url,uploads_playlist_id,credentials) SELECT $1,u.id,$3,$4,$5,$6,$7 FROM users u WHERE u.id=$2 AND u.session_version=$8 AND u.account_status='active' AND u.access_role IN ('member','admin') AND NOT u.email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) ON CONFLICT (user_id) DO UPDATE SET id=EXCLUDED.id,channel_id=EXCLUDED.channel_id,title=EXCLUDED.title,avatar_url=EXCLUDED.avatar_url,uploads_playlist_id=EXCLUDED.uploads_playlist_id,credentials=EXCLUDED.credentials,updated_at=now()`,
		connection.ID, userID, connection.ChannelID, connection.Title, connection.AvatarURL, connection.UploadsPlaylistID, connection.Credentials, sessionVersion)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return ErrNotAllowed
	}
	return nil
}

func (s *PostgresStore) UpdateCredentials(ctx context.Context, userID, connectionID, credentials string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE youtube_channel_connections SET credentials=$3,updated_at=now() WHERE user_id=$1 AND id=$2`, userID, connectionID, credentials)
	return err
}

func (s *PostgresStore) DeleteConnection(ctx context.Context, userID, connectionID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM youtube_channel_connections WHERE user_id=$1 AND id=$2`, userID, connectionID)
	return err
}
