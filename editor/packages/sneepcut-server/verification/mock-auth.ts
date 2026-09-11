// Run only in a disposable verification container, never as production auth.
if (process.env.NODE_ENV !== "test") throw new Error("Mock auth requires NODE_ENV=test");
const fixtureMedia = "/tmp/studio-import-fixture.mp4";
if (process.env.STUDIO_IMPORT_FIXTURE === "1") {
  const generated = Bun.spawn(
    [
      "/usr/bin/ffmpeg",
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      fixtureMedia,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  if ((await generated.exited) !== 0) throw new Error("Could not generate synthetic clip fixture");
}
Bun.serve({
  hostname: "0.0.0.0",
  port: 8080,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (process.env.STUDIO_IMPORT_FIXTURE === "1" && path === "/media/fixture.mp4")
      return new Response(Bun.file(fixtureMedia), { headers: { "Content-Type": "video/mp4" } });
    if (request.headers.get("Authorization") !== "Bearer synthetic-fixture")
      return new Response(null, { status: 401 });
    if (
      process.env.STUDIO_IMPORT_FIXTURE === "1" &&
      path === "/api/clips/33333333-3333-4333-8333-333333333333"
    )
      return Response.json({
        id: "33333333-3333-4333-8333-333333333333",
        user_id: "11111111-1111-4111-8111-111111111111",
        title: "Generated test clip",
        duration: 6,
        aspect_ratio: "16:9",
        file_url: "http://studio-import-auth:8080/media/fixture.mp4",
      });
    if (path !== "/v1/auth/me") return new Response(null, { status: 404 });
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
