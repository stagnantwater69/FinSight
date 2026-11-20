export class ApiError extends Error {
  status: number;
  code?: string;
  responseDetails?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    options: { code?: string; responseDetails?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.status = status;
    this.code = options.code;
    this.responseDetails = options.responseDetails;
  }
}

