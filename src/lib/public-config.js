export function publicCloudConfig(urlValue, keyValue) {
  const url = urlValue?.trim() || "";
  const key = keyValue?.trim() || "";
  if (!url && !key) return null;
  if (!url || !key)
    throw new Error("Configure Project URL e Publishable key juntos.");
  if (!key.startsWith("sb_publishable_"))
    throw new Error(
      "O frontend aceita somente a chave pública Publishable. Não use chaves Secret ou service_role.",
    );
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Project URL inválida.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "Use a Project URL HTTPS, sem credenciais, caminho ou parâmetros.",
    );
  return { url: parsed.origin, key };
}
