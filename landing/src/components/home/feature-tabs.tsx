'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import styles from './features.module.css'

type FeatureTabsProps = {
  label: string
  tabs: string[]
  panels: ReactNode[]
  idPrefix: string
}

const pad = (value: number) => String(value).padStart(2, '0')

export function FeatureTabs({ label, tabs, panels, idPrefix }: FeatureTabsProps) {
  const [active, setActive] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function select(index: number, focus: boolean) {
    setActive(index)
    if (focus) tabRefs.current[index]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = tabs.length - 1
    const moves: Record<string, number> = {
      ArrowDown: active === last ? 0 : active + 1,
      ArrowRight: active === last ? 0 : active + 1,
      ArrowUp: active === 0 ? last : active - 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    select(moves[event.key], true)
  }

  return (
    <div className={styles.layout}>
      <div className={styles.tabsColumn}>
        <div role="tablist" aria-label={label} className={styles.tablist} onKeyDown={onKeyDown}>
          {tabs.map((tab, index) => (
            <button
              key={tab}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${index}`}
              aria-controls={`${idPrefix}-panel-${index}`}
              aria-selected={index === active}
              tabIndex={index === active ? 0 : -1}
              className={styles.tab}
              onClick={() => select(index, false)}
            >
              <span className={styles.tabNumber}>{pad(index + 1)}</span>
              <span className={styles.tabLabel}>{tab}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={styles.panelColumn}>
        {panels.map((panel, index) => (
          <div
            key={tabs[index]}
            role="tabpanel"
            id={`${idPrefix}-panel-${index}`}
            aria-labelledby={`${idPrefix}-tab-${index}`}
            hidden={index !== active}
          >
            {panel}
          </div>
        ))}
      </div>
    </div>
  )
}
