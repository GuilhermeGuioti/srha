import { classeBotaoPrimario } from "../../../components/BotaoPrimario";
import { BotaoSecundario } from "../../../components/BotaoSecundario";
import { Campo, classeCampo } from "../../../components/Campo";
import { CartaoPublico } from "../../../components/CartaoPublico";
import { MarcaInstitucional } from "../../../components/MarcaInstitucional";
import { LinkTexto } from "../../../components/LinkTexto";
import { MensagemErro } from "../../../components/MensagemErro";
import { Pill } from "../../../components/Pill";
import { entraConfigurado } from "../../../lib/auth/config";
import { LIMITE_TENTATIVAS_SENHA, MINUTOS_BLOQUEIO_SENHA } from "../../../lib/auth/login";
import { TAMANHO_MAXIMO_SENHA } from "../../../lib/senha";
import { acaoEntrarComMicrosoft, acaoEntrarComSenha } from "./acoes";

// `erro` vem das actions desta tela (e do guard, para usuário inativado);
// `error`, do Auth.js, quando a volta da Microsoft é recusada.
function mensagemDeErro(erro: unknown, error: unknown): string | null {
  if (erro === "senha" || error === "CredentialsSignin") {
    return `E-mail ou senha incorretos. Depois de ${LIMITE_TENTATIVAS_SENHA} tentativas erradas, o acesso por senha fica bloqueado por ${MINUTOS_BLOQUEIO_SENHA} minutos. Sem senha ou bloqueado? Procure a secretaria acadêmica.`;
  }
  if (erro === "sessao") {
    return "Sua senha mudou e a sessão anterior foi encerrada. Entre de novo.";
  }
  if (error === "AccessDenied") {
    return "Sua conta Microsoft não tem acesso ao sistema. Procure a secretaria acadêmica.";
  }
  if (error || erro === "microsoft-entra-id") {
    return "Não foi possível entrar pela Microsoft. Tente de novo.";
  }
  if (erro) {
    return "Não foi possível entrar com esse e-mail. Confira se está cadastrado e ativo.";
  }
  return null;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const erro = mensagemDeErro(searchParams.erro, searchParams.error);

  return (
    <main className="flex flex-1">
      {/* Painel da marca. Só aparece do lg para cima —
          abaixo disso ele espremeria o cartão; a marca vai para o topo dele. */}
      <section className="relative hidden w-[45%] flex-col justify-between overflow-hidden p-12 text-white [background-image:var(--gradiente-marca)] lg:flex">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-white/[.06]" />
        <div aria-hidden className="pointer-events-none absolute bottom-16 -left-16 h-60 w-60 rounded-full bg-white/[.05]" />
        <div aria-hidden className="pointer-events-none absolute -right-10 -bottom-12 h-44 w-44 rounded-full bg-acento/25" />

        <div className="relative">
          <MarcaInstitucional tom="claro" tamanho="lg" />
        </div>

        {/* Sempre em três linhas: a caixa é medida em em (de 12em a 18em a
            frase cabe em três) e a fonte acompanha a largura do painel — 45vw
            menos o p-12 —, então a quebra não muda de uma tela para outra. */}
        <div className="relative">
          <p className="max-w-[14em] text-[clamp(26px,calc((45vw-96px)/14),44px)] font-bold leading-[1.2] tracking-tight">
            As horas atividades do semestre, declaradas e avaliadas em um só lugar.
          </p>
          <div className="mt-5 h-1 w-12 rounded-full bg-acento" />
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/85">
            Cada curso tem seu relatório, cada decisão fica registrada com autor e horário.
          </p>
        </div>

        <p className="relative text-[13px] text-white/75">
          © {new Date().getFullYear()} Centro Universitário Barão de Mauá
        </p>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center bg-papel px-4 py-10 sm:px-8">
        <CartaoPublico
          marcaSoNoCelular
          sobretitulo="SRHA · Acesso institucional"
          titulo="Relatório de Horas Atividades"
          descricao={
            entraConfigurado ? (
              <>
                Entre com a conta institucional{" "}
                <span className="font-mono font-medium text-tinta">@baraodemaua.br</span> ou com o e-mail e a senha
                recebidos da secretaria acadêmica.
              </>
            ) : (
              "Entre com o e-mail e a senha recebidos da secretaria acadêmica."
            )
          }
        >

          {erro && (
            <div className="mt-5">
              <MensagemErro>{erro}</MensagemErro>
            </div>
          )}

          {entraConfigurado && (
            <>
              <form action={acaoEntrarComMicrosoft}>
                <button type="submit" className={`${classeBotaoPrimario} mt-7 min-h-[52px] w-full text-base`}>
                  Entrar com a conta institucional
                </button>
              </form>
              <div className="mt-6 flex items-center gap-3 text-[13px] font-semibold text-tinta-suave" aria-hidden>
                <span className="h-px flex-1 bg-borda" />
                ou com e-mail e senha
                <span className="h-px flex-1 bg-borda" />
              </div>
            </>
          )}

          <form action={acaoEntrarComSenha} className={`${entraConfigurado ? "mt-4" : "mt-7"} flex flex-col gap-4`}>
            <Campo rotulo="E-mail" htmlFor="email-login">
              <input id="email-login" name="email" type="email" autoComplete="username" required className={classeCampo} />
            </Campo>
            <Campo rotulo="Senha" htmlFor="senha-login">
              <input
                id="senha-login"
                name="senha"
                type="password"
                autoComplete="current-password"
                required
                maxLength={TAMANHO_MAXIMO_SENHA}
                className={classeCampo}
              />
            </Campo>
            {entraConfigurado ? (
              <BotaoSecundario type="submit">Entrar com e-mail e senha</BotaoSecundario>
            ) : (
              <button type="submit" className={`${classeBotaoPrimario} mt-3 min-h-[52px] w-full text-base`}>
                Entrar
              </button>
            )}
          </form>

          <div className="mt-7 border-t border-borda pt-6">
            <p className="text-[13px] font-semibold text-tinta-suave">Seu perfil é definido pelo vínculo cadastrado</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill cor="interativo">Docente</Pill>
              <Pill cor="aprovado" forma="quadrado">Coordenação</Pill>
              <Pill cor="neutro" forma="circulo-vazado">Secretaria</Pill>
            </div>
          </div>

          <p className="mt-6 text-[13px] text-tinta-suave">Sem acesso? Procure a coordenação do seu curso.</p>
          {/* Para quem recebeu o papel e não tem conta no sistema. A linha
              tem 44px de altura para o link ser alvo de toque inteiro. */}
          <p className="flex min-h-11 flex-wrap items-center gap-x-1.5 text-[13px] text-tinta-suave">
            Recebeu um relatório impresso?
            <LinkTexto href="/validar" className="inline-flex min-h-11 items-center">
              Validar documento
            </LinkTexto>
          </p>
        </CartaoPublico>
      </section>
    </main>
  );
}
