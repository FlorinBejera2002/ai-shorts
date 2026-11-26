#!/usr/bin/env node
// Local preview of the static export with the same routing as production:
// landing/nginx.conf (clean URLs, 404 pages) and deploy/Caddyfile (web-app
// routes go to the SPA). Usage:
//   node scripts/serve-static.mjs [--port 3100] [--app-origin http://127.0.0.1:5205]
import { createReadStream, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}

const root = resolve(fileURLToPath(new URL('../out', import.meta.url)))
const port = Number(option('port', process.env.PORT ?? '3100'))
const appOrigin = option('app-origin', process.env.APP_ORIGIN ?? '')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

// Mirrors the @web_app / @web_app_files matchers in deploy/Caddyfile.
const WEB_APP_PREFIXES = ['/dashboard', '/login', '/register', '/forgot-password', '/reset-password', '/activate', '/studio-session']
const LANDING_PREFIXES = ['/_next/', '/landing/']
const LANDING_FILES = new Set(['/robots.txt', '/sitemap.xml'])
// Locale prefixes of the localized pages (English has none); each has its own 404 page.
const LOCALE_PREFIX = /^\/(ro|es)(?=\/)/
const LOCALIZED_404_PATH = /^\/(ro|es)\/404$/

function isWebAppPath(pathname) {
  if (pathname.startsWith('/api/') || pathname.startsWith('/v1/') || pathname.startsWith('/media/')) return true
  if (LANDING_FILES.has(pathname) || pathname.endsWith('.html') || LANDING_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false
  const route = pathname.replace(LOCALE_PREFIX, '')
  if (WEB_APP_PREFIXES.some((prefix) => route.startsWith(prefix)) || pathname.startsWith('/assets/')) return true
  if (pathname.startsWith('/@') || pathname.startsWith('/src/') || pathname.startsWith('/node_modules/')) return true
  return /\.[A-Za-z0-9]+$/.test(pathname)
}

function fileAt(pathname) {
  const target = normalize(join(root, decodeURIComponent(pathname)))
  if (!target.startsWith(root)) return null
  try {
    return statSync(target).isFile() ? target : null
  } catch {
    return null
  }
}

function send(response, status, file, cacheControl) {
  response.writeHead(status, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cacheControl
  })
  createReadStream(file).pipe(response)
}

function proxy(request, response) {
  const target = new URL(request.url, appOrigin)
  const upstream = httpRequest(target, { method: request.method, headers: { ...request.headers, host: target.host } }, (reply) => {
    response.writeHead(reply.statusCode ?? 502, reply.headers)
    reply.pipe(response)
  })
  upstream.on('error', () => {
    response.writeHead(502, { 'Content-Type': 'text/plain' })
    response.end('Web app is not running')
  })
  request.pipe(upstream)
}

function serveLanding(pathname, response) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    response.writeHead(301, { Location: pathname.replace(/\/+$/, '') })
    return response.end()
  }
  if (pathname === '/index.html') {
    response.writeHead(301, { Location: '/' })
    return response.end()
  }
  if (pathname.endsWith('.html')) {
    response.writeHead(301, { Location: pathname.slice(0, -5) })
    return response.end()
  }
  if (pathname.startsWith('/_next/static/') || pathname.startsWith('/landing/')) {
    const asset = fileAt(pathname)
    if (asset) return send(response, 200, asset, pathname.startsWith('/_next/') ? 'public, max-age=31536000, immutable' : 'public, max-age=604800')
  } else if (!LOCALIZED_404_PATH.test(pathname)) {
    const page = fileAt(pathname) ?? fileAt(`${pathname === '/' ? '/index' : pathname}.html`) ?? fileAt(`${pathname}/index.html`)
    if (page) return send(response, 200, page, 'no-cache')
  }
  const localized = pathname.match(/^\/(ro|es)(?=\/|$)/)
  return send(response, 404, join(root, localized ? `${localized[1]}/404.html` : '404.html'), 'no-cache')
}

// Dev servers (Vite HMR) need their websocket proxied too.
function proxyUpgrade(request, socket, head) {
  if (!appOrigin) return socket.destroy()
  const target = new URL(appOrigin)
  const upstream = connect(Number(target.port || 80), target.hostname, () => {
    const lines = [`${request.method} ${request.url} HTTP/1.1`]
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index]
      lines.push(`${name}: ${name.toLowerCase() === 'host' ? target.host : request.rawHeaders[index + 1]}`)
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
}

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  if (appOrigin && isWebAppPath(pathname)) return proxy(request, response)
  return serveLanding(pathname, response)
})
server.on('upgrade', proxyUpgrade)
server.listen(port, '127.0.0.1', () => {
  console.log(`Static site on http://127.0.0.1:${port}${appOrigin ? ` (web app: ${appOrigin})` : ''}`)
})
