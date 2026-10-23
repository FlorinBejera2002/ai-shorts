import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { WEBHOOK_EVENTS } from './stripe-sandbox.mjs'

// The public server intentionally uses the reviewed sandbox during this launch.
// Credentials travel only through the encrypted SSH process's standard input.
const root = fileURLToPath(new URL('../', import.meta.url))
const policy = JSON.parse(await readFile(path.join(root, 'config/stripe-sandbox-policy.json'), 'utf8'))
const environment = parseEnv(await readFile(path.join(root, '.env'), 'utf8'))
if (environment.STRIPE_MODE !== 'test' || !/^(sk|rk)_test_[A-Za-z0-9]{16,}$/.test(environment.STRIPE_SECRET_KEY ?? '')) {
  throw new Error('Only the explicitly reviewed sandbox key can be provisioned by this helper.')
}
if (!policy.expectedAccountId || environment.STRIPE_EXPECTED_ACCOUNT_ID !== policy.expectedAccountId) {
  throw new Error('Local sandbox account must match the reviewed policy.')
}
const payload = {
  apply: process.argv.includes('--apply'),
  secretKey: environment.STRIPE_SECRET_KEY,
  expectedAccountId: policy.expectedAccountId,
  catalog: policy.catalog,
  portalId: policy.portal.configurationId,
  events: WEBHOOK_EVENTS
}

const remote = String.raw`
import hashlib, json, os, pathlib, re, sys, tempfile, urllib.error, urllib.parse, urllib.request
data = json.load(sys.stdin)
target = pathlib.Path('/opt/sneepcut/.env.production.local')
callback = 'https://api.sneepcut.com/api/webhooks/stripe'
version = '2026-06-24.dahlia'
key = data['secretKey']
if not re.fullmatch(r'(sk|rk)_test_[A-Za-z0-9]{16,}', key):
    raise SystemExit('Refusing a non-sandbox credential')
if target.is_symlink() or not target.is_file():
    raise SystemExit('Production environment must be an existing regular file')
original = target.read_text()
saved = {}
for line in original.splitlines():
    match = re.match(r'^([A-Z][A-Z0-9_]*)=(.*)$', line)
    if match:
        saved[match[1]] = match[2].strip().strip('"').strip("'")

def api(method, route, values=None, idempotency=None):
    headers = {'Authorization':'Bearer '+key, 'Stripe-Version':version}
    body = None if values is None else urllib.parse.urlencode(values, doseq=True).encode()
    if idempotency:
        headers['Idempotency-Key'] = idempotency
    request = urllib.request.Request('https://api.stripe.com/v1'+route, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit('Stripe verification/provisioning failed: HTTP '+str(error.code)) from None
    except Exception:
        raise SystemExit('Stripe verification/provisioning is unavailable') from None

account = api('GET','/account')
if account.get('id') != data['expectedAccountId'] or api('GET','/balance').get('livemode') is not False:
    raise SystemExit('Stripe account or mode mismatch')
updates = {'STRIPE_MODE':'test', 'STRIPE_EXPECTED_ACCOUNT_ID':account['id'], 'STRIPE_SECRET_KEY':key}
for item in data['catalog']:
    price = api('GET','/prices/'+item['priceId'])
    if not (price.get('livemode') is False and price.get('active') is True and price.get('unit_amount') == item['unitAmount'] and price.get('currency') == item['currency'] and price.get('product') == item['productId'] and price.get('tax_behavior') == item['taxBehavior'] and price.get('recurring',{}).get('interval') == 'month' and price['recurring'].get('interval_count') == 1):
        raise SystemExit('Reviewed sandbox price mismatch')
    updates['STRIPE_PRICE_'+item['key'].upper()] = price['id']
portal = api('GET','/billing_portal/configurations/'+data['portalId'])
features = portal.get('features',{})
if not (portal.get('livemode') is False and portal.get('active') is True and features.get('subscription_cancel',{}).get('mode') == 'at_period_end' and features.get('subscription_update',{}).get('proration_behavior') == 'none'):
    raise SystemExit('Reviewed sandbox Portal mismatch')
updates['STRIPE_PORTAL_CONFIGURATION'] = portal['id']
for size in (100,500,1000):
    updates['STRIPE_PRICE_CREDITS_'+str(size)] = ''
endpoints = []
cursor = ''
while True:
    page = api('GET','/webhook_endpoints?limit=100'+('&starting_after='+urllib.parse.quote(cursor) if cursor else ''))
    endpoints.extend(page.get('data',[]))
    if not page.get('has_more'):
        break
    cursor = page['data'][-1]['id']
matches = [endpoint for endpoint in endpoints if endpoint.get('url') == callback]
if len(matches) > 1:
    raise SystemExit('Ambiguous existing production-test webhook endpoints')
endpoint = matches[0] if matches else None
if endpoint and not (endpoint.get('livemode') is False and endpoint.get('status') == 'enabled' and endpoint.get('api_version') == version and sorted(endpoint.get('enabled_events',[])) == sorted(data['events'])):
    raise SystemExit('Existing production-test webhook has configuration drift')
if not data['apply']:
    print(json.dumps({'mode':'test','accountId':account['id'],'verifiedPrices':len(data['catalog']),'portalId':portal['id'],'callback':callback,'webhookExists':bool(endpoint),'wouldCreateWebhook':not bool(endpoint),'environmentWouldBeUpdated':True}))
    raise SystemExit(0)
secret = saved.get('STRIPE_WEBHOOK_SECRET','')
if endpoint:
    if saved.get('STRIPE_WEBHOOK_ENDPOINT_ID') != endpoint['id'] or not re.fullmatch(r'whsec_[A-Za-z0-9]+',secret):
        raise SystemExit('Existing webhook requires secure recovery of its own signing secret; no duplicate created')
else:
    values = {'url':callback,'api_version':version,'enabled_events[]':data['events'],'metadata[sneepcut_configuration]':'sneepcut-billing-v1','metadata[deployment_environment]':'production-test'}
    endpoint = api('POST','/webhook_endpoints',values,'sneepcut-production-test-webhook-v1-'+hashlib.sha256(callback.encode()).hexdigest()[:24])
    secret = endpoint.get('secret','')
    if not re.fullmatch(r'whsec_[A-Za-z0-9]+',secret) or endpoint.get('livemode') is not False:
        raise SystemExit('Created endpoint did not return the expected test signing secret')
updates['STRIPE_WEBHOOK_SECRET'] = secret
updates['STRIPE_WEBHOOK_ENDPOINT_ID'] = endpoint['id']
lines = [line for line in original.splitlines() if line.split('=',1)[0] not in updates]
lines.extend(name+'='+value for name,value in updates.items())
descriptor, temporary = tempfile.mkstemp(prefix='.stripe-env-',dir=target.parent)
try:
    os.fchmod(descriptor,0o600)
    with os.fdopen(descriptor,'w') as output:
        output.write('\n'.join(lines)+'\n')
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary,target)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
readback = api('GET','/webhook_endpoints/'+endpoint['id'])
if readback.get('livemode') is not False or readback.get('url') != callback or readback.get('api_version') != version or sorted(readback.get('enabled_events',[])) != sorted(data['events']):
    raise SystemExit('Webhook readback failed; secret retained securely for recovery')
print(json.dumps({'mode':'test','accountId':account['id'],'verifiedPrices':len(data['catalog']),'portalId':portal['id'],'webhookId':endpoint['id'],'callback':callback,'apiVersion':version,'events':data['events'],'environmentUpdated':True,'secretsStoredServerSide':True}))
`
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'sc', 'python3 -c ' + quote(remote)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
let output = ''
child.stdout.setEncoding('utf8').on('data', value => { output += value })
let error = ''
child.stderr.setEncoding('utf8').on('data', value => { error += value })
child.stdin.on('error', () => {})
child.stdin.end(JSON.stringify(payload))
const code = await new Promise((resolve, reject) => {
  child.on('error', () => reject(new Error('Unable to start encrypted SSH provisioning')))
  child.on('close', resolve)
})
if (code !== 0) {
  // Raw transport/provider output is never echoed with credentials in scope.
  throw new Error('Secure sandbox provisioning failed; no raw provider output was printed.')
}
const result = JSON.parse(output)
if (payload.apply) {
  await writeFile(path.join(root,'config/stripe-server-test-manifest.json'),JSON.stringify(result,null,2)+'\n')
}
console.log(JSON.stringify(result))
