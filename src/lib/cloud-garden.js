import { checkWriteLimit, WriteLimitError } from "./write-limit.js";
import { createPhotoStore, PhotoOperationError } from "./photos.js";

export class ConflictError extends Error {
  constructor() {
    super(
      "Seu jardim foi alterado em outro aparelho. Atualize os dados antes de tentar novamente.",
    );
    this.name = "ConflictError";
  }
}
export function toStoredPlant(p, photoPath = null) {
  return {
    id: p.id,
    name: p.name,
    species: p.species,
    catalogId: p.catalogId || "",
    acquired: p.acquired,
    interval: p.interval,
    notes: p.notes || "",
    lastWatered: p.lastWatered || null,
    history: p.history,
    photoPath,
  };
}
export function createCloudGarden(
  client,
  userId,
  { serverPhotos = false } = {},
) {
  let version = 0;
  let paths = new Map();
  const photos = createPhotoStore(client, userId, serverPhotos);
  let cleanupPending = false;
  async function materialize(rows) {
    const result = [];
    // Limite de concorrência para não disparar centenas de downloads ao mesmo tempo.
    for (let offset = 0; offset < rows.length; offset += 6) {
      const batch = await Promise.all(
        rows.slice(offset, offset + 6).map(async (row) => {
          const { photoPath, ...plant } = row;
          let photo = "";
          if (photoPath) {
            const data = await photos.download(photoPath);
            photo = await blobData(data);
          }
          return { ...plant, photo };
        }),
      );
      result.push(...batch);
    }
    return result;
  }
  return {
    get cleanupPending() {
      return cleanupPending;
    },
    async load() {
      const { data, error } = await client
        .from("gardens")
        .select("plants,version")
        .eq("user_id", userId)
        .maybeSingle();
      if (error)
        throw new Error(
          "Não foi possível carregar o jardim da conta. Confira sua conexão e a configuração do banco.",
        );
      // Não avance a revisão se alguma foto falhar: não permita salvar um estado incompleto.
      const result = await materialize(data?.plants || []);
      version = data?.version || 0;
      paths = new Map((data?.plants || []).map((p) => [p.id, p.photoPath]));
      try {
        await photos.cleanup();
        cleanupPending = false;
      } catch {
        cleanupPending = true;
      }
      return result;
    },
    async save(next, previous) {
      const old = new Map(previous.map((p) => [p.id, p]));
      const staged = [];
      const stored = [];
      let committed = false;
      try {
        for (const p of next) {
          let path = paths.get(p.id) || null;
          if (p.photo && p.photo !== old.get(p.id)?.photo) {
            if (!/^data:image\/(jpeg|png|webp);base64,/.test(p.photo))
              throw new PhotoOperationError("invalid_image");
            const blob = await (await fetch(p.photo)).blob();
            if (blob.size > 2 * 1024 * 1024)
              throw new PhotoOperationError("image_size");
            path = await photos.upload(blob);
            staged.push(path);
          } else if (!p.photo) path = null;
          stored.push(toStoredPlant(p, path));
        }
        const { data, error } = await client.rpc("save_my_garden", {
          expected_version: version,
          new_plants: stored,
        });
        if (error) {
          checkWriteLimit(error);
          if (error.code === "40001") throw new ConflictError();
          throw new Error(
            "Não foi possível salvar na conta. Confira sua conexão e tente novamente.",
          );
        }
        committed = true;
        version = Number(data);
        const retained = new Set(
          stored.map((p) => p.photoPath).filter(Boolean),
        );
        const obsolete = [...paths.values()].filter(
          (path) => path && !retained.has(path),
        );
        paths = new Map(stored.map((p) => [p.id, p.photoPath]));
        // Falha de limpeza não desfaz um salvamento concluído; somente fotos sem referência são removidas.
        if (obsolete.length) {
          try {
            await photos.remove(obsolete);
          } catch {
            cleanupPending = true;
          }
        }
        return { cleanupPending };
      } catch (error) {
        // Em falha de rede, o commit pode ter ocorrido no servidor. Não apague uploads cujo estado é incerto.
        // Rejeições explícitas e erros de foto anteriores ao RPC permitem limpar os uploads já confirmados.
        if (
          !committed &&
          (error instanceof ConflictError ||
            error instanceof WriteLimitError ||
            error instanceof PhotoOperationError) &&
          staged.length
        ) {
          try {
            await photos.remove(staged);
          } catch {
            /* preservar o erro original */
          }
        }
        throw error;
      }
    },
  };
}
function blobData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Erro ao abrir foto."));
    reader.readAsDataURL(blob);
  });
}
