import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function ensureStudioSecret(contents) {
  const assignment = /^STUDIO_AGENT_SECRET\s*=([^\r\n]*)/m
  const current = contents.match(assignment)
  const value = current?.[1].trim().replace(/^(['"])(.*)\1$/, '$2')
  if (value) {
    if (value.length < 32) {
      throw new Error('STUDIO_AGENT_SECRET must contain at least 32 characters. The existing value was not changed.')
    }
    return contents
  }
  const line = `STUDIO_AGENT_SECRET=${randomBytes(32).toString('hex')}`
  if (current) return contents.replace(assignment, line)
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  return `${contents}${contents.endsWith('\n') ? '' : newline}${line}${newline}`
}

export async function ensureEnvironment(root) {
  const filename = path.join(root, '.env')
  let created = false
  try {
    await copyFile(path.join(root, '.env.example'), filename, constants.COPYFILE_EXCL)
    created = true
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  const previous = await readFile(filename, 'utf8')
  const next = ensureStudioSecret(previous)
  if (previous !== next) await writeFile(filename, next, { mode: 0o600 })
  return { created, generatedStudioSecret: previous !== next }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  try {
    const result = await ensureEnvironment(root)
    console.log(result.created ? 'Created .env from .env.example.' : '.env already exists.')
    if (result.generatedStudioSecret) console.log('Generated the local Studio service credential; existing application settings were preserved.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
