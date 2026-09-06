import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'

for (const page of ['login', 'register', 'forgot-password', 'reset-password']) {
  const file = new URL(`../src/app/[locale]/${page}/page.tsx`, import.meta.url)
  const source = readFileSync(file, 'utf8')
  const ast = ts.createSourceFile(page, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  const imports = new Set()
  function rename(node, name) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node
    edits.push([opening.tagName.getStart(ast), opening.tagName.end, name])
    if (ts.isJsxElement(node)) edits.push([node.closingElement.tagName.getStart(ast), node.closingElement.tagName.end, name])
    imports.add(name)
  }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tag = opening.tagName.getText(ast)
      if (tag === 'AuthPanel') return
      const cls = opening.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'className')
      if (cls?.initializer && ts.isStringLiteral(cls.initializer)) {
        const value = cls.initializer.text
        let next = value.replace(/text-white\/[^\s]+/g, 'text-muted-foreground').replace(/text-white\b/g, 'text-foreground').replace(/text-violet-\S+/g, 'text-primary').replace(/border-white(?:\/\S+)?/g, 'border-border').replace(/bg-\[#(?:060608|0b0a0e)\](?:\/90)?/g, 'bg-background').replace(/bg-white\/\S+/g, 'bg-muted').replace(/font-\[family-name:var\(--font-(?:cinematic|studio)\)\]/g, '').replace(/text-\[(?:9|10|11|12)px\]/g, 'text-sm')
        if (tag === 'main') next = 'flex min-h-dvh bg-background text-foreground'
        if (tag === 'Input') next = 'h-11 rounded-lg bg-background'
        if (tag === 'Label') next = 'text-sm font-medium text-foreground'
        if (tag === 'h1') next = 'text-3xl font-semibold leading-tight tracking-tight text-foreground'
        if (value.startsWith('pointer-events-none absolute right-[-20%]')) next = 'hidden'
        if (tag === 'div' && value.includes('max-w-[430px]')) {
          rename(node, 'Card')
          next = 'relative block w-full max-w-md gap-0 rounded-2xl border bg-card p-6 shadow-sm sm:p-9'
        }
        if (tag === 'button') {
          rename(node, 'Button')
          const primary = value.includes('bg-white ') && value.includes('text-black')
          next = primary ? 'h-11 w-full' : 'h-11 w-full border border-input bg-background text-foreground hover:bg-muted'
        }
        if (tag === 'Link' && value.includes('bg-white ') && value.includes('text-black')) next = 'mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90'
        if (next !== value) edits.push([cls.initializer.getStart(ast), cls.initializer.end, JSON.stringify(next)])
      }
      if (tag === 'BrandLogo') {
        const onDark = opening.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'onDark')
        if (onDark) edits.push([onDark.getStart(ast), onDark.end, 'className="rounded-lg bg-white px-2 py-1 dark:bg-transparent" variant="default"'])
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  let next = source
  for (const [start,end,value] of edits.sort((a,b) => b[0]-a[0])) next = next.slice(0,start)+value+next.slice(end)
  const added = [...imports].filter(name => !new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)).map(name => `import { ${name} } from '@/components/ui/${name.toLowerCase()}'`).join('\n')
  const at = next.startsWith("'use client'") ? next.indexOf('\n')+1 : 0
  next = next.slice(0,at)+'\n'+added+'\n'+next.slice(at)
  writeFileSync(file,next)
  console.log(page)
}
