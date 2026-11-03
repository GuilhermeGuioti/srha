export type ConfiguracaoEntra = { clientId: string; clientSecret: string; issuer: string; tenantId: string };

const EMISSOR_DE_TENANT = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v2\.0\/?$/i;

// Sem as variáveis, o Entra ID não sobe e o login fica só por senha. Pela
// metade, ou com emissor genérico (common, organizations, consumers — que
// aceitariam conta de qualquer tenant), é erro de implantação: falha na hora,
// em vez de subir um login que não funciona ou que aceita quem não devia.
export function lerConfiguracaoEntra(env: Record<string, string | undefined>): ConfiguracaoEntra | null {
  const clientId = env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim();
  const clientSecret = env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim();
  const issuer = env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim();
  if (!clientId && !clientSecret && !issuer) return null;

  if (!clientId || !clientSecret || !issuer) {
    throw new Error(
      "Entra ID configurado pela metade: defina AUTH_MICROSOFT_ENTRA_ID_ID, AUTH_MICROSOFT_ENTRA_ID_SECRET e AUTH_MICROSOFT_ENTRA_ID_ISSUER, ou nenhuma delas.",
    );
  }
  const tenantId = issuer.match(EMISSOR_DE_TENANT)?.[1]?.toLowerCase();
  if (!tenantId) {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER precisa ser o emissor do tenant da instituição: https://login.microsoftonline.com/<id-do-tenant>/v2.0.",
    );
  }
  return { clientId, clientSecret, issuer, tenantId };
}
