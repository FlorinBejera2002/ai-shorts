type JsonLdProps = { data: Record<string, unknown> | Record<string, unknown>[] }

/** Structured data rendered into the static HTML; "<" is escaped so content cannot close the script tag. */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\u003c') }}
    />
  )
}
