export abstract class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_SERVER_ERROR"
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(details: string) {
    super(`Validation failed: ${details}`, 400, "VALIDATION_ERROR");
  }
}

export class RepositoryNotFoundError extends AppError {
  constructor(repoId: string) {
    super(`Repository with ID "${repoId}" not found`, 404, "REPOSITORY_NOT_FOUND");
  }
}

export class AnalysisFailedError extends AppError {
  constructor(jobId: string, reason: string) {
    super(`Analysis job "${jobId}" failed: ${reason}`, 500, "ANALYSIS_FAILED");
  }
}

export class UploadFailedError extends AppError {
  constructor(reason: string) {
    super(`Upload failed: ${reason}`, 400, "UPLOAD_FAILED");
  }
}

export class JobNotFoundError extends AppError {
  constructor(jobId: string) {
    super(`Job with ID "${jobId}" not found`, 404, "JOB_NOT_FOUND");
  }
}
