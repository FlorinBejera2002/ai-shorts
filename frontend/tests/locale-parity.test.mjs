import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const ts = require(path.join(frontendRoot, 'node_modules', 'typescript'))

const LOCALES = ['en', 'ro', 'es']

function flatten(value, prefix = '', out = new Map()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  } else {
    out.set(prefix, value)
  }
  return out
}

/** ICU argument names, including those nested in plural/select branches, but not branch text. */
function placeholderNames(message) {
  const text = String(message)
  const names = new Set()
  let index = 0

  const skipSpace = () => {
    while (/\s/.test(text[index] ?? '')) index += 1
  }
  const readWord = () => {
    const start = index
    while (index < text.length && !/[\s,{}]/.test(text[index])) index += 1
    return text.slice(start, index)
  }
  // Reads message text until the closing brace of the current branch (or the end).
  const readMessage = () => {
    while (index < text.length && text[index] !== '}') {
      if (text[index] === "'" && text[index + 1] === "'") index += 2
      else if (text[index] === '{') readArgument()
      else index += 1
    }
  }
  const readArgument = () => {
    index += 1
    skipSpace()
    names.add(readWord())
    skipSpace()
    if (text[index] === ',') {
      index += 1
      skipSpace()
      const type = readWord()
      skipSpace()
      if (['plural', 'select', 'selectordinal'].includes(type) && text[index] === ',') {
        index += 1
        while (index < text.length) {
          skipSpace()
          if (text[index] === '}') break
          readWord()
          skipSpace()
          if (text[index] !== '{') break
          index += 1
          readMessage()
          index += 1
        }
      } else {
        while (index < text.length && text[index] !== '}') index += 1
      }
    }
    if (text[index] === '}') index += 1
  }

  while (index < text.length) {
    readMessage()
    index += 1
  }
  return [...names].filter(Boolean).sort()
}

function loadMessages(locale) {
  const file = path.join(frontendRoot, 'messages', `${locale}.json`)
  return flatten(JSON.parse(fs.readFileSync(file, 'utf8')))
}

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** Finds `text(english, romanian, spanish?)` calls that cannot render Spanish. */
function findUntranslatedTextCalls(inlineEs) {
  const srcRoot = path.join(frontendRoot, 'src')
  const violations = []

  for (const file of listSourceFiles(srcRoot)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )

    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'text' &&
        node.arguments.length >= 2
      ) {
        const [english, romanian, spanish] = node.arguments
        const isLiteral = (arg) => ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)
        const relativePath = path.relative(frontendRoot, file).split(path.sep).join('/')
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
        const location = relativePath + ':' + line

        if (!isLiteral(english) || !isLiteral(romanian)) {
          if (!spanish) violations.push(`${location} text() with non-literal copy needs a Spanish third argument`)
        } else if (!spanish && !Object.hasOwn(inlineEs, english.text)) {
          violations.push(`${location} "${english.text}" is missing from inline-es.json and has no Spanish third argument`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  return violations
}

test('en, ro and es messages share keys and placeholder names', () => {
  const [en, ...others] = LOCALES.map(loadMessages)
  const enKeys = [...en.keys()].sort()

  LOCALES.slice(1).forEach((locale, index) => {
    const messages = others[index]
    assert.deepEqual([...messages.keys()].sort(), enKeys, `${locale}.json keys differ from en.json`)
    for (const key of enKeys) {
      assert.deepEqual(
        placeholderNames(messages.get(key)),
        placeholderNames(en.get(key)),
        `${locale}.json placeholders differ for "${key}"`
      )
    }
  })
})

test('every inline bilingual text() call has a Spanish translation', () => {
  const inlineEs = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'src', 'i18n', 'inline-es.json'), 'utf8'))
  const violations = findUntranslatedTextCalls(inlineEs)
  assert.deepEqual(violations, [], `Missing Spanish copy:\n${violations.slice(0, 50).join('\n')}`)
})
