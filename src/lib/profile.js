import { checkWriteLimit } from "./write-limit.js";

const fields = "user_id,handle,display_name,bio,city_id,updated_at";
const reserved = new Set([
  "admin",
  "administrador",
  "suporte",
  "support",
  "moderador",
  "moderacao",
  "sistema",
  "equipe",
  "meujardim",
]);
export function profileInput(input) {
  const handle = String(input.handle || "")
    .trim()
    .toLowerCase();
  const display_name = String(input.display_name || "").trim();
  const bio = String(input.bio || "").trim();
  const city_id = input.city_id || null;
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(handle) || reserved.has(handle))
    throw new Error(
      "Escolha um identificador de 3 a 30 caracteres: comece com uma letra e use letras minúsculas, números ou _. Nomes de equipe são reservados.",
    );
  if (display_name.length < 2 || display_name.length > 60)
    throw new Error("Seu nome de exibição deve ter entre 2 e 60 caracteres.");
  if (bio.length > 500)
    throw new Error("A apresentação pode ter até 500 caracteres.");
  if (
    city_id !== null &&
    (typeof city_id !== "string" ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(city_id) ||
      city_id.length > 60)
  )
    throw new Error("Selecione uma cidade válida.");
  return { handle, display_name, bio, city_id };
}
function check(error) {
  if (!error) return;
  checkWriteLimit(error);
  if (error.code === "23505")
    throw new Error(
      "Esse identificador já está em uso. Escolha outro ou atualize seu perfil.",
    );
  if (error.code === "42501")
    throw new Error(
      "Não foi possível salvar. Confira seu acesso e a confirmação de e-mail.",
    );
  throw new Error(
    "O perfil está indisponível no momento. Tente novamente mais tarde.",
  );
}
export function createProfileStore(client, userId) {
  return {
    async load() {
      const [profile, cities] = await Promise.all([
        client
          .from("profiles")
          .select(fields)
          .eq("user_id", userId)
          .maybeSingle(),
        client.from("cities").select("id,name,state_code").order("name"),
      ]);
      check(profile.error);
      check(cities.error);
      return { profile: profile.data, cities: cities.data || [] };
    },
    async save(input, previous) {
      const data = profileInput(input);
      const query = previous
        ? client
            .from("profiles")
            .update(data)
            .eq("user_id", userId)
            .eq("updated_at", previous.updated_at)
        : client.from("profiles").insert({ user_id: userId, ...data });
      const result = await query.select(fields).single();
      if (previous && result.error?.code === "PGRST116")
        throw new Error(
          "Não foi possível atualizar. Recarregue os dados salvos e confira seu acesso antes de tentar novamente.",
        );
      check(result.error);
      if (!result.data)
        throw new Error(
          "Não foi possível salvar o perfil. Atualize os dados e tente novamente.",
        );
      return result.data;
    },
  };
}
