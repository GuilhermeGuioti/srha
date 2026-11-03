import { lerConfiguracaoEntra } from "../../auth/entra";

const TENANT = "30c0ed9a-2601-4e74-9dc9-87e323e9eb27";
const completa = {
  AUTH_MICROSOFT_ENTRA_ID_ID: "id-do-app",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "segredo",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: `https://login.microsoftonline.com/${TENANT}/v2.0`,
};

test("sem nenhuma variável, o Entra ID não sobe", () => {
  expect(lerConfiguracaoEntra({})).toBeNull();
});

test("com as três, sobe e extrai o tenant do emissor", () => {
  expect(lerConfiguracaoEntra(completa)).toEqual({
    clientId: "id-do-app",
    clientSecret: "segredo",
    issuer: completa.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    tenantId: TENANT,
  });
});

test("pela metade é erro de implantação, não login quebrado em silêncio", () => {
  expect(() => lerConfiguracaoEntra({ ...completa, AUTH_MICROSOFT_ENTRA_ID_ISSUER: undefined })).toThrow("pela metade");
  expect(() => lerConfiguracaoEntra({ ...completa, AUTH_MICROSOFT_ENTRA_ID_SECRET: "" })).toThrow("pela metade");
});

test("emissor genérico, que aceitaria conta de qualquer tenant, é recusado", () => {
  for (const generico of ["common", "organizations", "consumers"]) {
    expect(() =>
      lerConfiguracaoEntra({ ...completa, AUTH_MICROSOFT_ENTRA_ID_ISSUER: `https://login.microsoftonline.com/${generico}/v2.0` }),
    ).toThrow("emissor do tenant");
  }
  expect(() =>
    lerConfiguracaoEntra({ ...completa, AUTH_MICROSOFT_ENTRA_ID_ISSUER: `https://login.exemplo.com/${TENANT}/v2.0` }),
  ).toThrow("emissor do tenant");
});
