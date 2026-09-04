import assert from 'node:assert/strict'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '@prisma/client'
import { build } from 'esbuild'
import ts from 'typescript'
import { setWranglerExternal } from '../node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/wrangler-external.js'
import {
  copyWorkerdPackages,
  transformPackageJson
} from '../node_modules/@opennextjs/cloudflare/dist/cli/build/utils/workerd.js'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const readJson = (path) => JSON.parse(read(path))
const disconnectedUrl =
  'postgresql://runtime_test:runtime_test@127.0.0.1:1/runtime_test'

function loadDatabaseFactory() {
  const { outputText } = ts.transpileModule(read('../src/lib/db.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(
    require,
    module,
    module.exports
  )
  return module.exports
}

function loadNextConfig(platform = process.platform) {
  const { outputText } = ts.transpileModule(read('../next.config.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  })
  const module = { exports: {} }
  const configRequire = (name) => {
    if (name === '@opennextjs/cloudflare') {
      return {
        initOpenNextCloudflareForDev() {
          // Config inspection must not start a development Worker runtime.
        }
      }
    }
    if (name === 'next-intl/plugin') return () => (config) => config
    return require(name)
  }
  new Function('require', 'module', 'exports', 'process', outputText)(
    configRequire,
    module,
    module.exports,
    { platform, env: {}, cwd: () => process.cwd() }
  )
  return module.exports.default
}

test('every production build regenerates the JavaScript Prisma client', () => {
  const schema = read('../prisma/schema.prisma')
  const packageJson = readJson('../package.json')
  assert.match(schema, /generator client\s*\{[^}]*engineType\s*=\s*"client"/)
  assert.equal(packageJson.scripts.prebuild, 'prisma generate')
  assert.equal(packageJson.dependencies['@prisma/client'], '^6.19.3')
  assert.equal(packageJson.devDependencies.prisma, '^6.19.3')
})

test('the actual database factory initializes separate adapter clients lazily', async () => {
  const { createPrismaClient } = loadDatabaseFactory()
  const previousUrl = process.env.DATABASE_URL
  const clients = []
  try {
    delete process.env.DATABASE_URL
    assert.throws(createPrismaClient, /DATABASE_URL is required/)

    process.env.DATABASE_URL = disconnectedUrl
    clients.push(createPrismaClient(), createPrismaClient())
    assert.notEqual(clients[0], clients[1])
    for (const client of clients) {
      assert.equal(client._engineConfig.generator.config.engineType, 'client')
      assert.ok(client._engineConfig.compilerWasm)
    }
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()))
    if (previousUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousUrl
  }
})

test('generated client validates queries through the WASM compiler without a native engine', async () => {
  let databaseQueries = 0
  let disposals = 0
  const unexpectedQuery = async () => {
    databaseQueries += 1
    throw new Error('Query validation must not contact PostgreSQL')
  }
  const adapter = new PrismaPg({ connectionString: disconnectedUrl })
  // The compiler obtains connection metadata before validating a query. Replace
  // only the connection boundary; retain the real generated client/compiler.
  adapter.connect = async () => ({
    provider: 'postgres',
    adapterName: '@prisma/adapter-pg',
    queryRaw: unexpectedQuery,
    executeRaw: unexpectedQuery,
    getConnectionInfo: () => ({
      schemaName: 'public',
      supportsRelationJoins: true
    }),
    dispose: async () => {
      disposals += 1
    }
  })
  const client = new PrismaClient({ adapter })
  try {
    await assert.rejects(
      client.user.findUnique({ where: { id: 42 } }),
      (error) =>
        error instanceof Prisma.PrismaClientValidationError &&
        /Expected String, provided Int/.test(error.message)
    )
    assert.equal(databaseQueries, 0)
    assert.equal(client._engineConfig.generator.config.engineType, 'client')
    const loadedModules = Object.keys(require.cache).map((path) =>
      path.replaceAll('\\', '/')
    )
    assert.ok(
      loadedModules.some((path) =>
        path.endsWith('/@prisma/client/runtime/client.js')
      )
    )
    assert.deepEqual(
      loadedModules.filter((path) =>
        /(?:query_engine.*\.node|@prisma\/client\/runtime\/(?:library|binary)\.js)$/.test(
          path
        )
      ),
      []
    )
  } finally {
    await client.$disconnect()
  }
  assert.equal(disposals, 1)
})

test('OpenNext selects the generated Worker compiler and static WASM loader', () => {
  const clientPackage = readJson('../node_modules/@prisma/client/package.json')
  const generatedPackage = readJson(
    '../node_modules/.prisma/client/package.json'
  )
  const client = transformPackageJson(clientPackage)
  const generated = transformPackageJson(generatedPackage)
  assert.equal(client.hasBuildCondition, true)
  assert.equal(generated.hasBuildCondition, true)
  for (const kind of ['require', 'import']) {
    assert.deepEqual(client.transformed.exports['.'][kind], {
      workerd: './default.js'
    })
    assert.deepEqual(generated.transformed.imports['#main-entry-point'][kind], {
      workerd: './wasm.js'
    })
  }
  assert.deepEqual(generated.transformed.imports['#wasm-compiler-loader'], {
    workerd: './wasm-worker-loader.mjs'
  })
  assert.match(
    read('../node_modules/@prisma/client/default.js'),
    /require\(['"]\.prisma\/client\/default['"]\)/
  )
  assert.match(
    read('../node_modules/.prisma/client/default.js'),
    /require\(['"]#main-entry-point['"]\)/
  )
  const workerEntry = read('../node_modules/.prisma/client/wasm.js')
  assert.match(workerEntry, /@prisma\/client\/runtime\/wasm-compiler-edge\.js/)
  assert.match(workerEntry, /import\(['"]#wasm-compiler-loader['"]\)/)
  assert.doesNotMatch(
    workerEntry,
    /runtime\/(?:library|binary|wasm-engine-edge)\.js/
  )
  assert.match(
    read('../node_modules/.prisma/client/wasm-worker-loader.mjs'),
    /import\(['"]\.\/query_compiler_bg\.wasm['"]\)/
  )
  const nextConfig = read('../next.config.ts')
  assert.match(
    nextConfig,
    /serverExternalPackages:\s*\[[^\]]*['"]@prisma\/client['"][^\]]*['"]\.prisma\/client['"]/
  )
})

test('Next config covers canonical and native Windows traced Prisma package names', () => {
  const windows = loadNextConfig('win32').serverExternalPackages
  const linux = loadNextConfig('linux').serverExternalPackages
  for (const name of ['@prisma/client', '.prisma/client']) {
    assert.ok(windows.includes(name))
    assert.ok(windows.includes(name.replaceAll('/', '\\')))
    assert.ok(linux.includes(name))
    assert.ok(!linux.includes(name.replaceAll('/', '\\')))
  }
})

test('actual OpenNext package copy and server bundle use static compiler WASM', async () => {
  const temporaryRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'sneepcut-prisma-bundle-'))
  )
  const input = path.join(temporaryRoot, 'input')
  const output = path.join(temporaryRoot, 'output')
  try {
    mkdirSync(path.join(input, '.next'), { recursive: true })
    writeFileSync(
      path.join(input, '.next', 'required-server-files.json'),
      JSON.stringify({ config: loadNextConfig() })
    )
    const packages = new Map()
    // Copy the real generated entry chain, without unrelated/stale native
    // engines. Exercise OpenNext's native-path matching and copy operation, not
    // merely its conditional-exports transform in isolation.
    for (const [name, files] of [
      [
        '@prisma/client',
        ['package.json', 'default.js', 'runtime/wasm-compiler-edge.js']
      ],
      [
        '.prisma/client',
        [
          'package.json',
          'default.js',
          'wasm.js',
          'wasm-worker-loader.mjs',
          'query_compiler_bg.js',
          'query_compiler_bg.wasm'
        ]
      ]
    ]) {
      const source = path.join(input, 'node_modules', name)
      const destination = path.join(output, 'node_modules', name)
      for (const file of files) {
        const target = path.join(source, file)
        mkdirSync(path.dirname(target), { recursive: true })
        copyFileSync(
          fileURLToPath(
            new URL(`../node_modules/${name}/${file}`, import.meta.url)
          ),
          target
        )
      }
      packages.set(source, destination)
    }
    const copyOptions = { appBuildOutputPath: input, appPath: input }
    if (process.platform === 'win32') {
      const canonicalOnly = loadNextConfig('linux')
      writeFileSync(
        path.join(input, '.next', 'required-server-files.json'),
        JSON.stringify({ config: canonicalOnly })
      )
      await copyWorkerdPackages(copyOptions, packages)
      assert.equal(
        existsSync(
          path.join(output, 'node_modules/.prisma/client/package.json')
        ),
        false,
        'canonical-only names reproduce the OpenNext Windows copy regression'
      )
      writeFileSync(
        path.join(input, '.next', 'required-server-files.json'),
        JSON.stringify({ config: loadNextConfig() })
      )
    }
    await copyWorkerdPackages(copyOptions, packages)
    const copied = JSON.parse(
      readFileSync(
        path.join(output, 'node_modules/.prisma/client/package.json'),
        'utf8'
      )
    )
    assert.deepEqual(copied.imports['#main-entry-point'].require, {
      workerd: './wasm.js'
    })
    const result = await build({
      absWorkingDir: output,
      stdin: {
        contents: "export { PrismaClient } from '@prisma/client'",
        resolveDir: output
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      conditions: ['workerd'],
      metafile: true,
      plugins: [setWranglerExternal()]
    })
    const inputs = Object.keys(result.metafile.inputs)
    assert.ok(inputs.some((file) => file.endsWith('.prisma/client/wasm.js')))
    assert.ok(
      inputs.some((file) => file.endsWith('/runtime/wasm-compiler-edge.js'))
    )
    assert.ok(!inputs.some((file) => file.endsWith('.prisma/client/index.js')))
    assert.ok(!inputs.some((file) => file.endsWith('/runtime/client.js')))
    const imports = Object.values(result.metafile.outputs).flatMap(
      (file) => file.imports
    )
    assert.ok(
      imports.some(
        (entry) =>
          entry.external && entry.path.endsWith('/query_compiler_bg.wasm')
      )
    )
    assert.doesNotMatch(result.outputFiles[0].text, /readFileSync/)
  } finally {
    // Only the exact unique fixture directory created by this test is removed.
    assert.ok(
      path.basename(temporaryRoot).startsWith('sneepcut-prisma-bundle-')
    )
    assert.equal(realpathSync(temporaryRoot), temporaryRoot)
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
