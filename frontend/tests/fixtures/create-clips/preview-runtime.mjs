// Injected only by creation-preview.mjs. The production app never imports this.
export function previewRuntime() {
  if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'dark')
  const nativeFetch = window.fetch.bind(window)
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
  function localURL(value) {
    const url = new URL(value, location.href)
    if (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') {
      return '/__creation-fixtures/oembed' + url.search
    }
    if (url.hostname === 'img.youtube.com' || url.hostname === 'i.ytimg.com') {
      return '/__creation-fixtures/studio-source.png'
    }
    if (loopback.has(url.hostname) && /^\/(api|v1)(\/|$)/.test(url.pathname)) {
      return location.origin + url.pathname + url.search
    }
    if (url.origin === location.origin || ['blob:', 'data:'].includes(url.protocol)) return url.href
    throw new TypeError('External traffic is blocked by the synthetic Create clips preview')
  }
  window.fetch = (input, init) => {
    const original = input instanceof Request ? input.url : String(input)
    const url = localURL(original)
    return nativeFetch(input instanceof Request ? new Request(url, input) : url, init)
  }
  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    return open.call(this, method, localURL(String(url)), ...rest)
  }
  const setAttribute = HTMLImageElement.prototype.setAttribute
  HTMLImageElement.prototype.setAttribute = function (name, value) {
    return setAttribute.call(this, name, name.toLowerCase() === 'src' ? localURL(String(value)) : value)
  }
  const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...source, set(value) { source.set.call(this, localURL(String(value))) }
  })
  const demoVideo = new URLSearchParams(location.search).get('demoVideo')
  if (demoVideo && /^[\w-]{11}$/.test(demoVideo)) {
    const observer = new MutationObserver(() => {
      const input = document.querySelector('#youtube-url')
      if (!input) return
      observer.disconnect()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, `https://youtu.be/${demoVideo}`)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 15000)
  }
  window.__creationPreview = Object.freeze({ synthetic: true, controls: '/__creation-preview' })
}
