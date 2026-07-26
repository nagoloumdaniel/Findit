/*
 * Proxy de l'espace privé : le serveur Next relaie vers l'API en ajoutant la
 * clé privée depuis l'environnement serveur. Le navigateur ne voit JAMAIS la
 * clé et n'a plus rien à saisir - c'est le poste qui est de confiance, pas la
 * page. La clé ne part ni dans le HTML ni dans le bundle : ce fichier ne
 * s'exécute que côté serveur.
 */

const apiBase = (): string => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const forward = async (
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> => {
  const key = process.env.INTERNAL_API_KEY;
  if (key === undefined || key === "") {
    return Response.json(
      { message: "INTERNAL_API_KEY absente de l'environnement serveur." },
      { status: 500 },
    );
  }

  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = `${apiBase()}/api/${path.join("/")}${incoming.search}`;

  const headers: Record<string, string> = { "x-workspace-key": key };
  const contentType = request.headers.get("content-type");
  if (contentType !== null) {
    headers["content-type"] = contentType;
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers,
    ...(hasBody ? { body: request.body, duplex: "half" as const } : {}),
  });

  const outHeaders = new Headers();
  for (const name of ["content-type", "content-disposition"]) {
    const value = response.headers.get(name);
    if (value !== null) {
      outHeaders.set(name, value);
    }
  }

  return new Response(response.body, { status: response.status, headers: outHeaders });
};

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
