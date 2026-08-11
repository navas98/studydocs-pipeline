export interface ObjectStorage {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
}
