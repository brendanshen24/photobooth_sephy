import { put } from "@vercel/blob";

type BlobPutExtras = NonNullable<Parameters<typeof put>[2]>;
type BlobPutBody = Parameters<typeof put>[1];

/** Resolves Vercel Blob auth from env (read-write token or OIDC + store id). */
export function blobPutOptions(): Pick<
  BlobPutExtras,
  "token" | "oidcToken" | "storeId"
> {
  const readWrite = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (readWrite) return { token: readWrite };

  const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim();
  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (oidcToken && storeId) return { oidcToken, storeId };

  return {};
}

export function hasBlobCredentials(): boolean {
  const opts = blobPutOptions();
  return Boolean(opts.token || (opts.oidcToken && opts.storeId));
}

export async function uploadPublicBlob(
  pathname: string,
  body: BlobPutBody,
  options: Pick<BlobPutExtras, "contentType" | "addRandomSuffix">
) {
  const auth = blobPutOptions();
  if (!auth.token && !(auth.oidcToken && auth.storeId)) {
    throw new Error(
      "Blob not configured. Set BLOB_READ_WRITE_TOKEN (or VERCEL_OIDC_TOKEN + BLOB_STORE_ID) in .env.local — run `vercel env pull --environment=preview` and copy BLOB_* vars."
    );
  }

  return put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    ...options,
    ...auth,
  });
}
