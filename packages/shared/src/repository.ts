export type RepositoryStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface Repository {
  id: string;
  name: string;
  source: "github" | "zip";
  status: RepositoryStatus;
  createdAt: string;
}
