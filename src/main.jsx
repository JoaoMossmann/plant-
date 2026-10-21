import React, { useEffect, useRef, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Leaf,
  Sprout,
  BookOpen,
  House,
  Droplets,
  Plus,
  Search,
  ArrowUpRight,
  X,
  Sun,
  ShieldCheck,
  AlertTriangle,
  Download,
  Upload,
  Camera,
  Check,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { catalog, lightNames, toxicityLabel, spaceNames } from "./catalog";
import { dayKey, dueDays, validateBackup, recommend } from "./domain";
import { readGarden, saveGarden, imageData } from "./storage";
import { supabase, cloudConfigured } from "./lib/supabase";
import { createCloudGarden } from "./lib/cloud-garden";
import { AccountPanel } from "./components/AccountPanel";
import { CatalogPhoto, PlantReferences } from "./components/CatalogPhoto";
import "./style.css";
const regions = ["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"];
function AuthApp() {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(!cloudConfigured),
    [authError, setAuthError] = useState(false),
    [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      setReady(true);
      setAuthError(false);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          if (error) setAuthError(true);
          else setSession(data.session);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setAuthError(true);
          setReady(true);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  if (!ready)
    return (
      <div className="session-loading" role="status">
        Preparando seu jardim…
      </div>
    );
  if (authError)
    return (
      <div className="session-loading">
        <p>
          Não foi possível verificar seu acesso. Tente novamente com uma conexão
          disponível.
        </p>
        <button className="primary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  return (
    <App
      key={session?.user.id || "local"}
      session={session}
      recovering={recovering}
      onRecovered={() => setRecovering(false)}
    />
  );
}
function App({ session, recovering, onRecovered }) {
  const [page, setPage] = useState("garden"),
    [plants, setPlants] = useState([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [query, setQuery] = useState(""),
    [region, setRegion] = useState("Sul"),
    [space, setSpace] = useState("compacto"),
    [pet, setPet] = useState(false),
    [light, setLight] = useState(""),
    [onlyDue, setOnlyDue] = useState(false),
    [room, setRoom] = useState({
      light: "indireta",
      pets: false,
      region: "Sul",
      space: "compacto",
    }),
    [roomPhoto, setRoomPhoto] = useState(""),
    [roomResult, setRoomResult] = useState(false),
    [busy, setBusy] = useState(false);
  const importRef = useRef();
  const today = dayKey();
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const store = useMemo(
    () =>
      session
        ? createCloudGarden(supabase, session.user.id)
        : { load: readGarden, save: saveGarden },
    [session?.user.id],
  );
  async function refresh() {
    if (savingRef.current) return;
    setLoaded(false);
    try {
      const next = await store.load();
      if (mounted.current) {
        setPlants(next);
        setLoaded(true);
        setError("");
      }
    } catch (err) {
      if (mounted.current)
        setError(err.message || "Não foi possível carregar o jardim.");
    }
  }
  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [store]);
  useEffect(() => {
    if (recovering) setModal({ type: "account" });
  }, [recovering]);
  async function importLocal() {
    if (!loaded) {
      setError("Atualize o jardim da conta antes de importar dados locais.");
      return;
    }
    try {
      const local = validateBackup({ version: 1, plants: await readGarden() });
      const ids = new Set(plants.map((p) => p.id));
      await persist(
        [...plants, ...local.filter((p) => !ids.has(p.id))],
        "Plantas locais copiadas para sua conta.",
      );
    } catch {
      setError(
        "Não foi possível importar os dados locais. Exporte um backup e tente importar o arquivo.",
      );
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            ".modal button,.modal input,.modal select,.modal textarea,.modal a",
          ),
        ].filter((n) => !n.disabled);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.querySelector(".modal button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [modal]);
  async function persist(next, message) {
    if (savingRef.current || !loaded) return false;
    savingRef.current = true;
    setBusy(true);
    try {
      await store.save(next, plants);
      if (mounted.current) {
        setPlants(next);
        if (message) setToast(message);
      }
      return true;
    } catch (err) {
      if (mounted.current) {
        setError(
          err.message ||
            "Não foi possível salvar. Exporte um backup dos seus dados.",
        );
        if (session) setLoaded(false);
      }
      return false;
    } finally {
      savingRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function water(p) {
    if (p.lastWatered === today) return;
    await persist(
      plants.map((x) =>
        x.id === p.id
          ? {
              ...x,
              lastWatered: today,
              history: [{ date: today, type: "Rega" }, ...x.history],
            }
          : x,
      ),
      "Rega registrada. Sua planta agradece!",
    );
  }
  function nav(p) {
    setPage(p);
    setQuery("");
    setOnlyDue(false);
  }
  function backup() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, plants }, null, 2)], {
        type: "application/json",
      }),
    );
    a.href = url;
    a.download = `meu-jardim-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restore(e) {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 40 * 1024 * 1024)
        throw new Error("Use um backup de até 40 MB.");
      const incoming = validateBackup(JSON.parse(await file.text()));
      const ids = new Set(plants.map((p) => p.id));
      await persist(
        [...plants, ...incoming.filter((p) => !ids.has(p.id))],
        "Backup importado. Plantas já existentes foram preservadas.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  }
  const due = plants.filter((p) => dueDays(p) <= 0);
  const filtered = plants.filter(
    (p) =>
      (p.name + " " + p.species).toLowerCase().includes(query.toLowerCase()) &&
      (!onlyDue || dueDays(p) <= 0),
  );
  const species = catalog.filter(
    (p) =>
      p.regions.includes(region) &&
      (space === "todos" || p.space === space) &&
      (!pet || p.pets) &&
      (!light || p.light === light) &&
      (p.name + " " + p.scientific).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="app">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("garden");
          }}
        >
          <span className="brand-icon">
            <Sprout />
          </span>
          meu jardim<span className="brand-dot">●</span>
        </a>
        <div className="nav-label">SEU CANTINHO VERDE</div>
        <nav>
          {[
            ["garden", Sprout, "Minhas plantas"],
            ["catalog", BookOpen, "Explorar plantas"],
            ["room", House, "Meu ambiente"],
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => nav(id)}
            >
              <Icon size={20} />
              {label}
              {id === page && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-leaf">🌱</div>
          <strong>Um cuidado de cada vez.</strong>
          <p>Seu jardim cresce junto com você.</p>
          <div className="local-badge">
            <span /> {session ? "Conta conectada" : "Dados neste navegador"}
          </div>
          <button
            className="text-btn"
            onClick={backup}
            disabled={busy || (!loaded && plants.length === 0)}
          >
            <Download size={14} /> Exportar backup
          </button>
          <button
            className="text-btn"
            onClick={() => importRef.current.click()}
            disabled={busy || !loaded}
          >
            <Upload size={14} /> Importar backup
          </button>
          <input
            hidden
            ref={importRef}
            type="file"
            accept="application/json,.json"
            onChange={restore}
          />
        </div>
      </aside>
      <main>
        <header>
          <span>
            <span className="header-dot" /> MAIS VERDE, MAIS VIDA
          </span>
          <button
            className="profile account-button"
            aria-label={session ? "Minha conta" : "Entrar / criar conta"}
            disabled={busy}
            onClick={() => setModal({ type: "account" })}
          >
            <span className="account-avatar">{session ? "✓" : "J"}</span>
            <span>{session ? "Minha conta" : "Entrar / criar conta"}</span>
          </button>
        </header>
        {error && (
          <div role="alert" className="error">
            <span>{error}</span>
            {!loaded && <button onClick={refresh}>Atualizar dados</button>}
            <button aria-label="Fechar erro" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {page === "garden" && (
          <>
            {session && (
              <div className="sync-banner">
                <span>Jardim da sua conta · alterações salvas online</span>
                <button className="text-btn" onClick={refresh} disabled={busy}>
                  Atualizar dados
                </button>
              </div>
            )}
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">CULTIVE SEU PEQUENO UNIVERSO</div>
                <h1>
                  Um lar mais verde.
                  <br />
                  <em>Um dia de cada vez.</em>
                </h1>
                <p>
                  Conheça suas plantas, acompanhe os cuidados
                  <br className="desktop" /> e veja a vida florescer por aí.
                </p>
                <button
                  className="primary"
                  disabled={!loaded}
                  onClick={() => setModal({ type: "add" })}
                >
                  <Plus size={18} /> Adicionar planta
                </button>
              </div>
              <div className="botanical" aria-hidden="true">
                <div className="halo" />
                <div className="stem s1" />
                <div className="stem s2" />
                <div className="stem s3" />
                <i className="leaf l1" />
                <i className="leaf l2" />
                <i className="leaf l3" />
                <i className="leaf l4" />
                <i className="leaf l5" />
                <i className="leaf l6" />
                <div className="pot" />
                <div className="plant-note">
                  <span>✧</span> Cultivar também é cuidar de você.
                </div>
              </div>
            </section>
            <section className="stats">
              <div>
                <span className="stat-icon">
                  <Sprout />
                </span>
                <div>
                  <strong>{plants.length}</strong>
                  <span>plantas no seu jardim</span>
                </div>
              </div>
              <button
                onClick={() => setOnlyDue(!onlyDue)}
                className={onlyDue ? "stat-selected" : ""}
              >
                <span className="stat-icon peach">
                  <Droplets />
                </span>
                <div>
                  <strong>
                    {due.length}
                    <small> para conferir</small>
                  </strong>
                  <span>pedindo um pouquinho de atenção</span>
                </div>
                <ChevronRight size={18} />
              </button>
              <div className="daily">
                <Sun size={26} />
                <p>
                  Pequenos cuidados,
                  <br />
                  <strong>grandes folhas.</strong>
                </p>
              </div>
            </section>
            <section className="collection">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">SEU REFÚGIO PARTICULAR</div>
                  <h2>
                    Minhas plantas <span>{plants.length}</span>
                  </h2>
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar minhas plantas"
                    placeholder="Encontrar uma plantinha…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {onlyDue && (
                <button
                  className="chip selected"
                  onClick={() => setOnlyDue(false)}
                >
                  Cuidados para conferir <X size={13} />
                </button>
              )}
              {!loaded ? (
                <p>Carregando seu jardim…</p>
              ) : filtered.length ? (
                <div className="grid">
                  {filtered.map((p) => {
                    const c = catalog.find((c) => c.id === p.catalogId);
                    const days = dueDays(p);
                    return (
                      <article className="plant-card" key={p.id}>
                        <button
                          className="plant-image"
                          style={{ background: c?.color || "#e3e8dc" }}
                          onClick={() => setModal({ type: "plant", plant: p })}
                        >
                          {p.photo ? (
                            <img src={p.photo} alt={p.name} />
                          ) : c ? (
                            <CatalogPhoto plant={c} />
                          ) : (
                            <span className="plant-emoji">🪴</span>
                          )}
                          <span className="image-tag">
                            {days <= 0
                              ? "Conferir o solo"
                              : `Conferir em ${days}d`}
                          </span>
                        </button>
                        <div className="card-body">
                          <button
                            className="card-title"
                            onClick={() =>
                              setModal({ type: "plant", plant: p })
                            }
                          >
                            <h3>{p.name}</h3>
                            <ArrowUpRight size={18} />
                          </button>
                          <p className="scientific">{p.species}</p>
                          <div className="card-footer">
                            <span>
                              <Droplets size={14} />
                              {p.lastWatered
                                ? `Última: ${formatDate(p.lastWatered)}`
                                : "Sem rega registrada"}
                            </span>
                            <button
                              className="water-btn"
                              disabled={busy || p.lastWatered === today}
                              onClick={() => water(p)}
                            >
                              {p.lastWatered === today ? (
                                <Check size={16} />
                              ) : (
                                <Droplets size={16} />
                              )}{" "}
                              {p.lastWatered === today ? "Regada" : "Reguei"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty">
                  <div>🌱</div>
                  <h3>
                    {query || onlyDue
                      ? "Nenhuma planta por aqui."
                      : "Toda floresta começa com uma planta."}
                  </h3>
                  <p>
                    {query || onlyDue
                      ? "Tente outra busca ou remova o filtro."
                      : "Adicione sua primeira companheira verde e comece a cultivar sua história."}
                  </p>
                  {!query && !onlyDue && (
                    <button
                      className="primary"
                      onClick={() => setModal({ type: "add" })}
                    >
                      <Plus size={17} /> Minha primeira planta
                    </button>
                  )}
                </div>
              )}
            </section>
            <div className="bottom-callout">
              <div>
                <span className="eyebrow">UMA NOVA COMPANHEIRA?</span>
                <h3>A planta certa para o seu cantinho.</h3>
                <p>
                  Descubra espécies que combinam com a luz e a rotina da sua
                  casa.
                </p>
              </div>
              <button className="secondary" onClick={() => nav("room")}>
                Explorar meu ambiente <ArrowUpRight size={17} />
              </button>
            </div>
            <p className="footnote">
              Os lembretes aparecem ao abrir o site. Confira a umidade do solo
              antes de regar; o intervalo é apenas um ponto de partida.
            </p>
          </>
        )}
        {page === "catalog" && (
          <section className="page-section">
            <div className="eyebrow">CONHECER PARA CULTIVAR</div>
            <h1>
              Seu próximo <em>encontro verde.</em>
            </h1>
            <p className="intro">
              Espécies para conhecer, comparar e trazer mais verde para casa.
              Foco em vasos, apartamentos e casas menores. Fotos reais, cuidados
              e fontes em cada ficha.
            </p>
            <div className="filters">
              <label>
                Espaço disponível
                <select
                  value={space}
                  onChange={(e) => setSpace(e.target.value)}
                >
                  {Object.entries(spaceNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                  <option value="todos">Todos os portes</option>
                </select>
              </label>
              <label>
                Região de cultivo
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  {regions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Luminosidade
                <select
                  value={light}
                  onChange={(e) => setLight(e.target.value)}
                >
                  <option value="">Todas</option>
                  {Object.entries(lightNames).map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={pet}
                  onChange={(e) => setPet(e.target.checked)}
                />{" "}
                Opções não tóxicas a cães e gatos
              </label>
              <label className="search">
                <Search size={17} />
                <input
                  placeholder="Buscar espécie…"
                  aria-label="Buscar espécie"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="notice">
              <BookOpen size={18} />
              <span>
                {species.length} {species.length === 1 ? "opção" : "opções"}{" "}
                neste filtro · {catalog.length} fichas disponíveis. O filtro
                indica possibilidades de cultivo, não ocorrência nativa.
                Microclima e proteção do frio fazem diferença.
              </span>
            </div>
            <div className="grid catalog-grid">
              {species.map((p) => (
                <article className="plant-card" key={p.id}>
                  <button
                    className="plant-image"
                    style={{ background: p.color }}
                    onClick={() => setModal({ type: "species", plant: p })}
                  >
                    <CatalogPhoto plant={p} />
                    <span className="image-tag">{p.place}</span>
                  </button>
                  <div className="card-body">
                    <button
                      className="card-title"
                      onClick={() => setModal({ type: "species", plant: p })}
                    >
                      <h3>{p.name}</h3>
                      <ArrowUpRight size={18} />
                    </button>
                    <p className="scientific">{p.scientific}</p>
                    <div className="tags">
                      <span>
                        <Sun size={13} />
                        {lightNames[p.light]}
                      </span>
                      <span
                        className={
                          p.pets === true
                            ? "safe"
                            : p.pets === false
                              ? "toxic"
                              : "unknown"
                        }
                      >
                        {p.pets ? (
                          <ShieldCheck size={13} />
                        ) : (
                          <AlertTriangle size={13} />
                        )}{" "}
                        {toxicityLabel(p)}
                      </span>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => setModal({ type: "add", species: p })}
                    >
                      <Plus size={15} /> Adicionar ao meu jardim
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!species.length && (
              <div className="empty">
                <h3>Nenhuma espécie com esses filtros.</h3>
                <p>Experimente outra luminosidade ou região.</p>
              </div>
            )}
            <p className="footnote">
              *Não tóxica não significa comestível ou livre de riscos. Confirme
              a espécie; qualquer planta pode causar desconforto se ingerida.
              Referência de toxicidade:{" "}
              <a
                href="https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants"
                target="_blank"
                rel="noreferrer"
              >
                ASPCA
              </a>
              . Em caso de ingestão, procure um veterinário.
            </p>
          </section>
        )}
        {page === "room" && (
          <section className="page-section">
            <div className="eyebrow">CADA CANTO TEM SEU VERDE</div>
            <h1>
              Vamos encontrar <em>o lugar certo.</em>
            </h1>
            <p className="intro">
              Conte como é o ambiente. As sugestões usam suas respostas sobre
              luz, região e animais.
            </p>
            <div className="room-layout">
              <div className="room-form">
                <label className="room-upload">
                  {roomPhoto ? (
                    <img src={roomPhoto} alt="Ambiente escolhido" />
                  ) : (
                    <>
                      <Camera size={30} />
                      <strong>Uma foto do seu cantinho</strong>
                      <span>Opcional · fica apenas neste navegador</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      try {
                        if (e.target.files[0])
                          setRoomPhoto(await imageData(e.target.files[0]));
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  />
                </label>
                <p className="footnote">
                  A foto é uma referência visual para você. Esta versão não
                  analisa imagens e não identifica espécies automaticamente.
                </p>
                <label>
                  Como é a luz nesse lugar?
                  <select
                    value={room.light}
                    onChange={(e) => {
                      setRoom({ ...room, light: e.target.value });
                      setRoomResult(false);
                    }}
                  >
                    <option value="indireta">
                      Tem claridade, sem sol direto
                    </option>
                    <option value="sol">
                      Recebe várias horas de sol direto
                    </option>
                    <option value="baixa">Pouca claridade natural</option>
                    <option value="nenhuma">Não tem luz natural</option>
                  </select>
                </label>
                <label>
                  Espaço para a planta crescer
                  <select
                    value={room.space}
                    onChange={(e) => {
                      setRoom({ ...room, space: e.target.value });
                      setRoomResult(false);
                    }}
                  >
                    <option value="compacto">Vaso em um espaço pequeno</option>
                    <option value="amplo">Tenho mais espaço livre</option>
                    <option value="todos">Qualquer porte</option>
                  </select>
                </label>
                <label>
                  Onde você mora?
                  <select
                    value={room.region}
                    onChange={(e) => {
                      setRoom({ ...room, region: e.target.value });
                      setRoomResult(false);
                    }}
                  >
                    {regions.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={room.pets}
                    onChange={(e) => {
                      setRoom({ ...room, pets: e.target.checked });
                      setRoomResult(false);
                    }}
                  />{" "}
                  Tenho cães ou gatos em casa
                </label>
                <button className="primary" onClick={() => setRoomResult(true)}>
                  <Leaf size={17} /> Encontrar minhas plantas
                </button>
              </div>
              <div className="room-results">
                {!roomResult ? (
                  <div className="empty">
                    <span>☀️</span>
                    <h3>A luz é o primeiro passo.</h3>
                    <p>
                      Uma foto sozinha não revela quantas horas de sol um
                      ambiente recebe. Suas observações ajudam a escolher
                      melhor.
                    </p>
                  </div>
                ) : (
                  <>
                    <h2>
                      {room.light === "nenhuma"
                        ? "Aqui precisamos de mais luz."
                        : "Combinações para seu cantinho"}
                    </h2>
                    <p>
                      {room.light === "nenhuma"
                        ? "Nenhuma das espécies do catálogo vive bem sem luz. Considere mudar o local ou usar iluminação de cultivo adequada."
                        : "Estas espécies combinam com os critérios informados. Observe o ambiente antes de decidir."}
                    </p>
                    {recommend(catalog, room).map((p) => (
                      <button
                        className="recommendation"
                        key={p.id}
                        onClick={() => setModal({ type: "species", plant: p })}
                      >
                        <span style={{ background: p.color }}>
                          <CatalogPhoto plant={p} />
                        </span>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {lightNames[p.light]} · {toxicityLabel(p)}
                          </small>
                        </div>
                        <ArrowUpRight size={18} />
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </section>
        )}
        <footer>
          <Leaf size={14} /> Feito para cultivar bons dias.
          <span>Primeira versão · jardim pessoal</span>
        </footer>
      </main>
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal.type === "add"
                ? "Adicionar planta"
                : modal.type === "account"
                  ? "Minha conta"
                  : modal.plant.name
            }
          >
            <button
              className="close"
              aria-label="Fechar"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            {modal.type === "account" ? (
              <AccountPanel
                session={session}
                recovering={recovering}
                onRecovered={onRecovered}
                onLocalImport={importLocal}
                onRefresh={refresh}
                loading={busy}
                onClose={() => setModal(null)}
              />
            ) : modal.type === "add" ? (
              <PlantForm
                species={modal.species}
                existing={modal.existing}
                busy={busy}
                onError={setError}
                onSave={async (p) => {
                  const next = modal.existing
                    ? plants.map((x) => (x.id === p.id ? p : x))
                    : [...plants, p];
                  if (await persist(next, "Planta salva no seu jardim."))
                    setModal(null);
                }}
              />
            ) : modal.type === "species" ? (
              <>
                <div
                  className="modal-botanic catalog-detail-photo"
                  style={{ background: modal.plant.color }}
                >
                  <CatalogPhoto plant={modal.plant} />
                </div>
                <div className="eyebrow">CONHEÇA SUA PLANTA</div>
                <h2>{modal.plant.name}</h2>
                <p className="scientific">{modal.plant.scientific}</p>
                <p>{modal.plant.description}</p>
                <h3>Como cuidar</h3>
                <p>{modal.plant.care}</p>
                <div className="notice">
                  <Droplets size={20} />
                  <span>
                    Comece conferindo o solo a cada {modal.plant.water} dias e
                    ajuste ao clima, vaso e estação. Não é uma ordem para regar.
                  </span>
                </div>
                <p className="pet-note">
                  {modal.plant.pets === true
                    ? "Considerada não tóxica a cães e gatos, mas não deve ser ingerida."
                    : modal.plant.pets === false
                      ? "Tóxica a cães e gatos. Mantenha fora do alcance e confirme a espécie."
                      : "Toxicidade não confirmada nesta ficha. Mantenha fora do alcance de animais até confirmar."}
                </p>
                <PlantReferences plant={modal.plant} />
                <button
                  className="primary"
                  onClick={() =>
                    setModal({ type: "add", species: modal.plant })
                  }
                >
                  <Plus size={17} /> Adicionar ao meu jardim
                </button>
              </>
            ) : (
              <PlantDetail
                plant={
                  plants.find((p) => p.id === modal.plant.id) || modal.plant
                }
                busy={busy}
                onWater={water}
                onEdit={(p) => setModal({ type: "add", existing: p })}
                onCare={async (p) => {
                  await persist(
                    plants.map((x) =>
                      x.id === p.id
                        ? {
                            ...x,
                            history: [
                              { date: today, type: "Cuidado geral" },
                              ...x.history,
                            ],
                          }
                        : x,
                    ),
                    "Cuidado registrado.",
                  );
                }}
                onDelete={async (p) => {
                  if (
                    await persist(
                      plants.filter((x) => x.id !== p.id),
                      "Planta removida.",
                    )
                  )
                    setModal(null);
                }}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function PlantForm({ species, existing, busy, onSave, onError }) {
  const [photo, setPhoto] = useState(existing?.photo || ""),
    [selected, setSelected] = useState(
      existing?.catalogId || species?.id || "",
    ),
    [interval, setInterval] = useState(
      existing?.interval || species?.water || 7,
    ),
    [photoBusy, setPhotoBusy] = useState(false),
    [catalogQuery, setCatalogQuery] = useState("");
  const s = catalog.find((p) => p.id === selected);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        onSave({
          id: existing?.id || crypto.randomUUID(),
          name: String(data.get("name")).trim(),
          species: String(data.get("species")).trim(),
          catalogId: selected,
          acquired: data.get("acquired"),
          interval: Number(interval),
          photo,
          notes: String(data.get("notes") || ""),
          lastWatered: existing?.lastWatered || null,
          history: existing?.history || [],
        });
      }}
    >
      <div className="eyebrow">MAIS VIDA POR AQUI</div>
      <h2>{existing ? "Editar plantinha" : "Uma nova companheira."}</h2>
      <p>Dê um nome, escolha uma foto e comece sua história.</p>
      <label className="photo-upload">
        {photo ? (
          <img src={photo} alt="Foto da planta" />
        ) : (
          <>
            <Camera />
            <span>Adicionar ou tirar uma foto</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            setPhotoBusy(true);
            try {
              if (e.target.files[0])
                setPhoto(await imageData(e.target.files[0]));
            } catch (err) {
              onError(err.message);
            } finally {
              setPhotoBusy(false);
            }
          }}
        />
      </label>
      {photo && (
        <button type="button" className="text-btn" onClick={() => setPhoto("")}>
          Remover foto
        </button>
      )}
      <label>
        Nome carinhoso
        <input
          name="name"
          placeholder="Ex.: Minha Marantinha"
          defaultValue={existing?.name || ""}
          required
          maxLength={80}
        />
      </label>
      <label>
        Buscar espécie para cadastrar
        <input
          value={catalogQuery}
          onChange={(e) => setCatalogQuery(e.target.value)}
          placeholder={`Buscar entre ${catalog.length} espécies…`}
        />
      </label>
      <label>
        Espécie do catálogo
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const p = catalog.find((p) => p.id === e.target.value);
            if (p) setInterval(p.water);
          }}
        >
          <option value="">Outra / ainda não sei</option>
          {catalog
            .filter(
              (p) =>
                p.id === selected ||
                (p.name + " " + p.scientific)
                  .toLowerCase()
                  .includes(catalogQuery.toLowerCase()),
            )
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.scientific}
              </option>
            ))}
        </select>
      </label>
      <label>
        Qual é a planta?
        <input
          key={selected}
          name="species"
          defaultValue={s?.scientific || existing?.species || ""}
          placeholder="Espécie ou nome popular; se não souber, escreva desconhecida"
          required
          maxLength={120}
        />
      </label>
      <div className="form-row">
        <label>
          Está comigo desde
          <input
            type="date"
            name="acquired"
            defaultValue={existing?.acquired || dayKey()}
            max={dayKey()}
            required
          />
        </label>
        <label>
          Conferir o solo a cada (dias)
          <input
            type="number"
            min="1"
            max="365"
            required
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </label>
      </div>
      <label>
        Observações
        <textarea
          name="notes"
          rows="2"
          maxLength={2000}
          defaultValue={existing?.notes || ""}
          placeholder="Onde ela fica, algo que você percebeu…"
        />
      </label>
      <p className="footnote">
        Sem identificação automática nesta versão. Escolha a espécie
        manualmente. O intervalo sugere conferir o solo antes de decidir regar.
      </p>
      <button className="primary full" disabled={busy || photoBusy}>
        {photoBusy
          ? "Preparando foto…"
          : busy
            ? "Salvando…"
            : existing
              ? "Salvar alterações"
              : "Adicionar ao meu jardim"}
      </button>
    </form>
  );
}
function PlantDetail({ plant: p, busy, onWater, onCare, onDelete, onEdit }) {
  const [confirm, setConfirm] = useState(false);
  const c = catalog.find((x) => x.id === p.catalogId);
  const days = dueDays(p);
  return (
    <>
      {p.photo ? (
        <img className="detail-photo" src={p.photo} alt={p.name} />
      ) : (
        <div
          className="modal-botanic catalog-detail-photo"
          style={{ background: c?.color }}
        >
          {c ? <CatalogPhoto plant={c} /> : <span>🪴</span>}
        </div>
      )}
      <div className="eyebrow">SUA COMPANHEIRA VERDE</div>
      <h2>{p.name}</h2>
      <p className="scientific">{p.species}</p>
      <p>
        Com você desde {formatDate(p.acquired)} ·{" "}
        {Math.max(
          0,
          Math.round(
            (new Date(dayKey() + "T12:00:00") -
              new Date(p.acquired + "T12:00:00")) /
              86400000,
          ),
        )}{" "}
        dias
      </p>
      <div className="notice">
        <Droplets size={20} />
        <span>
          {days <= 0
            ? "Hora de conferir a umidade do solo."
            : `Próxima conferência em ${days} dias.`}{" "}
          Intervalo atual: {p.interval} dias. Ajuste conforme sua planta.
        </span>
      </div>
      {c && (
        <>
          <h3>Cuidados da espécie</h3>
          <p>{c.care}</p>
          <p className="pet-note">
            {c.pets === true
              ? "Considerada não tóxica a cães e gatos. Evite ingestão."
              : c.pets === false
                ? "Tóxica a cães e gatos. Mantenha fora do alcance."
                : "Toxicidade não confirmada para cães e gatos."}
          </p>
          <PlantReferences plant={c} />
        </>
      )}
      {p.notes && <p className="notes">{p.notes}</p>}
      <div className="detail-actions">
        <button
          className="primary"
          disabled={busy || p.lastWatered === dayKey()}
          onClick={() => onWater(p)}
        >
          <Droplets size={17} />
          {p.lastWatered === dayKey() ? "Regada hoje" : "Reguei hoje"}
        </button>
        <button className="secondary" disabled={busy} onClick={() => onCare(p)}>
          Registrar cuidado
        </button>
        <button className="text-btn" onClick={() => onEdit(p)}>
          Editar planta
        </button>
      </div>
      <h3>Diário de cuidados</h3>
      {p.history.length ? (
        <ul className="history">
          {p.history.map((h, i) => (
            <li key={i}>
              <span>{h.type}</span>
              <time>{formatDate(h.date)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p>Seu primeiro cuidado vai aparecer aqui.</p>
      )}
      {confirm ? (
        <div className="delete-confirm">
          <p>Excluir esta planta e todo o histórico?</p>
          <button
            className="danger"
            disabled={busy}
            onClick={() => onDelete(p)}
          >
            Sim, excluir
          </button>
          <button className="text-btn" onClick={() => setConfirm(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          className="text-btn danger-text"
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={14} /> Remover planta
        </button>
      )}
    </>
  );
}
function formatDate(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}
createRoot(document.getElementById("root")).render(<AuthApp />);
