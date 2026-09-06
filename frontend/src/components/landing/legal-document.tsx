import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <article className="mx-auto max-w-7xl px-6 pb-20 pt-36">
      <header className="mb-10">
        <Badge variant="outline" className="mb-5">
          {updated}
        </Badge>
        <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground">
          {intro}
        </p>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card as="aside" className="gap-0 py-3 shadow-none lg:sticky lg:top-24">
          <nav aria-label={title} className="grid gap-1 px-3">
            {sections.map((section, index) => (
              <Button
                key={section.title}
                asChild={true}
                variant="ghost"
                className="h-auto justify-start whitespace-normal px-3 py-2.5 text-left text-xs leading-5"
              >
                <a href={`#legal-section-${index + 1}`}>{section.title}</a>
              </Button>
            ))}
            <Button
              asChild={true}
              variant="ghost"
              className="justify-start text-xs"
            >
              <a href="#legal-contact-title">{contactTitle}</a>
            </Button>
          </nav>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="divide-y px-6 sm:px-9">
            {sections.map((section, index) => (
              <section
                key={section.title}
                aria-labelledby={`legal-section-${index + 1}`}
                className="py-7"
              >
                <h2
                  id={`legal-section-${index + 1}`}
                  className="mb-4 scroll-mt-28 text-xl font-semibold leading-snug"
                >
                  {section.title}
                </h2>
                <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets && (
                    <ul className="list-disc space-y-2 pl-5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ))}
            <section aria-labelledby="legal-contact-title" className="py-7">
              <h2
                id="legal-contact-title"
                className="mb-4 scroll-mt-28 text-xl font-semibold"
              >
                {contactTitle}
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                {contactEmail ? (
                  <>
                    {contactPrompt}{' '}
                    <a
                      href={`mailto:${contactEmail}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {contactEmail}
                    </a>
                  </>
                ) : (
                  contactFallback
                )}
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </article>
  )
}
