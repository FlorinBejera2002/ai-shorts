export function isProductionEnvironment(environment = process.env) {
  // NODE_ENV controls Next.js compilation, including optimized local Docker
  // builds. APP_ENV selects the deployment's network and service policies.
  const appEnvironment = environment.APP_ENV?.trim().toLowerCase()
  if (appEnvironment) {
    return !['development', 'test'].includes(appEnvironment)
  }
  return environment.NODE_ENV === 'production'
}
