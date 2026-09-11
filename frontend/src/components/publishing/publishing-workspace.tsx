'use client'

import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Link } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import type {
  CreatorOptions,
  PublishingData,
  PublishingProvider
} from '@/lib/publishing'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CircleCheck,
  ExternalLink,
  Film,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PlatformBrandIcon } from './platform-brand-icon'
import styles from './publishing.module.css'

const field =
  'w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  const data = response.status === 204 ? {} : await response.json()
  if (!response.ok) throw new Error(extractApiError(data, 'Request failed'))
  return data as T
}

export function PublishingWorkspace() {
  const t = useTranslations('publishing')
  const locale = useLocale()
  const [data, setData] = useState<PublishingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [optionsError, setOptionsError] = useState(false)
  const [optionsRequest, setOptionsRequest] = useState(0)
  const [clipId, setClipId] = useState('')
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [options, setOptions] = useState<Record<string, CreatorOptions>>({})
  const [privacy, setPrivacy] = useState('')
  const [comments, setComments] = useState(false)
  const [duet, setDuet] = useState(false)
  const [stitch, setStitch] = useState(false)
  const [commercial, setCommercial] = useState(false)
  const [ownBrand, setOwnBrand] = useState(false)
  const [paidBrand, setPaidBrand] = useState(false)
  const [consent, setConsent] = useState(false)
  const [review, setReview] = useState(false)
  const [notice, setNotice] = useState('')
  const submission = useRef<{ payload: string; key: string } | null>(null)
  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      setData(await request<PublishingData>('/api/publishing'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setRefreshing(false)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.has('connected')) setNotice(t('connected'))
    if (query.has('connectionError')) setError(t('connectionError'))
    if (query.has('connected') || query.has('connectionError')) {
      query.delete('connected')
      query.delete('connectionError')
      const search = query.toString()
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
      )
    }
  }, [t])
  useEffect(() => {
    if (
      !data?.posts.some((post) =>
        [
          'queued',
          'processing',
          'submitting',
          'finalizing',
          'unknown'
        ].includes(post.status)
      )
    )
      return
    const timer = setInterval(() => {
      void reload()
    }, 10000)
    return () => clearInterval(timer)
  }, [data?.posts, reload])
  const selectedAccountIds = new Set(accountIds)
  const accounts =
    data?.accounts.filter(
      (account) =>
        account.status === 'connected' && selectedAccountIds.has(account.id)
    ) ?? []
  const tiktokAccounts = accounts.filter(
    (account) => account.provider === 'tiktok'
  )
  const tiktokIds = tiktokAccounts.map((account) => account.id).join(',')
  useEffect(() => {
    void optionsRequest
    const controller = new AbortController()
    setPrivacy('')
    setConsent(false)
    setComments(false)
    setDuet(false)
    setStitch(false)
    setOptions({})
    setOptionsError(false)
    if (tiktokIds) {
      void Promise.all(
        tiktokIds
          .split(',')
          .map(
            async (id) =>
              [
                id,
                await request<CreatorOptions>(
                  `/api/publishing/accounts/${id}/options`,
                  { signal: controller.signal }
                )
              ] as const
          )
      )
        .then((values) => {
          if (!controller.signal.aborted) setOptions(Object.fromEntries(values))
        })
        .catch(() => {
          if (!controller.signal.aborted) setOptionsError(true)
        })
    }
    return () => controller.abort()
  }, [tiktokIds, optionsRequest])
  useEffect(() => {
    if (!data) return
    const connectedIds = new Set<string>()
    for (const account of data.accounts) {
      if (account.status === 'connected') connectedIds.add(account.id)
    }
    setAccountIds((ids) => {
      const validIds = ids.filter((id) => connectedIds.has(id))
      return validIds.length === ids.length ? ids : validIds
    })
  }, [data])
  const clip = data?.clips.find((item) => item.id === clipId)
  const creatorOptions = tiktokAccounts
    .map((account) => options[account.id])
    .filter((option): option is CreatorOptions => Boolean(option))
  const readyOptions = creatorOptions.length === tiktokAccounts.length
  const privacyLevels =
    creatorOptions[0]?.privacyLevels.filter((level) =>
      creatorOptions.every((option) => option?.privacyLevels.includes(level))
    ) ?? []
  const tooLong = creatorOptions.some(
    (option) => option && clip && clip.duration > option.maxDuration
  )
  const connectedCount =
    data?.accounts.filter((account) => account.status === 'connected').length ??
    0
  const activePosts =
    data?.posts.filter((post) =>
      ['queued', 'processing', 'submitting', 'finalizing', 'unknown'].includes(
        post.status
      )
    ).length ?? 0
  const platformSettingsReady = Boolean(
    clip &&
      accounts.length > 0 &&
      (!tiktokAccounts.length ||
        (readyOptions &&
          privacy &&
          consent &&
          clip.tiktokEligible === true &&
          (!commercial || ownBrand || paidBrand) &&
          !tooLong &&
          !(paidBrand && privacy === 'SELF_ONLY')))
  )
  const canReview = Boolean(
    clip &&
      accounts.length &&
      (!tiktokAccounts.length ||
        (readyOptions &&
          privacy &&
          consent &&
          clip.tiktokEligible === true &&
          (!commercial || ownBrand || paidBrand) &&
          !tooLong &&
          !(paidBrand && privacy === 'SELF_ONLY')))
  )
  async function connect(provider: PublishingProvider) {
    setBusy(true)
    setError(null)
    try {
      const result = await request<{ url: string }>(
        `/api/publishing/connect/${provider}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale })
        }
      )
      window.location.assign(result.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectionError'))
      setBusy(false)
    }
  }
  async function disconnect(id: string) {
    if (!window.confirm(t('disconnectConfirm'))) return
    setBusy(true)
    setError(null)
    try {
      await request(`/api/publishing/accounts/${id}`, { method: 'DELETE' })
      setAccountIds((ids) => ids.filter((value) => value !== id))
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectionError'))
    } finally {
      setBusy(false)
    }
  }
  async function publish() {
    if (!canReview || busy) return
    setBusy(true)
    setError(null)
    const payload = JSON.stringify({
      clipId,
      accountIds,
      caption,
      confirmed: true,
      ...(tiktokAccounts.length
        ? {
            tiktok: {
              privacyLevel: privacy,
              disableComment:
                !comments || creatorOptions.some((o) => o.commentDisabled),
              disableDuet: !duet || creatorOptions.some((o) => o.duetDisabled),
              disableStitch:
                !stitch || creatorOptions.some((o) => o.stitchDisabled),
              brandContentToggle: paidBrand,
              brandOrganicToggle: ownBrand,
              musicUsageConfirmed: consent
            }
          }
        : {})
    })
    if (submission.current?.payload !== payload)
      submission.current = { payload, key: crypto.randomUUID() }
    try {
      await request('/api/publishing/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...JSON.parse(payload),
          idempotencyKey: submission.current.key
        })
      })
      setReview(false)
      setNotice(t('submitted'))
      setAccountIds([])
      setConsent(false)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('submitError'))
    } finally {
      setBusy(false)
    }
  }
  function resetComposer() {
    setClipId('')
    setAccountIds([])
    setCaption('')
    setPrivacy('')
    setComments(false)
    setDuet(false)
    setStitch(false)
    setCommercial(false)
    setOwnBrand(false)
    setPaidBrand(false)
    setConsent(false)
    setReview(false)
    setNotice('')
    submission.current = null
  }
  if (!data)
    return (
      <ApiState
        error={error}
        retry={() => {
          setError(null)
          void reload()
        }}
      />
    )
  return (
    <div className={`${styles.workspace} dashboard-workspace`}>
      <PageHeader title={t('title')} description={t('description')} />
      <section className={styles.commandBar} aria-label={t('workspaceStatus')}>
        <div className={styles.liveState}>
          <span className={styles.liveDot} aria-hidden="true" />
          <div>
            <p>{t('workspaceStatus')}</p>
            <span>{t('workspaceStatusHint')}</span>
          </div>
        </div>
        <dl className={styles.metrics}>
          <div>
            <dt>{t('connectedMetric')}</dt>
            <dd>{connectedCount}</dd>
          </div>
          <div>
            <dt>{t('clipsMetric')}</dt>
            <dd>{data.clips.length}</dd>
          </div>
          <div>
            <dt>{t('activeMetric')}</dt>
            <dd>{activePosts}</dd>
          </div>
        </dl>
        <Link href="/dashboard/calendar" className={styles.calendarLink}>
          <CalendarClock className="size-4" aria-hidden="true" />
          {t('scheduleInCalendar')}
        </Link>
      </section>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          {error}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2"
            onClick={() => {
              setError(null)
              void reload()
            }}
          >
            {t('refresh')}
          </Button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm"
        >
          <Check className="size-4 shrink-0" />
          {notice}
        </p>
      )}
      <div className={styles.distributionLayout}>
        <section
          aria-labelledby="accounts-title"
          className={styles.accountsRail}
        >
          <div>
            <h2 id="accounts-title" className="text-lg font-semibold">
              {t('accounts')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('accountsHint')}
            </p>
          </div>
          <div className={styles.channels}>
            {data.providers.map((provider) => {
              const connected = data.accounts.filter(
                (account) => account.provider === provider.id
              )
              return (
                <div key={provider.id} className={styles.channel}>
                  <div className="flex items-center gap-3">
                    <PlatformBrandIcon
                      provider={provider.id}
                      className={styles.providerIcon}
                    />
                    <div className="min-w-0">
                      <h3 className="font-semibold">{provider.name}</h3>
                      <span className={styles.connectionCount}>
                        {connected.length
                          ? t('accountsConnected', { count: connected.length })
                          : t('notConnected')}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {t(`requirements.${provider.id}`)}
                  </p>
                  <div className={styles.accountStack}>
                    {connected.map((account) => (
                      <div key={account.id} className={styles.connectedAccount}>
                        <div className={styles.accountIdentity}>
                          <PlatformBrandIcon
                            provider={account.provider}
                            className={styles.accountIcon}
                          />
                          <span
                            className={styles.connectedDot}
                            aria-label={t('connectedStatus')}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            {account.name}
                          </p>
                          {account.username && (
                            <p className="break-words text-xs text-muted-foreground">
                              @{account.username}
                            </p>
                          )}
                          {account.status !== 'connected' && (
                            <p className="text-xs text-destructive">
                              {t('reconnect')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void disconnect(account.id)}
                          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4"
                        >
                          {t('disconnect')}
                        </button>
                      </div>
                    ))}
                  </div>
                  {provider.configured ? (
                    <Button
                      variant="outline"
                      className={styles.connectButton}
                      disabled={busy}
                      onClick={() => void connect(provider.id)}
                    >
                      {connected.length ? (
                        <Plus className="size-3.5" aria-hidden="true" />
                      ) : null}
                      {connected.length ? t('connectAnother') : t('connect')}
                      <ExternalLink className="size-3.5" />
                    </Button>
                  ) : (
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-sm font-medium">{t('unavailable')}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t('setupRequired')}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
        <div className={styles.publishingDesk}>
          <section aria-labelledby="compose-title" className={styles.composer}>
            <div className={styles.panelHeading}>
              <span className={styles.step} aria-hidden="true">
                01
              </span>
              <h2 id="compose-title" className="text-lg font-semibold">
                {t('compose')}
              </h2>
              <Send
                className="ml-auto size-4 text-muted-foreground"
                aria-hidden="true"
              />
              {(clipId || accountIds.length > 0 || caption) && !review && (
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={resetComposer}
                  disabled={busy}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {t('reset')}
                </button>
              )}
            </div>
            <fieldset disabled={busy || review} className="mt-5 space-y-5">
              <div>
                <label
                  htmlFor="publish-clip"
                  className="mb-2 block text-sm font-medium"
                >
                  {t('clip')}
                </label>
                <select
                  id="publish-clip"
                  value={clipId}
                  onChange={(event) => setClipId(event.target.value)}
                  className={field}
                >
                  <option value="">{t('chooseClip')}</option>
                  {data.clips.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {Math.round(item.duration)}s
                    </option>
                  ))}
                </select>
                {!data.clips.length && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('noClips')}{' '}
                    <Link className="underline" href="/dashboard/clips">
                      {t('library')}
                    </Link>
                  </p>
                )}
              </div>
              <div className={styles.preview}>
                {clip?.fileUrl ? (
                  <video
                    key={clip.id}
                    src={clip.fileUrl}
                    controls={true}
                    preload="metadata"
                    className="max-h-80 w-full bg-black"
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  <div className={styles.previewEmpty}>
                    <Film
                      className="size-7"
                      strokeWidth={1.3}
                      aria-hidden="true"
                    />
                    <span>{clip?.title ?? t('chooseClip')}</span>
                  </div>
                )}
                <div className={styles.previewCaption}>
                  <span>{t('clip')}</span>
                  <span>{clip ? Math.round(clip.duration) + 's' : '--'}</span>
                </div>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">
                  {t('destinations')}
                </legend>
                {!data.accounts.length && (
                  <p className="text-sm text-muted-foreground">
                    {t('noAccounts')}
                  </p>
                )}
                {data.accounts.map((account) => (
                  <label
                    key={account.id}
                    className={`${styles.destination} flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm`}
                  >
                    <input
                      type="checkbox"
                      disabled={account.status !== 'connected'}
                      checked={accountIds.includes(account.id)}
                      onChange={(event) =>
                        setAccountIds((ids) =>
                          event.target.checked
                            ? [...ids, account.id]
                            : ids.filter((id) => id !== account.id)
                        )
                      }
                      className="size-4 accent-primary"
                    />
                    <PlatformBrandIcon
                      provider={account.provider}
                      className={styles.destinationIcon}
                    />
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{account.name}</span>
                      <span className="ml-2 text-muted-foreground">
                        {data.providers.find(
                          (provider) => provider.id === account.provider
                        )?.name ?? account.provider}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div>
                <label
                  htmlFor="publish-caption"
                  className="mb-2 block text-sm font-medium"
                >
                  {t('caption')}
                </label>
                <textarea
                  id="publish-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  maxLength={2200}
                  rows={4}
                  className={field}
                  placeholder={t('captionPlaceholder')}
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {caption.length}/2200
                </p>
              </div>
              {tiktokAccounts.length > 0 && (
                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold">
                    {t('tiktokOptions')}
                  </h3>
                  {optionsError ? (
                    <div className={styles.optionError} role="alert">
                      <AlertTriangle className="size-4" aria-hidden="true" />
                      <span>{t('optionsError')}</span>
                      <button
                        type="button"
                        onClick={() => setOptionsRequest((value) => value + 1)}
                      >
                        {t('retry')}
                      </button>
                    </div>
                  ) : !readyOptions ? (
                    <p role="status" className="text-sm">
                      {t('loadingOptions')}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {t('postingAs', {
                          name: creatorOptions.map((o) => o.nickname).join(', ')
                        })}
                      </p>
                      <div>
                        <label
                          htmlFor="publish-privacy"
                          className="mb-2 block text-sm font-medium"
                        >
                          {t('privacy')}
                        </label>
                        <select
                          id="publish-privacy"
                          className={field}
                          value={privacy}
                          onChange={(event) => setPrivacy(event.target.value)}
                        >
                          <option value="">{t('choosePrivacy')}</option>
                          {privacyLevels.map((level) => (
                            <option key={level} value={level}>
                              {t.has(`privacyLevels.${level}`)
                                ? t(`privacyLevels.${level}`)
                                : level}
                            </option>
                          ))}
                        </select>
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm font-medium">
                          {t('interactions')}
                        </legend>
                        {[
                          {
                            key: 'comments',
                            value: comments,
                            change: setComments,
                            disabled: creatorOptions.some(
                              (o) => o.commentDisabled
                            )
                          },
                          {
                            key: 'duet',
                            value: duet,
                            change: setDuet,
                            disabled: creatorOptions.some((o) => o.duetDisabled)
                          },
                          {
                            key: 'stitch',
                            value: stitch,
                            change: setStitch,
                            disabled: creatorOptions.some(
                              (o) => o.stitchDisabled
                            )
                          }
                        ].map((item) => (
                          <label
                            key={item.key}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={item.value && !item.disabled}
                              disabled={item.disabled}
                              onChange={(e) => item.change(e.target.checked)}
                            />
                            {t(item.key)}
                          </label>
                        ))}
                      </fieldset>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {t('disclosures')}
                        </p>
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={commercial}
                            onChange={(e) => {
                              setCommercial(e.target.checked)
                              if (!e.target.checked) {
                                setOwnBrand(false)
                                setPaidBrand(false)
                              }
                              setConsent(false)
                            }}
                            className="mt-1"
                          />
                          {t('commercial')}
                        </label>
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            disabled={!commercial}
                            checked={ownBrand}
                            onChange={(e) => {
                              setOwnBrand(e.target.checked)
                              setConsent(false)
                            }}
                            className="mt-1"
                          />
                          {t('ownBrand')}
                        </label>
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            disabled={!commercial}
                            checked={paidBrand}
                            onChange={(e) => {
                              setPaidBrand(e.target.checked)
                              setConsent(false)
                            }}
                            className="mt-1"
                          />
                          {t('paidBrand')}
                        </label>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {t('brandHint')}
                        </p>
                      </div>
                      {paidBrand && privacy === 'SELF_ONLY' && (
                        <p role="alert" className="text-sm text-destructive">
                          {t('brandPrivacy')}
                        </p>
                      )}
                      {clip && clip.tiktokEligible !== true && (
                        <p role="alert" className="text-sm text-destructive">
                          {t('tiktokIneligible')}
                        </p>
                      )}
                      {tooLong && (
                        <p role="alert" className="text-sm text-destructive">
                          {t('tooLong')}
                        </p>
                      )}
                      <label className="flex items-start gap-2 text-sm leading-6">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                          className="mt-1.5"
                        />
                        <span>
                          {t('consent')}{' '}
                          <a
                            className="underline"
                            href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('musicTerms')}
                          </a>
                          {(ownBrand || paidBrand) && (
                            <>
                              {' '}
                              ·{' '}
                              <a
                                className="underline"
                                href="https://www.tiktok.com/legal/page/global/bc-policy/en"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t('brandTerms')}
                              </a>
                            </>
                          )}
                        </span>
                      </label>
                    </>
                  )}
                </div>
              )}
            </fieldset>
            {!review && (
              <section
                className={styles.preflight}
                aria-labelledby="preflight-title"
              >
                <div>
                  <p className={styles.eyebrow}>{t('preflightEyebrow')}</p>
                  <h3 id="preflight-title">{t('preflight')}</h3>
                  <p>{t('preflightHint')}</p>
                </div>
                <ul>
                  <li data-ready={Boolean(clip)}>
                    {clip ? (
                      <CircleCheck aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">1</span>
                    )}
                    {t('checkClip')}
                  </li>
                  <li data-ready={accounts.length > 0}>
                    {accounts.length ? (
                      <CircleCheck aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">2</span>
                    )}
                    {t('checkDestinations')}
                  </li>
                  <li data-ready={platformSettingsReady}>
                    {platformSettingsReady ? (
                      <CircleCheck aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">3</span>
                    )}
                    {t('checkSettings')}
                  </li>
                </ul>
              </section>
            )}
            {review ? (
              <div
                className={`${styles.review} mt-6 space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4`}
                role="region"
                aria-label={t('review')}
              >
                <h3 className="font-semibold">{t('review')}</h3>
                <p className="text-sm leading-6">{t('reviewHint')}</p>
                <p className="text-sm font-medium">{clip?.title}</p>
                <ul className="space-y-1 text-sm">
                  {accounts.map((account) => (
                    <li key={account.id} className={styles.reviewAccount}>
                      <PlatformBrandIcon
                        provider={account.provider}
                        className={styles.reviewIcon}
                      />
                      <span>
                        {account.name} ·{' '}
                        {data.providers.find(
                          (provider) => provider.id === account.provider
                        )?.name ?? account.provider}
                      </span>
                    </li>
                  ))}
                </ul>
                {caption && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {caption}
                  </p>
                )}
                {tiktokAccounts.length > 0 && (
                  <p className="text-sm">
                    {t('privacy')}:{' '}
                    {t.has(`privacyLevels.${privacy}`)
                      ? t(`privacyLevels.${privacy}`)
                      : privacy}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !canReview}
                    onClick={() => void publish()}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {t('publishNow')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setReview(false)}
                  >
                    {t('edit')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className={styles.reviewButton}
                disabled={!canReview || busy}
                onClick={() => {
                  setNotice('')
                  setReview(true)
                }}
              >
                {t('review')}
                <Send className="size-4" />
              </Button>
            )}
          </section>
          <section aria-labelledby="history-title" className={styles.history}>
            <div className="flex items-center justify-between gap-2">
              <h2 id="history-title" className="text-lg font-semibold">
                {t('history')}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                disabled={refreshing}
                onClick={() => void reload()}
              >
                <RefreshCw
                  className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {t('refresh')}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {t('historyHint')}
            </p>
            {!data.posts.length ? (
              <div className="py-12 text-center">
                <Film className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {t('noPosts')}
                </p>
              </div>
            ) : (
              <ul className="mt-5 divide-y">
                {data.posts.map((post) => (
                  <li key={post.id} className="space-y-2 py-4 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words text-sm font-medium">
                        {data.clips.find((item) => item.id === post.clipId)
                          ?.title ?? t('clip')}
                      </p>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px]">
                        {t(
                          `statuses.${['submitting', 'finalizing'].includes(post.status) ? 'processing' : post.status}`
                        )}
                      </span>
                    </div>
                    <div className={styles.historyAccount}>
                      <PlatformBrandIcon
                        provider={post.provider}
                        className={styles.historyIcon}
                      />
                      <p className="break-words text-xs text-muted-foreground">
                        {data.accounts.find(
                          (account) => account.id === post.accountId
                        )?.name ?? post.provider}{' '}
                        · {new Date(post.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                    {post.error && (
                      <p className="break-words text-xs leading-5 text-destructive">
                        {post.error}
                      </p>
                    )}
                    {post.status === 'unknown' && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t('unknownHint')}
                      </p>
                    )}
                    {post.url && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs underline"
                      >
                        {t('viewPost')}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
