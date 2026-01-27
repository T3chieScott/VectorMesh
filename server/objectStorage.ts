import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

const objectStorageService = new ObjectStorageService();

export async function getSignedUploadUrl(fileName: string, contentType: string): Promise<string> {
  return objectStorageService.getObjectEntityUploadURL();
}

export async function getPublicUrl(objectPath: string): Promise<string> {
  return objectStorageService.normalizeObjectEntityPath(objectPath);
}

export { objectStorageService };
