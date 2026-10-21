const bucket = "plant-photos";
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
export function createCloudGarden(client, userId) {
  let version = 0;
  let paths = new Map();
  const storage = client.storage.from(bucket);
  async function materialize(rows) {
    const result = [];
    // Limite de concorrência para não disparar centenas de downloads ao mesmo tempo.
    for (let offset = 0; offset < rows.length; offset += 6) {
      const batch = await Promise.all(
        rows.slice(offset, offset + 6).map(async (row) => {
          const { photoPath, ...plant } = row;
          let photo = "";
          if (photoPath) {
            const { data, error } = await storage.download(photoPath);
            if (error)
              throw new Error(
                "Não foi possível carregar uma foto privada. Tente atualizar os dados.",
              );
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
              throw new Error("Foto inválida.");
            const blob = await (await fetch(p.photo)).blob();
            if (blob.size > 2 * 1024 * 1024)
              throw new Error("A foto excede 2 MB. Escolha uma foto menor.");
            const extension =
              blob.type === "image/png"
                ? "png"
                : blob.type === "image/webp"
                  ? "webp"
                  : "jpg";
            path = `${userId}/${crypto.randomUUID()}.${extension}`;
            const { error } = await storage.upload(path, blob, {
              contentType: blob.type,
              upsert: false,
            });
            if (error)
              throw new Error(
                "Não foi possível enviar uma foto. Nenhuma alteração foi salva.",
              );
            staged.push(path);
          } else if (!p.photo) path = null;
          stored.push(toStoredPlant(p, path));
        }
        const { data, error } = await client.rpc("save_my_garden", {
          expected_version: version,
          new_plants: stored,
        });
        if (error) {
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
            await storage.remove([...new Set(obsolete)]);
          } catch {
            /* coleta posterior pelo proprietário */
          }
        }
      } catch (error) {
        // Em falha de rede, o commit pode ter ocorrido no servidor. Não apague uploads cujo estado é incerto.
        // Conflito é uma rejeição explícita; nessa situação os novos uploads podem ser removidos.
        if (!committed && error instanceof ConflictError && staged.length) {
          try {
            await storage.remove(staged);
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
