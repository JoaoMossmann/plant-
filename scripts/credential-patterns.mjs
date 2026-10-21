// Verificação de padrões conhecidos; não substitui revisão humana ou auditoria do serviço remoto.
export function findCredentialPatterns(text) {
  const rules = [
    ["npm-token", /\bnpm_[A-Za-z0-9]{30,}\b/],
    [
      "smtp-password-literal",
      /\bSMTP_(?:PASSWORD|PASS)\s*[:=]\s*["'][A-Za-z0-9 ]{16,}["']/i,
    ],
    [
      "private-key",
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    ],
    ["supabase-secret-key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
    [
      "github-token",
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
    ],
    ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ["stripe-secret-key", /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/],
    ["google-api-key", /\bAIza[A-Za-z0-9_-]{30,}\b/],
    [
      "mail-or-database-password-url",
      /\b(?:smtps?|postgres(?:ql)?):\/\/[^\s:@/]+:[^\s@/]+@/i,
    ],
    [
      "secret-literal",
      /\b(?:API_KEY|SMTP_PASSWORD|SERVICE_ROLE_KEY|SECRET_KEY|ACCESS_TOKEN|RESEND_API_KEY)\s*[:=]\s*["'][A-Za-z0-9_+\/=.-]{20,}["']/i,
    ],
  ];
  const kinds = new Set(
    rules.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind),
  );
  for (const candidate of text.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  )) {
    try {
      const payload = JSON.parse(
        Buffer.from(candidate[0].split(".")[1], "base64url").toString("utf8"),
      );
      if (payload.role === "service_role")
        kinds.add("supabase-service-role-jwt");
    } catch {
      /* strings parecidas com JWT não necessariamente são credenciais */
    }
  }
  return [...kinds];
}
