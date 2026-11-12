import { runAI } from "../../server/worker.js";
import { HttpError, obj, text } from "./validation";
export { StudioStore } from "./store";
interface Env {
  STUDIO: DurableObjectNamespace;
  ASSETS: Fetcher;
  OWNER_EMAIL: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLIC_KEY: string;
  AUTH_SERVICE?: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}
const headers: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
const cookie = (name: string, value: string, age: number) =>
  `__Host-dmstudio-${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function cookies(r: Request) {
  return Object.fromEntries(
    (r.headers.get("Cookie") ?? "").split(";").flatMap((p) => {
      const i = p.indexOf("=");
      if (i < 0) return [];
      try {
        return [[p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1))]];
      } catch {
        return [];
      }
    }),
  );
}
async function provider(env: Env, path: string, body?: any, token?: string) {
  const r = new Request(env.SUPABASE_URL + path, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: env.SUPABASE_PUBLIC_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return env.AUTH_SERVICE ? env.AUTH_SERVICE.fetch(r) : fetch(r);
}
function owner(env: Env, u: any) {
  return (
    typeof u.id === "string" &&
    typeof u.email === "string" &&
    u.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase() &&
    Boolean(u.email_confirmed_at || u.confirmed_at)
  );
}
async function identity(r: Request, env: Env, save: string[]) {
  const c = cookies(r);
  let access = c["__Host-dmstudio-access"];
  let check = access
    ? await provider(env, "/auth/v1/user", undefined, access)
    : null;
  if (
    (!check || [401, 403].includes(check.status)) &&
    c["__Host-dmstudio-refresh"]
  ) {
    const refresh = await provider(
      env,
      "/auth/v1/token?grant_type=refresh_token",
      { refresh_token: c["__Host-dmstudio-refresh"] },
    );
    if (refresh.ok) {
      const s = obj(await refresh.json());
      access = String(s.access_token ?? "");
      if (access) {
        check = await provider(env, "/auth/v1/user", undefined, access);
        save.push(
          cookie("access", access, 3600),
          cookie("refresh", String(s.refresh_token ?? ""), 2592000),
        );
      }
    }
  }
  if (!check?.ok)
    throw new HttpError(
      check && check.status >= 500 ? 503 : 401,
      "Please sign in.",
    );
  const u = await check.json();
  if (!owner(env, u))
    throw new HttpError(403, "This account is not authorised for the Studio.");
  return u;
}
async function body(r: Request) {
  const reader = r.body?.getReader();
  if (!reader) return {};
  let chunks = "",
    n = 0;
  const decoder = new TextDecoder();
  while (true) {
    const x = await reader.read();
    if (x.done) break;
    n += x.value.byteLength;
    if (
      n >
      (new URL(r.url).pathname.startsWith("/api/listings") ? 7000000 : 100000)
    ) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks += decoder.decode(x.value, { stream: true });
  }
  try {
    return obj(JSON.parse(chunks + decoder.decode()));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON request.");
  }
}
export default {
  async fetch(r: Request, env: Env) {
    const u = new URL(r.url),
      save: string[] = [];
    let response: Response;
    const store = () =>
      env.STUDIO.get(
        env.STUDIO.idFromName("owner:" + env.OWNER_EMAIL.toLowerCase()),
      );
    try {
      if (u.pathname.startsWith("/go/") && r.method === "GET")
        response = await store().fetch(
          new Request(
            "https://studio.internal/redirect/" + u.pathname.slice(4),
            { redirect: "manual" },
          ),
        );
      else if (!u.pathname.startsWith("/api/"))
        response = await env.ASSETS.fetch(r);
      else {
        if (!env.OWNER_EMAIL || !env.SUPABASE_URL || !env.SUPABASE_PUBLIC_KEY)
          throw new HttpError(503, "Owner login has not been configured.");
        const unsafe = !["GET", "HEAD"].includes(r.method),
          upload = u.pathname === "/api/media/upload" && r.method === "POST";
        if (
          unsafe &&
          (r.headers.get("Origin") !== u.origin ||
            r.headers.get("Sec-Fetch-Site") === "cross-site" ||
            (!upload &&
              !r.headers.get("Content-Type")?.startsWith("application/json")))
        )
          throw new HttpError(403, "Request origin could not be verified.");
        if (u.pathname === "/api/login" && r.method === "POST") {
          const b = await body(r);
          const hash = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
              r.headers.get("CF-Connecting-IP") ?? "unknown",
            ),
          );
          const key = Array.from(new Uint8Array(hash), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
          const limit = env.STUDIO.get(env.STUDIO.idFromName("login-limits"));
          const lr = await limit.fetch(
            new Request("https://studio.internal/limit", {
              method: "POST",
              body: JSON.stringify({ key }),
            }),
          );
          if (!lr.ok)
            throw new HttpError(
              429,
              "Too many sign-in attempts. Try again in ten minutes.",
            );
          const email = text(b.email, "Email", 254, true);
          if (
            email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase() ||
            typeof b.password !== "string" ||
            !b.password ||
            b.password.length > 2000
          )
            throw new HttpError(401, "Email or password was not accepted.");
          const pr = await provider(env, "/auth/v1/token?grant_type=password", {
            email,
            password: b.password,
          });
          if (!pr.ok)
            throw new HttpError(
              pr.status >= 500 ? 503 : 401,
              "Email or password was not accepted.",
            );
          const s = obj(await pr.json());
          if (typeof s.access_token !== "string")
            throw new HttpError(502, "Invalid sign-in session.");
          const check = await provider(
            env,
            "/auth/v1/user",
            undefined,
            s.access_token,
          );
          if (!check.ok || !owner(env, await check.json()))
            throw new HttpError(
              403,
              "This account is not authorised for the Studio.",
            );
          save.push(
            cookie("access", s.access_token, 3600),
            cookie("refresh", String(s.refresh_token ?? ""), 2592000),
          );
          response = Response.json({ email });
        } else if (u.pathname === "/api/logout" && r.method === "POST") {
          const c = cookies(r);
          if (c["__Host-dmstudio-access"])
            try {
              await provider(
                env,
                "/auth/v1/logout?scope=local",
                {},
                c["__Host-dmstudio-access"],
              );
            } catch {}
          save.push(cookie("access", "", 0), cookie("refresh", "", 0));
          response = Response.json({ ok: true });
        } else {
          const user: any = await identity(r, env, save);
          if (u.pathname === "/api/session" && r.method === "GET")
            response = Response.json({
              email: user.email,
              user: { id: user.id, username: user.email },
              cloud: true,
              ai: !!env.OPENAI_API_KEY,
            });
          else if (u.pathname === "/api/ai" && r.method === "POST") {
            const limit = await store().fetch(
              new Request("https://studio.internal/limit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: "vehicle-ai:" + user.id }),
              }),
            );
            if (!limit.ok)
              throw new HttpError(
                429,
                "Too many AI requests. Try again in ten minutes.",
              );
            try {
              response = await runAI(env, await body(r));
            } catch (error: any) {
              throw new HttpError(
                error.status || 503,
                error.message || "AI unavailable.",
              );
            }
          } else if (!["GET", "POST", "PUT", "DELETE"].includes(r.method))
            response = Response.json(
              { error: "Method not allowed." },
              { status: 405 },
            );
          else if (upload) {
            const declared = Number(r.headers.get("X-File-Size"));
            const mime = r.headers.get("Content-Type")?.split(";")[0] ?? "";
            if (
              ![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
                "video/mp4",
                "video/quicktime",
                "video/webm",
              ].includes(mime)
            ) {
              await r.body?.cancel();
              throw new HttpError(
                415,
                "Use JPG, PNG, WebP, GIF, MP4, MOV or WebM.",
              );
            }
            if (
              !Number.isSafeInteger(declared) ||
              declared < 16 ||
              declared > 50 * 1024 * 1024
            ) {
              await r.body?.cancel();
              throw new HttpError(
                413,
                "Each file must be between 16 bytes and 50 MB.",
              );
            }
            const h = new Headers(r.headers);
            h.delete("Cookie");
            h.delete("Authorization");
            response = await store().fetch(
              new Request("https://studio.internal/media/upload", {
                method: "POST",
                headers: h,
                body: r.body,
              }),
            );
          } else {
            const h = new Headers({ "Content-Type": "application/json" });
            if (r.headers.has("Range")) h.set("Range", r.headers.get("Range")!);
            const input = unsafe ? JSON.stringify(await body(r)) : undefined;
            response = await store().fetch(
              new Request(
                "https://studio.internal" +
                  (u.pathname.startsWith("/api/listings")
                    ? u.pathname
                        .slice(4)
                        .replace(/^\/listings/, "/vehicle-listings")
                    : u.pathname.slice(4)) +
                  u.search,
                {
                  method: r.method,
                  headers: h,
                  ...(input ? { body: input } : {}),
                },
              ),
            );
          }
        }
      }
    } catch (e) {
      response = Response.json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "Unable to complete the request. Please retry.",
        },
        { status: e instanceof HttpError ? e.status : 503 },
      );
    }
    const h = new Headers(response.headers);
    for (const [k, v] of Object.entries(headers)) h.set(k, v);
    if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/go/"))
      h.set("Cache-Control", "no-store, private");
    for (const v of save) h.append("Set-Cookie", v);
    return new Response(response.body, { status: response.status, headers: h });
  },
};
