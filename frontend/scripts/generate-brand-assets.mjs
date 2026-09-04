import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const logo = await readFile(join(root, 'public', 'sneepcut-logo.svg'))
const horizontalLogo = await sharp(logo).resize({ width: 720 }).png().toBuffer()

const background = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="canvas" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FFFFFF"/>
        <stop offset="1" stop-color="#EEF2FF"/>
      </linearGradient>
      <radialGradient id="signal" cx="0" cy="0" r="1" gradientTransform="translate(1080 30) rotate(132) scale(500)">
        <stop stop-color="#C7D2FE" stop-opacity=".9"/>
        <stop offset="1" stop-color="#C7D2FE" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#canvas)"/>
    <rect width="1200" height="630" fill="url(#signal)"/>
    <path d="M936 -30 1216 250" stroke="#4F46E5" stroke-opacity=".08" stroke-width="92"/>
    <text x="240" y="450" fill="#64748B" font-family="Arial, sans-serif" font-size="27" font-weight="500" letter-spacing="1">AI VIDEO CLIPPING, PRECISELY.</text>
  </svg>
`)

await sharp(background)
  .composite([{ input: horizontalLogo, left: 240, top: 190 }])
  .png()
  .toFile(join(root, 'public', 'sneepcut-og.png'))
