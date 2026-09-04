import { buildRobotsPolicy } from '@/lib/site-config'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return buildRobotsPolicy()
}
