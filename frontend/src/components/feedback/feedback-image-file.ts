/** A picked screenshot with its data-URL preview (no object URLs to revoke). */
export interface FeedbackImage {
  id: string
  file: File
  preview: string
}

export function readFeedbackImage(file: File): Promise<FeedbackImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ id: crypto.randomUUID(), file, preview: String(reader.result) })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
