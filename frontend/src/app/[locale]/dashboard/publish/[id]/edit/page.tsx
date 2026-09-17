'use client'

import { PostEditorPage } from '@/components/calendar/post-editor-page'
import { useParams } from 'next/navigation'

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>()
  return <PostEditorPage postId={id} />
}
