type StructuredDataProps = {
  value: Record<string, unknown>
}

export function StructuredData({ value }: StructuredDataProps) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c')

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
