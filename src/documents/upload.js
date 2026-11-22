import { uploadPdf, publishPdf } from '../services/documents.js';
import { readUpload, writeUpload, uploadKey } from './recovery.js';
import { fileFingerprint, documentError } from './model.js';
export function processPdf(account, orderId, file, services = { upload: uploadPdf, publish: publishPdf }, progress = () => {}, signal) {
  if (!navigator.locks) throw documentError('This browser cannot safely coordinate PDF uploads. Use a current browser on HTTPS or localhost.');
  return navigator.locks.request(uploadKey(account.userId, orderId), async () => {
    let record = readUpload(account.userId, orderId);
    if (record?.phase === 'confirmed') return record;
    const digest = file ? await fileFingerprint(file) : null;
    if (record && file && (record.digest !== digest || record.fileName !== file.name || record.size !== file.size)) throw documentError('Reselect the exact original PDF with the saved filename. A different file cannot replace this request.');
    if (!record) {
      if (!file) throw documentError('Select a PDF to upload.');
      record = writeUpload(account.userId, { version: 1, id: crypto.randomUUID(), orderId, fileName: file.name, size: file.size, digest, phase: 'prepared' });
    }
    if (signal?.aborted) throw documentError('The account or page changed. The saved PDF request is kept.');
    if (record.phase === 'prepared' && file) {
      progress('Uploading PDF...'); await services.upload(account, record, file);
      record = writeUpload(account.userId, { ...record, phase: 'uploaded' });
    }
    if (signal?.aborted) throw documentError('The account or page changed. The saved PDF request is kept.');
    progress('Validating and publishing PDF...');
    const id = await services.publish(account, record, signal);
    if (id !== record.id) throw new Error('Publication not confirmed');
    return writeUpload(account.userId, { ...record, phase: 'confirmed' });
  });
}
