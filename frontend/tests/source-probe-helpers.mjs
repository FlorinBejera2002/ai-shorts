import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { stat, utimes } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** Puts a probed source file's timestamps back exactly, so Vite sees no further change. */
export async function restoreSourceTimes(path, metadata) {
  if (process.platform === 'win32') {
    const epochTicks = 621355968000000000n
    const accessTicks = epochTicks + metadata.atimeNs / 100n
    const writeTicks = epochTicks + metadata.mtimeNs / 100n
    const literal = fileURLToPath(path).replaceAll("'", "''")
    let restored
    for (let attempt = 0; attempt < 5; attempt++) {
      // Restoring mtime can trigger another Vite read. Retry only atime once
      // mtime matches, so verification never creates a new write-watch event.
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$probePath = '${literal}'; if ([IO.File]::GetLastWriteTimeUtc($probePath).Ticks -ne ${writeTicks}L) { [IO.File]::SetLastWriteTimeUtc($probePath, [DateTime]::new(${writeTicks}L, [DateTimeKind]::Utc)) }; [IO.File]::SetLastAccessTimeUtc($probePath, [DateTime]::new(${accessTicks}L, [DateTimeKind]::Utc))`
        ],
        { encoding: 'utf8', windowsHide: true }
      )
      assert.equal(result.status, 0, result.stderr)
      restored = await stat(path, { bigint: true })
      if (
        restored.mtimeNs === metadata.mtimeNs &&
        restored.atimeNs === metadata.atimeNs
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assert.equal(
      restored.mtimeNs,
      metadata.mtimeNs,
      'Source write timestamp restored exactly'
    )
    assert.equal(
      restored.atimeNs,
      metadata.atimeNs,
      'Source access timestamp restored exactly'
    )
  } else
    await utimes(
      path,
      Number(metadata.atimeNs) / 1e9,
      Number(metadata.mtimeNs) / 1e9
    )
}
