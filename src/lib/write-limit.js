export class WriteLimitError extends Error {
  constructor() {
    super(
      "Você atingiu o limite de alterações. Aguarde um pouco e tente novamente. Se continuar, tente no próximo dia.",
    );
    this.name = "WriteLimitError";
  }
}

export function checkWriteLimit(error) {
  if (error?.code === "PT429") throw new WriteLimitError();
}
