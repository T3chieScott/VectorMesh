import { exec } from "child_process";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import sharp from "sharp";
import * as fileStorage from "./fileStorage";

export async function getImageDimensions(
  imageStoragePath: string,
): Promise<{ width: number; height: number } | null> {
  if (!imageStoragePath || imageStoragePath.startsWith("http")) {
    return null;
  }
  try {
    const absolutePath = await fileStorage.getAbsolutePath(imageStoragePath);
    const metadata = await sharp(absolutePath).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch (err) {
    console.error("Image dimension extraction failed:", err);
    return null;
  }
}

export async function getVideoDuration(
  videoStoragePath: string,
): Promise<number | null> {
  if (!videoStoragePath || videoStoragePath.startsWith("http")) {
    return null;
  }

  const tmpDir = os.tmpdir();
  const videoTmp = path.join(tmpDir, `probe-${randomUUID()}`);

  try {
    const absoluteVideoPath = await fileStorage.getAbsolutePath(videoStoragePath);
    await fs.copyFile(absoluteVideoPath, videoTmp);

    const durationStr = await new Promise<string>((resolve, reject) => {
      exec(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoTmp}"`,
        { timeout: 30000 },
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout.trim());
        },
      );
    });

    const seconds = parseFloat(durationStr);
    if (isNaN(seconds) || seconds <= 0) return null;
    return Math.round(seconds);
  } catch (err) {
    console.error("Video duration extraction failed:", err);
    return null;
  } finally {
    await fs.unlink(videoTmp).catch(() => {});
  }
}

export async function generateVideoThumbnail(
  videoStoragePath: string,
  clientId: string,
): Promise<string | null> {
  if (!videoStoragePath || videoStoragePath.startsWith("http")) {
    console.error("Thumbnail generation rejected: not a local file path");
    return null;
  }

  const tmpDir = os.tmpdir();
  const videoTmp = path.join(tmpDir, `video-${randomUUID()}`);
  const thumbTmp = path.join(tmpDir, `thumb-${randomUUID()}.jpg`);

  try {
    const absoluteVideoPath = await fileStorage.getAbsolutePath(videoStoragePath);
    await fs.copyFile(absoluteVideoPath, videoTmp);

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

    const thumbData = await fs.readFile(thumbTmp);
    const thumbFilename = `${randomUUID()}.jpg`;
    const thumbnailPath = await fileStorage.saveThumbnail(thumbData, thumbFilename, clientId);
    return thumbnailPath;
  } catch (err) {
    console.error("Thumbnail generation failed:", err);
    return null;
  } finally {
    await fs.unlink(videoTmp).catch(() => {});
    await fs.unlink(thumbTmp).catch(() => {});
  }
}
