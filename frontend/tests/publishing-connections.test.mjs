import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  readFileSync(
    new URL(
      '../src/components/calendar/calendar-connections.tsx',
      import.meta.url
    ),
    'utf8'
  ),
  {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }
).outputText

function fixture() {
  const exports = {}
  const states = []
  const requests = []
  const toasts = []
  let cursor = 0
  let reloads = 0

  const jsx = (type, props) => ({ type, props })
  const require = (name) => {
    if (name === 'react/jsx-runtime') {
      return { jsx, jsxs: jsx, Fragment: 'Fragment' }
    }
    if (name === 'react') {
      return {
        useEffect() {
          // Effects are not needed for this isolated interaction test.
        },
        useState(initial) {
          const index = cursor++
          if (!(index in states)) states[index] = initial
          return [
            states[index],
            (value) => {
              states[index] =
                typeof value === 'function' ? value(states[index]) : value
            }
          ]
        }
      }
    }
    if (name === 'next-intl') {
      return {
        useLocale: () => 'en',
        useTranslations: () => (key) => key
      }
    }
    if (name === 'next/image') {
      return { __esModule: true, default: 'Image' }
    }
    if (name === '@/lib/auth') {
      return {
        apiFetch: async (path, init) => {
          requests.push({ path, init })
          return { ok: true, json: async () => ({ disconnected: true }) }
        }
      }
    }
    if (name === '@/lib/api-error') {
      return { extractApiError: (_data, fallback) => fallback }
    }
    if (name === '@/lib/publishing') {
      return { withAllPublishingProviders: (providers) => providers }
    }
    if (name.endsWith('/toast')) {
      return { useToast: () => ({ add: (...args) => toasts.push(args) }) }
    }
    return new Proxy({}, { get: (_target, key) => key })
  }

  vm.runInNewContext(source, {
    exports,
    require,
    URLSearchParams,
    window: {
      location: { hash: '', pathname: '/en/dashboard/publish', search: '' }
    }
  })

  const data = {
    providers: [
      {
        id: 'facebook',
        name: 'Facebook',
        configured: true,
        supportsPublishing: true
      }
    ],
    accounts: [
      {
        id: 'account-1',
        provider: 'facebook',
        name: 'Sneep Cut',
        username: 'sneepcut',
        status: 'connected'
      }
    ],
    clips: [],
    posts: []
  }

  function render() {
    cursor = 0
    return exports.CalendarConnections({
      data,
      error: null,
      busyProvider: null,
      onConnect: async () => undefined,
      onReload: () => {
        reloads++
      }
    })
  }

  function nodes(root, type) {
    if (!root || typeof root !== 'object') return []
    return [
      ...(root.type === type ? [root] : []),
      ...[root.props?.children]
        .flat(Number.POSITIVE_INFINITY)
        .flatMap((child) => nodes(child, type))
    ]
  }

  return {
    render,
    nodes,
    requests,
    toasts,
    reloads: () => reloads
  }
}

test('shows the connected identity and disconnects the selected account', async () => {
  const view = fixture()
  let tree = view.render()

  const text = view
    .nodes(tree, 'p')
    .flatMap((node) => [node.props.children].flat(Number.POSITIVE_INFINITY))
    .join('')
  assert.match(text, /Facebook/)
  assert.match(text, /@sneepcut/)

  const disconnectTrigger = view
    .nodes(tree, 'Button')
    .find((node) => node.props['aria-label'] === 'disconnectAccount')
  disconnectTrigger.props.onClick()

  tree = view.render()
  assert.equal(view.nodes(tree, 'Dialog')[0].props.open, true)
  const confirm = view
    .nodes(tree, 'Button')
    .find((node) => node.props.variant === 'destructive')
  confirm.props.onClick()

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(view.requests.length, 1)
  assert.equal(view.requests[0].path, '/api/publishing/accounts/account-1')
  assert.equal(view.requests[0].init.method, 'DELETE')
  assert.equal(view.reloads(), 1)
  assert.equal(view.toasts.length, 1)
  assert.equal(view.toasts[0][0], 'success')
  assert.equal(view.toasts[0][1], 'disconnected')
  assert.equal(view.nodes(view.render(), 'Dialog')[0].props.open, false)
})
