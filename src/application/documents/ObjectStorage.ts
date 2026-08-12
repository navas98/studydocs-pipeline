export interface ObjectStorage {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
