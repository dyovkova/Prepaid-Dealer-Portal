import { getSupabase } from './supabase.js';
import { loadAccount } from './auth.js';
import { sessionAuthorization } from './session.js';
import { isProductId } from '../draft/model.js';
import { publishedDocument, MAX_PDF_BYTES } from '../documents/model.js';
async function authorization(account, admin = false) {
  const current = await loadAccount();
  if (!account || current?.userId !== account.userId) throw Object.assign(new Error('Your session changed. Sign in to the original account to retry its saved PDF.'), { code: 'portal_session' });
  if (current.status !== 'active' || !['admin', 'dealer'].includes(current.role) || (admin && current.role !== 'admin')) throw Object.assign(new Error('Document access denied'), { status: 403 });
  return sessionAuthorization(account.userId);
}
async function edge(account, name, body, signal, admin = false) {
  const { data, error } = await getSupabase().functions.invoke(name, { body, headers: { Authorization: await authorization(account, admin) },
    signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]) });
  if (error) throw Object.assign(new Error('Document request failed'), { status: error.context?.status });
  await sessionAuthorization(account.userId); return data;
}
export async function loadDocuments(account, orderId, signal) {
  if (!isProductId(orderId)) throw new Error('Invalid order');
  const result = [], header = await authorization(account);
  for (let offset = 0; ; offset += 100) {
    const { data, error, status } = await getSupabase().from('order_documents').select('id,order_id,file_name,byte_size,created_at').eq('order_id', orderId)
      .setHeader('Authorization', header).order('created_at', { ascending: false }).order('id').range(offset, offset + 99)
      .abortSignal(AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]));
    if (error) throw Object.assign(error, { status });
    await sessionAuthorization(account.userId); result.push(...data.map(row => publishedDocument(row, orderId)));
    if (data.length < 100) return result;
  }
}
export async function uploadPdf(account, record, file) {
  const header = await authorization(account, true);
  const { error } = await getSupabase().storage.from('order-documents').upload(`${record.orderId}/${record.id}.pdf`, file,
    { contentType: 'application/pdf', cacheControl: '0', upsert: false, headers: { Authorization: header } });
  // An interrupted upload may already exist. Never overwrite: publish the same immutable ID.
  if (error && !(String(error.statusCode) === '409' || /already exists/i.test(error.message ?? ''))) throw Object.assign(new Error('PDF upload not confirmed'), { status: Number(error.statusCode) });
  await sessionAuthorization(account.userId);
}
export const publishPdf = (account, record, signal) => edge(account, 'publish-order-document', { orderId: record.orderId, documentId: record.id, fileName: record.fileName }, signal, true).then(data => data?.id);
export async function downloadPdf(account, document, signal) {
  const blob = await edge(account, 'download-order-document', { documentId: document.id }, signal);
  if (!(blob instanceof Blob) || blob.type.split(';')[0] !== 'application/pdf' || blob.size !== document.size || blob.size > MAX_PDF_BYTES) throw new Error('PDF response unavailable');
  return blob;
}
