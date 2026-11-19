import type { Faq } from '@/content/copy/types'
import { Icon } from '@/components/ui/icons'
import styles from './faq.module.css'

type FaqSectionProps = { title: string; faqs: Faq[]; group: string }

/** Native disclosure widgets: answers stay in the HTML for crawlers and work without JavaScript. */
export function FaqSection({ title, faqs, group }: FaqSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={`${group}-title`}>
      <div className="container">
        <h2 id={`${group}-title`} className={`heading ${styles.title}`}>
          {title}
        </h2>
        <div className={`card ${styles.list}`}>
          {faqs.map((faq, index) => (
            <details key={faq.question} name={group} open={index === 0} className={styles.item}>
              <summary className={styles.question}>
                {faq.question}
                <span aria-hidden="true" className={styles.toggle}>
                  <Icon name="plus" className={styles.plus} />
                  <Icon name="minus" className={styles.minus} />
                </span>
              </summary>
              <p className={`muted ${styles.answer}`}>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
