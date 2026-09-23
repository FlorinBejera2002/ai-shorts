package agentaction

import("crypto/sha256";"encoding/hex")

// SnapshotDigest hashes the database's canonical JSON representation. Callers
// use the literal absent marker when a lazily created settings row is missing.
func SnapshotDigest(raw []byte) string {sum:=sha256.Sum256(raw);return hex.EncodeToString(sum[:])}
