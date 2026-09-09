import {
  forwardRef,
  type CSSProperties,
  type ImgHTMLAttributes
} from 'react'

type StaticImage = { src: string; width?: number; height?: number }
type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | StaticImage
  fill?: boolean
  priority?: boolean
  quality?: number
  unoptimized?: boolean
}

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  {
    src,
    fill = false,
    priority = false,
    quality: _quality,
    unoptimized: _unoptimized,
    style,
    width,
    height,
    ...props
  },
  ref
) {
  const source = typeof src === 'string' ? src : src.src
  const imageStyle: CSSProperties | undefined = fill
    ? {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        ...style
      }
    : style

  return (
    <img
      ref={ref}
      src={source}
      width={fill ? undefined : (width ?? (typeof src === 'object' ? src.width : undefined))}
      height={fill ? undefined : (height ?? (typeof src === 'object' ? src.height : undefined))}
      loading={priority ? 'eager' : props.loading}
      fetchPriority={priority ? 'high' : props.fetchPriority}
      decoding="async"
      style={imageStyle}
      {...props}
    />
  )
})

export default Image
