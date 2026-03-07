import { exec } from "child_process";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { objectStorageService } from "./objectStorage";

function parseObjectPath(objPath: string): { bucketName: string; objectName: string } {
  if (!objPath.startsWith("/")) objPath = `/${objPath}`;
  const parts = objPath.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function downloadVideoToFile(videoUrl: string, destPath: string): Promise<boolean> {
  try {
    const normalizedPath = objectStorageService.normalizeObjectEntityPath(videoUrl);
    if (normalizedPath.startsWith("/objects/")) {
      const file = await objectStorageService.getObjectEntityFile(normalizedPath);
      const [contents] = await file.download();
      await fs.writeFile(destPath, contents);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to download video:", err);
    return false;
  }
}

export async function generateVideoThumbnail(
  videoUrl: string,
  privateObjectDir: string,
): Promise<string | null> {
  const normalizedCheck = objectStorageService.normalizeObjectEntityPath(videoUrl);
  if (!normalizedCheck.startsWith("/objects/") && !videoUrl.startsWith("https://storage.googleapis.com/")) {
    console.error("Thumbnail generation rejected: URL is not from object storage");
    return null;
  }

  const tmpDir = os.tmpdir();
  const videoTmp = path.join(tmpDir, `video-${randomUUID()}`);
  const thumbTmp = path.join(tmpDir, `thumb-${randomUUID()}.jpg`);

  try {
    const downloaded = await downloadVideoToFile(videoUrl, videoTmp);
    if (!downloaded) return null;

    await new Promise<void>((resolve, reject) => {
      exec(
        `ffmpeg -i "${videoTmp}" -ss 00:00:01 -vframes 1 -q:v 2 -vf "scale='min(640,iw)':-1" "${thumbTmp}" -y`,
        { timeout: 30000 },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    const thumbExists = await fs.stat(thumbTmp).catch(() => null);
    if (!thumbExists) return null;

    const thumbId = randomUUID();
    let dir = privateObjectDir;
    if (!dir.endsWith("/")) dir += "/";
    const objectPath = `${dir}thumbnails/${thumbId}.jpg`;
    const { bucketName, objectName } = parseObjectPath(objectPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    const thumbData = await fs.readFile(thumbTmp);
    await file.save(thumbData, { contentType: "image/jpeg" });

    const storedUrl = `https://storage.googleapis.com/${bucketName}/${objectName}`;
    const normalizedPath = objectStorageService.normalizeObjectEntityPath(storedUrl);
    return normalizedPath.startsWith("/objects/") ? normalizedPath : storedUrl;
  } catch (err) {
    console.error("Thumbnail generation failed:", err);
    return null;
  } finally {
    await fs.unlink(videoTmp).catch(() => {});
    await fs.unlink(thumbTmp).catch(() => {});
  }
}
