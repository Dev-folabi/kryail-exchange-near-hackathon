import { HttpException, HttpStatus } from "@nestjs/common";

export class AfriexException extends HttpException {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode: number = HttpStatus.BAD_REQUEST,
    public readonly details?: any,
  ) {
    super(
      {
        message,
        code,
        details,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}
