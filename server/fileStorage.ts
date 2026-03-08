import { promises as fs } from "fs";
import { createReadStream, statSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import mime from "mime-types";
import type { Response } from "express";
import { storage } from "./storage";

const DEFAULT_UPLOAD_DIR = "./data/uploads";
const SETTING_KEY = "uploadRootDir";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateClientId(clientId: string): void {
  if (!UUID_REGEX.test(clientId)) {
    throw new Error("Invalid clientId format");
  }
}

function assertWithinRoot(absolutePath: string, root: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(absolutePath);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    throw new Error("Path traversal detected");
  }
}

export async function getUploadRoot(): Promise<string> {
  try {
    const setting = await storage.getSystemSetting(SETTING_KEY);
    if (setting?.value) return setting.value;
  } catch {}
  return process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR;
}

export async function ensureDirectories(clientId: string): Promise<string> {
  validateClientId(clientId);
  const root = await getUploadRoot();
  const clientUploadDir = path.join(root, clientId, "uploads");
  const clientThumbDir = path.join(root, clientId, "thumbnails");
  assertWithinRoot(clientUploadDir, root);
  await fs.mkdir(clientUploadDir, { recursive: true });
  await fs.mkdir(clientThumbDir, { recursive: true });
  return root;
}

export async function saveFile(
  buffer: Buffer,
  originalName: string,
  contentType: string,
  clientId: string,
): Promise<string> {
  await ensureDirectories(clientId);
  const root = await getUploadRoot();
  const ext = path.extname(originalName) || "";
  const filename = `${randomUUID()}${ext}`;
  const relativePath = path.join(clientId, "uploads", filename);
  const absolutePath = path.join(root, relativePath);
  await fs.writeFile(absolutePath, buffer);
  return relativePath;
}

export async function saveThumbnail(
  buffer: Buffer,
  filename: string,
  clientId: string,
): Promise<string> {
  await ensureDirectories(clientId);
  const root = await getUploadRoot();
  const relativePath = path.join(clientId, "thumbnails", filename);
  const absolutePath = path.join(root, relativePath);
  await fs.writeFile(absolutePath, buffer);
  return relativePath;
}

export async function getAbsolutePath(storagePath: string): Promise<string> {
  const root = await getUploadRoot();
  const absolutePath = path.resolve(root, storagePath);
  assertWithinRoot(absolutePath, root);
  return absolutePath;
}

export async function streamFile(storagePath: string, res: Response): Promise<void> {
  const absolutePath = await getAbsolutePath(storagePath);

  try {
    const stat = statSync(absolutePath);
    const mimeType = mime.lookup(absolutePath) || "application/octet-stream";

    res.set({
      "Content-Type": mimeType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=3600",
    });

    const stream = createReadStream(absolutePath);
    stream.on("error", (err) => {
      console.error("Stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error streaming file" });
      }
    });
    stream.pipe(res);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      if (!res.headersSent) {
        res.status(404).json({ error: "File not found" });
      }
    } else {
      console.error("Error serving file:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error serving file" });
      }
    }
  }
}

export async function deleteFile(storagePath: string): Promise<boolean> {
  try {
    const absolutePath = await getAbsolutePath(storagePath);
    await fs.unlink(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function initStorage(): Promise<void> {
  const root = await getUploadRoot();
  await fs.mkdir(root, { recursive: true });
  console.log(`File storage initialized at: ${path.resolve(root)}`);
}
