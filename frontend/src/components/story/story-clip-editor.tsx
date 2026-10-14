import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/youtube'
import { StoryScene } from './story-scene'
import { useStoryLanguage } from './use-story-language'
import type { StoryBlock, StoryProject, StoryVersion } from './types'

interface Props {
  project: StoryProject
  version: StoryVersion
  disabled: boolean
  onAction: (action: string, blockID?: string, candidateID?: string) => void
  onLock: (block: StoryBlock, patch: Partial<StoryBlock>) => void
  onSeek: (seconds: number) => void
}

/** A compact timeline mounts only the selected clip's editing controls. */
export function StoryClipEditor({
  project,
  version,
  disabled,
  onAction,
  onLock,
  onSeek
}: Props) {
  const text = useStoryLanguage()
  const [selected, setSelected] = useState(0)
  const index = Math.min(selected, Math.max(0, version.plan.blocks.length - 1))
  const block = version.plan.blocks[index]
  return (
    <section
      id="story-clip-editor"
      className="min-w-0 space-y-3 border-t pt-4"
      aria-label={text('Clip editor', 'Editor filmări')}
    >
      <div
        className="flex gap-2 overflow-x-auto pb-2"
        aria-label={text('Video timeline', 'Cronologia videoului')}
      >
        {version.plan.blocks.map((item, i) => (
          <Button
            key={item.id}
            size="sm"
            variant={i === index ? 'default' : 'outline'}
            className="h-auto min-w-20 shrink-0 flex-col gap-1 py-2"
            aria-pressed={i === index}
            onClick={() => {
              setSelected(i)
              const entry = version.timeline.find(
                (entry) => entry.block_id === item.id
              )
              if (entry) onSeek(entry.output_in)
            }}
          >
            <span>
              {text('Clip', 'Filmarea')} {i + 1}
            </span>
            <span className="text-xs font-normal">
              {formatDuration(
                version.timeline.find((entry) => entry.block_id === item.id)
                  ?.output_in ?? 0
              )}
            </span>
          </Button>
        ))}
      </div>
      {block && (
        <ol>
          <StoryScene
            key={block.id}
            project={project}
            version={version}
            block={block}
            index={index}
            disabled={disabled}
            onAction={onAction}
            onLock={onLock}
            onSeek={onSeek}
          />
        </ol>
      )}
    </section>
  )
}
