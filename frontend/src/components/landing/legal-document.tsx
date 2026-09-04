import type { LegalSection } from '@/lib/legal-content'

type LegalDocumentProps = {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
  contactTitle: string
  contactPrompt: string
  contactFallback: string
  contactEmail: string | null
}

export function LegalDocument({
  title,
  updated,
  intro,
  sections,
  contactTitle,
  contactPrompt,
  contactFallback,
  contactEmail
}: LegalDocumentProps) {
  return (
    <article className="mx-auto max-w-3xl animate-fade-in px-6 pb-20 pt-36 motion-reduce:animate-none">
      <h1 className="font-[family-name:var(--font-cinematic)] text-5xl font-medium tracking-[-0.045em] sm:text-6xl">
        {title}
      </h1>
      <p className="mt-3 font-[family-name:var(--font-studio)] text-xs text-white/45">
        {updated}
      </p>

      <div className="mt-10 space-y-6 font-[family-name:var(--font-studio)] text-[13px] leading-7 text-white/62 [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-white/90">
        <p>{intro}</p>
        {sections.map((section, index) => (
          <section
            key={section.title}
            aria-labelledby={`legal-section-${index + 1}`}
          >
            <h2 id={`legal-section-${index + 1}`}>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul className="list-disc space-y-1 pl-5">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section aria-labelledby="legal-contact-title">
          <h2 id="legal-contact-title">{contactTitle}</h2>
          {contactEmail ? (
            <p>
              {contactPrompt}{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="text-[#9e91ff] underline-offset-4 hover:underline"
              >
                {contactEmail}
              </a>
            </p>
          ) : (
            <p>{contactFallback}</p>
          )}
        </section>
      </div>
    </article>
  )
}
