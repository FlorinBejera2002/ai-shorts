// Run only in a disposable verification container, never as production auth.
if (process.env.NODE_ENV !== "test") throw new Error("Mock auth requires NODE_ENV=test");
Bun.serve({
  hostname: "0.0.0.0",
  port: 8080,
  fetch(request) {
    if (new URL(request.url).pathname !== "/v1/auth/me")
      return new Response(null, { status: 404 });
    if (request.headers.get("Authorization") !== "Bearer synthetic-fixture")
      return new Response(null, { status: 401 });
    return Response.json({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Synthetic verification user",
        access_role: "member",
        deletion_pending: false,
      },
    });
  },
});
