export class UserError extends Error {
  readonly isUserError = true as const;
  readonly code: string;

  constructor(message: string, code = "BAD_USER_INPUT") {
    super(message);
    this.name = "UserError";
    this.code = code;
  }
}

export function fromPrismaError(e: unknown): never {
  if (e && typeof e === "object" && "code" in e) {
    const err = e as {
      code: string;
      meta?: {
        target?: unknown;
        modelName?: string;
        driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
      };
    };

    if (err.code === "P2002") {
      const targetFromMeta = Array.isArray(err.meta?.target)
        ? (err.meta!.target as string[])
        : undefined;
      const targetFromAdapter =
        err.meta?.driverAdapterError?.cause?.constraint?.fields;
      const field =
        targetFromMeta?.[0] ?? targetFromAdapter?.[0] ?? "Value";

      throw new UserError(`${field} already in use`, "CONFLICT");
    }
    if (err.code === "P2025") {
      throw new UserError("Record not found", "NOT_FOUND");
    }
  }
  throw e;
}