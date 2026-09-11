import { randomBytes } from "node:crypto";
import { isUUID } from "./store";

export interface EditorUser {
  id: string;
  name: string | null;
}
export type AuthFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export const SESSION_SECONDS = 900;
export const SESSION_COOKIE = "sneepcut_editor_session";
export class EditorSessions {
  private readonly sessions = new Map<
    string,
    { user: EditorUser; bearer: string; expires: number }
  >();
  constructor(private readonly now = Date.now) {}
  create(user: EditorUser, bearer: string): string {
    for (const [key, session] of this.sessions)
      if (session.expires <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 10000) throw new Error("Session capacity reached");
    const id = randomBytes(32).toString("base64url");
    this.sessions.set(id, { user, bearer, expires: this.now() + SESSION_SECONDS * 1000 });
    return id;
  }
  get(id: string | undefined): { user: EditorUser; bearer: string } | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expires <= this.now()) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }
  delete(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }
}
export async function verifyBearer(
  header: string | undefined,
  authBaseUrl: string,
  fetchAuth: AuthFetcher = fetch,
): Promise<EditorUser | null> {
  if (!header || !/^Bearer [^\s]+$/i.test(header)) return null;
  try {
    const response = await fetchAuth(new URL("/v1/auth/me", authBaseUrl), {
      headers: { Authorization: header },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("user" in body)) return null;
    const user = body.user;
    if (
      !user ||
      typeof user !== "object" ||
      !("id" in user) ||
      typeof user.id !== "string" ||
      !isUUID(user.id) ||
      !("access_role" in user) ||
      user.access_role !== "member" ||
      !("deletion_pending" in user) ||
      user.deletion_pending !== false
    )
      return null;
    return {
      id: user.id,
      name: "name" in user && typeof user.name === "string" ? user.name : null,
    };
  } catch {
    return null;
  }
}
