import { imageData } from "../storage.js";

export class PhotoOperationError extends Error {
  constructor(code = "photo_unavailable") {
    const messages = {
      photo_quota:
        "O limite de fotos foi atingido. Remova fotos que não usa ou tente mais tarde.",
      photo_rate:
        "Muitas operações com fotos. Aguarde antes de tentar novamente.",
      photo_in_use:
        "A foto ainda está associada a uma planta. Atualize o jardim antes de removê-la.",
      image_dimensions:
        "A imagem é grande demais. Selecione a foto novamente para reduzir seu tamanho.",
      image_size: "A foto excede 2 MB. Escolha uma foto menor.",
      invalid_image:
        "Não foi possível validar a imagem. Escolha outra foto JPG ou PNG.",
      unsupported_image: "Selecione a foto novamente para convertê-la em JPG.",
      photo_missing: "A foto não está mais disponível. Atualize seu jardim.",
    };
    super(
      messages[code] ||
        "Não foi possível concluir a operação com a foto. Confira sua conexão e tente novamente.",
    );
    this.name = "PhotoOperationError";
    this.code = code;
  }
}

export function createPhotoStore(client, userId, serverPhotos) {
  const storage = serverPhotos ? null : client.storage.from("plant-photos");
  async function invoke(body) {
    const result = await client.functions.invoke("plant-photos", { body });
    if (result.error) {
      let code;
      try {
        code = (await (result.response || result.error.context)?.clone().json())
          ?.code;
      } catch {
        /* erro sem corpo público */
      }
      throw new PhotoOperationError(code);
    }
    return result;
  }
  return {
    async download(path) {
      if (serverPhotos) {
        const { data, response } = await invoke({ action: "read", path });
        const type = response?.headers.get("x-photo-type");
        if (
          !(data instanceof Blob) ||
          !["image/jpeg", "image/png", "image/webp"].includes(type)
        )
          throw new PhotoOperationError();
        return new Blob([data], { type });
      }
      const { data, error } = await storage.download(path);
      if (error) throw new PhotoOperationError();
      return data;
    },
    async upload(blob) {
      if (blob.size > 2 * 1024 * 1024)
        throw new PhotoOperationError("image_size");
      if (serverPhotos) {
        if (blob.type === "image/webp") {
          const converted = await imageData(
            new File([blob], "foto.webp", { type: blob.type }),
          );
          blob = await (await fetch(converted)).blob();
        }
        const { data } = await invoke(blob);
        if (
          typeof data?.path !== "string" ||
          !data.path.startsWith(userId + "/") ||
          !/^[0-9a-f-]{36}\.jpg$/.test(data.path.slice(userId.length + 1))
        )
          throw new PhotoOperationError();
        return data.path;
      }
      const extension =
        blob.type === "image/png"
          ? "png"
          : blob.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await storage.upload(path, blob, {
        contentType: blob.type,
        upsert: false,
      });
      if (error) throw new PhotoOperationError();
      return path;
    },
    async remove(paths) {
      const unique = [...new Set(paths)];
      for (let offset = 0; offset < unique.length; offset += 50) {
        const batch = unique.slice(offset, offset + 50);
        if (serverPhotos) await invoke({ action: "remove", paths: batch });
        else {
          const { error } = await storage.remove(batch);
          if (error) throw new PhotoOperationError();
        }
      }
    },
    async cleanup() {
      if (serverPhotos) await invoke({ action: "cleanup" });
    },
  };
}
