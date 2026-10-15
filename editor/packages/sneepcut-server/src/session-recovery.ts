/** A full reload with an expired cookie returns through the existing app login flow. */
export function sessionRecoveryDocument(appOrigin: string): string {
  const destination = JSON.stringify(`${new URL(appOrigin).origin}/dashboard/studio`).replaceAll(
    "<",
    "\\u003c",
  );
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Reconnect Studio</title><p>Reconnecting to Studio…</p><script>
const destination = new URL(${destination});
const match = /^#project\\/([a-zA-Z0-9_-]+)(?:\\?|$)/.exec(location.hash);
if (match) destination.searchParams.set('project', match[1]);
location.replace(destination.href);
</script></html>`;
}

/** Only the authenticated SneepCut host opts in to browser session renewal. */
export function enableStudioSessionRenewal(html: string): string {
  return html.replace("<head>", '<head><meta name="sneepcut-session" content="enabled">');
}
