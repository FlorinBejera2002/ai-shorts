import ts from 'typescript'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Mechanical JSX migration; dry-run by default, --write applies only listed changes.
const root = new URL('../src/', import.meta.url)
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : entry.name.endsWith('.tsx') ? [join(directory, entry.name)] : [])
const files = [...walk(fileURLToPath(new URL('app/[locale]/', root))), ...walk(fileURLToPath(new URL('components/', root)))]
const mapping = { textarea: ['Textarea', 'textarea'], select: ['NativeSelect', 'native-select'], label: ['Label', 'label'] }
const reports = []
for (const file of files) {
  if (file.includes('components\\ui\\') || file.includes('components/ui/')) continue
  const source = readFileSync(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  const imports = new Map()
  function rename(node, name, module) {
    const tag = ts.isJsxElement(node) ? node.openingElement : node
    edits.push([tag.tagName.getStart(ast), tag.tagName.end, name])
    if (ts.isJsxElement(node)) edits.push([node.closingElement.tagName.getStart(ast), node.closingElement.tagName.end, name])
    if (!new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]@/components/ui/${module}['"]`, 's').test(source)) imports.set(name, module)
  }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tag = opening.tagName.getText(ast)
      const attributes = opening.attributes.properties
      const type = attributes.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'type')?.initializer?.text
      const classAttr = attributes.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'className')
      const cls = classAttr?.initializer && ts.isStringLiteral(classAttr.initializer) ? classAttr.initializer.text : null
      if (mapping[tag]) rename(node, ...mapping[tag])
      if (tag === 'input' && !['checkbox', 'radio', 'range', 'file', 'color', 'hidden'].includes(type)) rename(node, 'Input', 'input')
      const editorSurface = /editor[\\/](?:segment-list|segment-player|timeline|segment-inspector)\.tsx$/.test(file)
      const actionSurface = editorSurface || /(?:assistant-chat|checkout-button|portal-button|theme-toggle|language-switcher)\.tsx$/.test(file) || /dashboard[\\/]brand[\\/]page\.tsx$/.test(file) || /clips[\\/]\[id\][\\/]edit[\\/]page\.tsx$/.test(file)
      if (tag === 'button' && actionSurface && !(cls && /button-(primary|secondary|ghost)/.test(cls))) {
        rename(node, 'Button', 'button')
        edits.push([opening.tagName.end, opening.tagName.end, ' variant="ghost"'])
        if (cls) edits.push([classAttr.initializer.getStart(ast), classAttr.initializer.end, JSON.stringify('h-auto whitespace-normal ' + cls)])
      }
      const classText = classAttr?.initializer?.getText(ast)
      const panel = classText && /(?:"|`|\s)panel(?:-soft)?(?=\s|"|`)/.test(classText)
      if (tag === 'div' && editorSurface && cls?.includes('rounded-xl border border-border bg-card')) {
        rename(node, 'Card', 'card')
        edits.push([classAttr.initializer.getStart(ast), classAttr.initializer.end, JSON.stringify('block gap-0 py-0 ' + cls)])
      }
      if (['div', 'section', 'article', 'aside'].includes(tag) && panel) {
        rename(node, 'Card', 'card')
        if (tag !== 'div') edits.push([opening.tagName.end, opening.tagName.end, ` as="${tag}"`])
        const next = classText.replace(/(["`\s])panel(?:-soft)?(?=\s|"|`)/g, '$1block gap-0 py-0')
        edits.push([classAttr.initializer.getStart(ast), classAttr.initializer.end, next])
      }
      if (tag === 'button' && cls && /(^|\s)button-(primary|secondary|ghost)(?=\s|$)/.test(cls)) {
        rename(node, 'Button', 'button')
        const variant = cls.includes('button-primary') ? 'default' : cls.includes('button-secondary') ? 'outline' : 'ghost'
        edits.push([classAttr.getStart(ast), classAttr.end, `variant="${variant}" className=${JSON.stringify(cls.replace(/(^|\s)button-(primary|secondary|ghost)(?=\s|$)/g, ' ').trim())}`])
      }
      if (['Link', 'a'].includes(tag) && cls && /(^|\s)button-(primary|secondary|ghost)(?=\s|$)/.test(cls)) {
        const variant = cls.includes('button-primary') ? 'default' : cls.includes('button-secondary') ? 'outline' : 'ghost'
        const key = attributes.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'key')
        edits.push([node.getStart(ast), node.getStart(ast), `<Button asChild variant="${variant}" ${key ? key.getText(ast) : ''}>`])
        edits.push([node.end, node.end, '</Button>'])
        edits.push([classAttr.initializer.getStart(ast), classAttr.initializer.end, JSON.stringify(cls.replace(/(^|\s)button-(primary|secondary|ghost)(?=\s|$)/g, ' ').trim())])
        if (!/import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*['"]@\/components\/ui\/button['"]/s.test(source)) imports.set('Button', 'button')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!edits.length) continue
  let next = source
  for (const [start, end, value] of edits.sort((a,b) => b[0]-a[0])) next = next.slice(0,start)+value+next.slice(end)
  const newImports = [...imports].map(([name,module]) => `import { ${name} } from '@/components/ui/${module}'`).join('\n')+'\n'
  const client = /^(['"]use client['"];?\r?\n)/.exec(next)
  next = client ? next.slice(0,client[0].length)+'\n'+newImports+next.slice(client[0].length) : newImports+next
  if (process.argv.includes('--write')) writeFileSync(file, next)
  reports.push({ file: relative(fileURLToPath(new URL('../', import.meta.url)), file).replaceAll('\\','/'), source, next })
}
if (process.argv.includes('--json')) console.log(JSON.stringify(reports))
else console.log(reports.map(({file}) => file).join('\n'))
