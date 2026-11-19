import type { LegalDocumentCopy, LegalSection } from '@/content/legal/legal-content'
import { Icon } from '@/components/ui/icons'
import { fill } from '@/content/copy'
import { LegalToc } from './legal-toc'
import styles from './legal.module.css'

const sectionId = (index: number) => `legal-section-${index + 1}`
const CONTACT_ID = 'legal-contact'

function SectionBody({ section }: { section: LegalSection }) {
  return (
    <>
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className={styles.paragraph}>
          {paragraph}
        </p>
      ))}
      {section.bullets && (
        <ul className={styles.bullets}>
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      {section.links && (
        <ul className={styles.links}>
          {section.links.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={styles.linkChip} target="_blank" rel="noopener noreferrer">
                {link.label}
                <Icon name="external" size={13} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

type LegalDocumentProps = {
  document: LegalDocumentCopy
  contactEmail: string
  labels: { contents: string; contentsToggle: string }
}

export function LegalDocument({ document, contactEmail, labels }: LegalDocumentProps) {
  const entries = [
    ...document.sections.map((section, index) => ({ id: sectionId(index), title: section.title })),
    { id: CONTACT_ID, title: document.contactTitle }
  ]

  return (
    <section className={styles.page}>
      <div className="container">
        <header className={styles.header}>
          <span className={styles.updated}>{document.updated}</span>
          <h1 className={`heading ${styles.title}`}>{document.title}</h1>
          <p className={`muted ${styles.intro}`}>{document.intro}</p>
        </header>
        <div className={styles.layout}>
          <LegalToc title={labels.contents} toggleLabel={fill(labels.contentsToggle, { count: entries.length })} entries={entries} />
          <article className={`card ${styles.article}`}>
            {document.sections.map((section, index) => (
              <section key={section.title} className={styles.section} aria-labelledby={sectionId(index)}>
                <h2 id={sectionId(index)} className={`heading ${styles.sectionTitle}`}>
                  {section.title}
                </h2>
                <SectionBody section={section} />
              </section>
            ))}
            <section className={styles.section} aria-labelledby={CONTACT_ID}>
              <h2 id={CONTACT_ID} className={`heading ${styles.sectionTitle}`}>
                {document.contactTitle}
              </h2>
              <p className={styles.paragraph}>
                {document.contactPrompt}{' '}
                <a href={`mailto:${contactEmail}`} className={styles.inlineLink}>
                  {contactEmail}
                </a>
                .
              </p>
            </section>
          </article>
        </div>
      </div>
    </section>
  )
}
