export class NotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? "Not Found");
    this.name = "NotFoundError";
  }
}
