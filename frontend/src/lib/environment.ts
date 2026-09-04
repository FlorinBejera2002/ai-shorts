export function isProductionEnvironment(environment = process.env) {
  return (
    environment.APP_ENV?.trim().toLowerCase() === 'production' ||
    environment.NODE_ENV === 'production'
  )
}
