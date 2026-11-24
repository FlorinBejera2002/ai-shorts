'use client'

import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref
} from 'react'
import { footageNumbers } from './story-footage'
import { readBriefDOM, renderBriefDOM } from './story-brief-dom'
import { FOOTAGE_ATTRIBUTE } from './story-brief-tokens'
import type { StoryAsset } from './types'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

export interface StoryBriefEditorHandle {
  /** Inserts a footage tag at the remembered caret, or at the end of the text. */
  insertFootage(assetID: string): void
}

interface Props {
  brief: string
  /** Footage in timeline order. Tags are numbered by their position in this list. */
  footage: StoryAsset[]
  disabled: boolean
  label: string
  placeholder: string
  onChange: (brief: string) => void
  /** Called after the user types @ (the @ is removed from the text). */
  onMention: () => void
  onOpenFootage: (assetID: string) => void
  ref?: Ref<StoryBriefEditorHandle>
}

/**
 * Rich description input. Footage tags are non-editable chips inside the text, so the brief keeps
 * its @[asset:<id>] form while the user sees "Filmarea N". The DOM is owned by this component and
 * is only rewritten when the brief or the footage changes from outside.
 */
export function StoryBriefEditor({
  brief,
  footage,
  disabled,
  label,
  placeholder,
  onChange,
  onMention,
  onOpenFootage,
  ref
}: Props) {
  const text = useStoryLanguage()
  const root = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const numbers = footageNumbers(footage)
  const footageKey = footage.map((asset) => `${asset.id}:${asset.thumbnail_url ?? ''}`).join('|')

  function createTag(assetID: string): HTMLElement | null {
    const asset = footage.find((item) => item.id === assetID)
    const number = numbers.get(assetID)
    if (!asset || !number) return null
    const tag = document.createElement('span')
    tag.className = styles.tag
    tag.setAttribute(FOOTAGE_ATTRIBUTE, asset.id)
    tag.setAttribute('data-footage-tag', '')
    tag.setAttribute('contenteditable', 'false')
    tag.setAttribute('role', 'button')
    tag.setAttribute('aria-label', `${text('Preview footage', 'Previzualizează filmarea')} ${number}`)
    tag.tabIndex = 0
    if (asset.thumbnail_url) {
      const thumb = document.createElement('img')
      thumb.src = asset.thumbnail_url
      thumb.alt = ''
      thumb.className = styles.tagThumb
      tag.append(thumb)
    }
    tag.append(document.createTextNode(`${text('Footage', 'Filmarea')} ${number}`))
    return tag
  }

  // Rewrite the DOM only for an outside change; typing already matches the brief.
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const stale = readBriefDOM(element) !== brief || element.dataset.footageKey !== footageKey
    if (!stale) return
    renderBriefDOM(element, brief, createTag)
    element.dataset.footageKey = footageKey
    const cleaned = readBriefDOM(element)
    if (cleaned !== brief) onChange(cleaned)
  })

  useImperativeHandle(
    ref,
    () => ({
      insertFootage(assetID: string) {
        const element = root.current
        const tag = element && createTag(assetID)
        if (!element || !tag) return
        const range =
          savedRange.current && element.contains(savedRange.current.startContainer)
            ? savedRange.current
            : endOf(element)
        range.deleteContents()
        const trailingSpace = document.createTextNode(' ')
        range.insertNode(trailingSpace)
        trailingSpace.before(tag)
        const caret = document.createRange()
        caret.setStartAfter(trailingSpace)
        caret.collapse(true)
        element.focus()
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(caret)
        savedRange.current = null
        onChange(readBriefDOM(element))
      }
    })
  )

  function rememberCaret() {
    const element = root.current
    const selection = window.getSelection()
    if (!element || !selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    if (element.contains(range.startContainer)) savedRange.current = range.cloneRange()
  }

  function handleInput(event: FormEvent<HTMLDivElement>) {
    const element = root.current
    if (!element) return
    const typed = (event.nativeEvent as InputEvent).data
    if (typed === '@' && removeTypedAt()) onMention()
    onChange(readBriefDOM(element))
  }

  /** Removes the @ the user just typed and remembers where the tag belongs. */
  function removeTypedAt() {
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const node = range?.startContainer
    if (!range || !node || node.nodeType !== Node.TEXT_NODE || range.startOffset < 1) return false
    const textNode = node as Text
    if (textNode.data[range.startOffset - 1] !== '@') return false
    const caretOffset = range.startOffset - 1
    textNode.deleteData(caretOffset, 1)
    const caret = document.createRange()
    caret.setStart(textNode, caretOffset)
    caret.collapse(true)
    savedRange.current = caret
    return true
  }

  function openTagFrom(target: EventTarget | null) {
    const tag = target instanceof Element ? target.closest('[data-footage-tag]') : null
    const assetID = tag?.getAttribute(FOOTAGE_ATTRIBUTE)
    if (assetID) onOpenFootage(assetID)
    return Boolean(assetID)
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    openTagFrom(event.target)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['Enter', ' '].includes(event.key)) return
    if (openTagFrom(event.target)) event.preventDefault()
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const element = root.current
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
    if (element) onChange(readBriefDOM(element))
  }

  return (
    <div className={styles.editorWrap}>
      <div
        ref={root}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        className={styles.editor}
        onInput={handleInput}
        onBlur={rememberCaret}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
      {!brief && (
        <span aria-hidden="true" className={styles.editorPlaceholder}>
          {placeholder}
        </span>
      )}
    </div>
  )
}

function endOf(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  return range
}
