import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Mirrors migrations.All(): lexical SQL file order plus a strict linear chain.
// This only writes a disposable schema fixture; it never connects to a database.
export async function buildSchema(root) {
  const directory = path.join(root, 'backend', 'migrations')
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  if (!names.length) throw new Error('Migration history is empty')
  let previous = 'base'
  const revisions = new Set()
  const statements = []
  for (const name of names) {
    const source = await readFile(path.join(directory, name), 'utf8')
    const match = /^-- revision: ([^\r\n]+)\r?\n-- parent: ([^\r\n]+)\r?\n([\s\S]+)$/.exec(source)
    if (!match || match[2].trim() !== previous || revisions.has(match[1].trim()) || !match[3].trim()) throw new Error(`Invalid migration chain at ${name}`)
    previous = match[1].trim()
    revisions.add(previous)
    statements.push(`-- ${name}\n${match[3]}`)
  }
  const target = path.join(root, '.cache', 'tmp', 'stripe-billing', 'schema.sql')
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, statements.join('\n'), 'utf8')
  return { path: target, revision: previous, migrations: names.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildSchema(fileURLToPath(new URL('../', import.meta.url)))
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
