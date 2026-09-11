const origin = process.env.STUDIO_VERIFICATION_ORIGIN;
const project = process.env.STUDIO_VERIFICATION_PROJECT;
if (!origin || !project || !["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Disposable loopback origin and synthetic project required");
const response = await fetch(`${origin}/api/projects/${project}/thumbnail/index.html?t=1&v=debug`, {
  headers: { Authorization: "Bearer synthetic-fixture" },
});
console.log(response.status, await response.text());
