'use client'

import { useEffect, useState } from 'react'

export function useLogoPreview(file: File | null, savedUrl: string | null) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null)

  useEffect(() => {
    if (!file) return

    const url = URL.createObjectURL(file)
    setPreview({ file, url })

    return () => URL.revokeObjectURL(url)
  }, [file])

  return file && preview?.file === file ? preview.url : savedUrl
}
