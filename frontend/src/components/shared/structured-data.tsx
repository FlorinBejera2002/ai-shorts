import { useEffect } from 'react'

type StructuredDataProps = {
  value: Record<string, unknown>
}

export function StructuredData({ value }: StructuredDataProps) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c')

  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = json
    document.head.append(script)
    return () => script.remove()
  }, [json])
  return null
}
