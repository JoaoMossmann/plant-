import React, { useEffect, useMemo, useRef, useState } from "react";
import { UserRound, ShieldCheck } from "lucide-react";
import { createProfileStore } from "../lib/profile";
import { supabase } from "../lib/supabase";

export function ProfilePage({ session, onSignIn }) {
  const store = useMemo(
    () => (session ? createProfileStore(supabase, session.user.id) : null),
    [session?.user.id],
  );
  const [profile, setProfile] = useState(null),
    [cities, setCities] = useState([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    handle: "",
    display_name: "",
    bio: "",
    city_id: "",
  });
  const alive = useRef(true),
    saving = useRef(false),
    request = useRef(0);
  async function load() {
    if (!store || saving.current) return;
    const generation = ++request.current;
    setReady(false);
    setError("");
    setSaved(false);
    try {
      const result = await store.load();
      if (!alive.current || generation !== request.current) return;
      setProfile(result.profile);
      setCities(result.cities);
      setForm({
        handle: result.profile?.handle || "",
        display_name: result.profile?.display_name || "",
        bio: result.profile?.bio || "",
        city_id: result.profile?.city_id || "",
      });
      setReady(true);
    } catch (err) {
      if (alive.current && generation === request.current)
        setError(err.message);
    }
  }
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      request.current++;
    };
  }, [store]);
  async function save(e) {
    e.preventDefault();
    if (!ready || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const row = await store.save(form, profile);
      if (alive.current) {
        setProfile(row);
        setForm({
          handle: row.handle,
          display_name: row.display_name,
          bio: row.bio,
          city_id: row.city_id || "",
        });
        setSaved(true);
      }
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }
  return (
    <section className="page-section profile-page">
      <div className="eyebrow">SUA HISTÓRIA TAMBÉM FLORESCE AQUI</div>
      <h1>
        Um pouco <em>sobre você.</em>
      </h1>
      <p className="intro">
        Escolha como você quer se apresentar na comunidade.
      </p>
      {!session ? (
        <div className="empty">
          <UserRound size={38} />
          <h2>Seu perfil começa com uma conta.</h2>
          <p>
            Entre para criar seu perfil. Suas plantas locais continuam guardadas
            neste navegador.
          </p>
          <button className="primary" onClick={onSignIn}>
            Entrar para criar meu perfil
          </button>
        </div>
      ) : (
        <>
          <div className="notice">
            <ShieldCheck size={19} />
            <span>
              Seu perfil é separado do jardim privado. O e-mail da conta, as
              notas e o histórico das plantas não aparecem aqui.
            </span>
          </div>
          {error && (
            <div role="alert" className="error">
              <span>{error}</span>
              {!ready && (
                <button className="secondary" onClick={load}>
                  Tentar novamente
                </button>
              )}
            </div>
          )}
          {!ready ? (
            !error && <p role="status">Carregando seu perfil…</p>
          ) : (
            <div className="profile-layout">
              <form className="profile-form" onSubmit={save}>
                <h2>{profile ? "Editar meu perfil" : "Criar meu perfil"}</h2>
                <label>
                  Nome de exibição
                  <input
                    name="display_name"
                    autoComplete="nickname"
                    required
                    minLength={2}
                    maxLength={60}
                    value={form.display_name}
                    onChange={(e) => change("display_name", e.target.value)}
                    disabled={busy}
                    placeholder="Como você quer ser chamado?"
                  />
                </label>
                <label>
                  Identificador
                  <input
                    name="handle"
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-z][a-z0-9_]{2,29}"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-describedby="handle-help"
                    value={form.handle}
                    onChange={(e) =>
                      change("handle", e.target.value.toLowerCase())
                    }
                    disabled={busy}
                    placeholder="seu_cantinho_verde"
                  />
                </label>
                <p className="footnote" id="handle-help">
                  Único na comunidade. Use de 3 a 30 letras minúsculas, números
                  ou _, começando com uma letra.
                </p>
                <label>
                  Apresentação
                  <textarea
                    name="bio"
                    rows={4}
                    maxLength={500}
                    value={form.bio}
                    onChange={(e) => change("bio", e.target.value)}
                    disabled={busy}
                    placeholder="Conte um pouco sobre você e suas plantas…"
                  />
                </label>
                <span className="profile-counter">{form.bio.length}/500</span>
                <label>
                  Cidade (opcional)
                  <select
                    name="city_id"
                    value={form.city_id}
                    onChange={(e) => change("city_id", e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Prefiro não informar</option>
                    {cities.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name} · {c.state_code}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="footnote">
                  Não pedimos endereço residencial nem localização exata para o
                  perfil.
                </p>
                {saved && (
                  <p role="status" className="auth-success">
                    Perfil salvo com sucesso.
                  </p>
                )}
                <div className="profile-actions">
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Salvando…"
                      : profile
                        ? "Salvar alterações"
                        : "Criar perfil"}
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={load}
                    disabled={busy}
                  >
                    Recarregar dados salvos
                  </button>
                </div>
              </form>
              <aside className="profile-preview">
                <div className="eyebrow">PRÉVIA DO PERFIL</div>
                <span className="profile-monogram" aria-hidden="true">
                  {form.display_name.trim().slice(0, 1).toUpperCase() || (
                    <UserRound />
                  )}
                </span>
                <h2>{form.display_name.trim() || "Seu nome de exibição"}</h2>
                <p className="profile-handle">
                  @{form.handle || "seu_identificador"}
                </p>
                <p className="profile-bio">
                  {form.bio || "Sua apresentação vai aparecer aqui."}
                </p>
                {form.city_id && (
                  <p>
                    {cities.find((c) => c.id === form.city_id)?.name} ·{" "}
                    {cities.find((c) => c.id === form.city_id)?.state_code}
                  </p>
                )}
                <span className="profile-preview-note">
                  Prévia das informações que você escolheu para a comunidade.
                </span>
              </aside>
            </div>
          )}
        </>
      )}
    </section>
  );
}
