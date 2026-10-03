import "server-only";

import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";
import type { StorageDriver } from "./types";

export type { StorageDriver, StorageObject } from "./types";

let cached: StorageDriver | null = null;

/** Liefert den konfigurierten Storage-Treiber (Singleton). */
export function getStorage(): StorageDriver {
  if (cached) return cached;

  const driver = process.env.STORAGE_DRIVER ?? "local";

  if (driver === "s3") {
    cached = new S3StorageDriver({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET ?? "photos",
      accessKey: process.env.S3_ACCESS_KEY ?? "",
      secretKey: process.env.S3_SECRET_KEY ?? "",
    });
  } else {
    cached = new LocalStorageDriver(
      process.env.STORAGE_LOCAL_PATH ?? "./storage/uploads",
    );
  }

  return cached;
}
