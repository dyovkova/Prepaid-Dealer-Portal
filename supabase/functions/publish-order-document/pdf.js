import { PDFDocument } from 'pdf-lib';
import { MAX_PDF_BYTES, failure } from '../_shared/document-input.js';
export { MAX_PDF_BYTES, BUCKET, failure, documentInput, readBounded } from '../_shared/document-input.js';
export async function validatePdf(bytes, type) {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw failure(413, 'PDF must be nonempty and at most 10 MiB.');
  const decode = slice => new TextDecoder('latin1').decode(slice);
  if (type.split(';')[0].trim().toLowerCase() !== 'application/pdf'
    || !/^%PDF-[12]\.\d/.test(decode(bytes.subarray(0, 12))) || !/%%EOF\s*$/.test(decode(bytes.subarray(-1024)))) {
    throw failure(415, 'The stored file is not a complete PDF.');
  }
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
    if (pdf.isEncrypted || !pdf.getPageCount()) throw new Error('Unreadable PDF');
  } catch { throw failure(415, 'The stored PDF is malformed, encrypted or has no pages.'); }
}
