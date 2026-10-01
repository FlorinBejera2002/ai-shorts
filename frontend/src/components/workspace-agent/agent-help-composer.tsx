import { Button } from '@/components/ui/button'

interface Props {
  locale: string
  helpMode: boolean
  pendingQuestion?: string
  draftLength: number
  onRegularMessage: () => void
  onAddQuestion: () => void
}

export function AgentHelpComposer({ locale, helpMode, pendingQuestion, draftLength, onRegularMessage, onAddQuestion }: Props) {
  const text = (english: string, romanian: string) => locale === 'ro' ? romanian : english
  return <>
    {helpMode && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{text('Story Builder help · no actions', 'Ajutor Story Builder · fără acțiuni')}</span>
      <Button type="button" size="sm" variant="ghost" onClick={onRegularMessage}>{text('Regular message', 'Mesaj obișnuit')}</Button>
    </div>}
    {pendingQuestion && <div className="space-y-2 rounded-md bg-muted p-3 text-xs" role="status">
      <p>{text('Your draft is unchanged. You can add this help question:', 'Mesajul tău a rămas neschimbat. Poți adăuga întrebarea de ajutor:')}</p>
      <p>{pendingQuestion}</p>
      <Button type="button" size="sm" variant="outline" disabled={draftLength + pendingQuestion.length + 2 > 4000} onClick={onAddQuestion}>{text('Add question to draft', 'Adaugă întrebarea')}</Button>
    </div>}
  </>
}
