import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

/**
 * Transpiles one TypeScript or TSX source file and evaluates it in a sandbox.
 * `imports` maps each module specifier the file requires to an already-loaded value.
 * Stylesheets resolve to empty objects unless mapped explicitly. Paths are relative to the frontend root, e.g. `src/lib/x.ts`.
 */
const frontendRoot = new URL('../../', import.meta.url)

export function loadTsModule(relativePath, imports = {}) {
  const source = readFileSync(new URL(relativePath, frontendRoot), 'utf8')
  const exports = {}
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      if (name in imports) return imports[name]
      if (name.endsWith('.css')) return {}
      throw new Error(`Unexpected import ${name} from ${relativePath}`)
    }
  })
  return exports
}
