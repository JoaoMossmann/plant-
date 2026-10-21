import React, { useState } from "react";
import { supabase, authRedirect, cloudConfigured } from "../lib/supabase";

export function AccountPanel({
  session,
  recovering,
  onRecovered,
  onLocalImport,
  onRefresh,
  loading,
  onClose,
}) {
  const [view, setView] = useState(recovering ? "password" : "signin");
  const [deleteStep, setDeleteStep] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function deleteAccount(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "delete-account",
        { body: { deleteAccount: true } },
      );
      if (error || !data?.deleted) throw new Error("delete");
      await supabase.auth.signOut({ scope: "local" });
      onClose();
    } catch {
      setError(
        "Não foi possível concluir a exclusão. Tente novamente; se persistir, a função de exclusão precisa ser ativada pelo administrador.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || "").trim();
    const password = String(f.get("password") || "");
    try {
      let result;
      if (view === "signup")
        result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirect() },
        });
      if (view === "signin")
        result = await supabase.auth.signInWithPassword({ email, password });
      if (view === "forgot")
        result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authRedirect(),
        });
      if (view === "password")
        result = await supabase.auth.updateUser({ password });
      if (result?.error) throw result.error;
      if (view === "signup")
        setMessage(
          "Se o endereço puder ser cadastrado, você receberá as instruções por e-mail. Confirme o endereço para entrar.",
        );
      if (view === "forgot")
        setMessage(
          "Se houver uma conta para esse endereço, enviaremos um link para redefinir a senha.",
        );
      if (view === "signin") onClose();
      if (view === "password") {
        setMessage("Senha alterada.");
        onRecovered();
        setView("signin");
      }
      e.target.reset();
    } catch {
      setError(
        view === "signin"
          ? "Não foi possível entrar. Confira e-mail, senha e confirmação do endereço."
          : view === "password"
            ? "Não foi possível alterar a senha. Solicite um novo link ou escolha outra senha."
            : "Não foi possível concluir. Aguarde e tente novamente; confira o endereço e a configuração de envio de e-mails.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!cloudConfigured)
    return (
      <>
        <div className="eyebrow">SEU JARDIM, COM VOCÊ</div>
        <h2>Um jardim em qualquer lugar.</h2>
        <p>
          O acesso por conta está sendo preparado. Por enquanto, você pode
          continuar cuidando do seu jardim neste navegador e exportar um backup.
        </p>
        <p>
          Quando o login estiver disponível, você poderá importar suas plantas
          para a conta.
        </p>
      </>
    );
  if (session && view !== "password")
    return (
      <>
        <div className="eyebrow">SEU ESPAÇO PESSOAL</div>
        <h2>Minha conta</h2>
        <p className="account-email">{session.user.email}</p>
        <p>
          As plantas e fotos deste jardim ficam vinculadas à sua conta. Outros
          usuários não têm permissão para acessá-las.
        </p>
        <div className="account-actions">
          <button
            className="secondary"
            disabled={busy || loading}
            onClick={onRefresh}
          >
            Atualizar jardim da conta
          </button>
          <button
            className="secondary"
            disabled={busy || loading}
            onClick={onLocalImport}
          >
            Importar plantas deste navegador
          </button>
          <button
            className="text-btn"
            disabled={busy || loading}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                onClose();
              } catch {
                setError("Não foi possível sair. Tente novamente.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Sair da conta
          </button>
        </div>
        <p className="footnote">
          A importação é uma cópia manual. Seus dados locais não são apagados.
          Exporte um backup pelo menu lateral sempre que quiser.
        </p>
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        {deleteStep ? (
          <form className="delete-confirm" onSubmit={deleteAccount}>
            <h3>Excluir minha conta</h3>
            <p>
              Esta ação remove a conta, o jardim online e suas fotos. Backups e
              plantas locais neste navegador permanecem. A exclusão não pode ser
              desfeita.
            </p>
            <label>
              Digite EXCLUIR para confirmar
              <input
                name="confirm"
                pattern="EXCLUIR"
                required
                autoComplete="off"
              />
            </label>
            <button className="danger" disabled={busy || loading}>
              Excluir permanentemente
            </button>
            <button
              type="button"
              className="text-btn"
              disabled={busy}
              onClick={() => setDeleteStep(false)}
            >
              Cancelar
            </button>
          </form>
        ) : (
          <button
            className="text-btn danger-text"
            disabled={busy || loading}
            onClick={() => setDeleteStep(true)}
          >
            Excluir minha conta e dados
          </button>
        )}
      </>
    );
  const titles = {
    signin: "Bom ter você por aqui.",
    signup: "Seu jardim começa aqui.",
    forgot: "Vamos recuperar seu acesso.",
    password: "Escolha sua nova senha.",
  };
  return (
    <>
      <div className="eyebrow">CULTIVE DE ONDE ESTIVER</div>
      <h2>{titles[view]}</h2>
      <p>
        Entre para guardar suas plantas e acompanhar os cuidados em outros
        aparelhos.
      </p>
      <form className="auth-form" onSubmit={submit}>
        {view !== "password" && (
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="voce@exemplo.com"
            />
          </label>
        )}
        {view !== "forgot" && (
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete={
                view === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={view === "signin" ? 1 : 12}
              maxLength={128}
              placeholder={
                view === "signin" ? "Sua senha" : "Pelo menos 12 caracteres"
              }
            />
          </label>
        )}
        {view === "signup" && (
          <p className="footnote">
            Seu e-mail será usado para autenticação e recuperação de acesso.
            Fotos e dados do jardim serão armazenados na sua conta. Nunca usamos
            sua senha no código ou no GitHub. Ao cadastrar, você concorda com o
            tratamento desses dados para prestar o serviço.
          </p>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="auth-success" role="status">
            {message}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy
            ? "Aguarde…"
            : {
                signin: "Entrar",
                signup: "Criar conta",
                forgot: "Enviar link de recuperação",
                password: "Salvar nova senha",
              }[view]}
        </button>
      </form>
      {view !== "password" && (
        <div className="auth-links">
          <button
            className="text-btn"
            disabled={busy}
            onClick={() => {
              setView(view === "signup" ? "signin" : "signup");
              setMessage("");
              setError("");
            }}
          >
            {view === "signup" ? "Já tenho conta" : "Quero criar uma conta"}
          </button>
          <button
            className="text-btn"
            disabled={busy}
            onClick={() => {
              setView(view === "forgot" ? "signin" : "forgot");
              setMessage("");
              setError("");
            }}
          >
            {view === "forgot" ? "Voltar para entrar" : "Esqueci minha senha"}
          </button>
        </div>
      )}
    </>
  );
}
