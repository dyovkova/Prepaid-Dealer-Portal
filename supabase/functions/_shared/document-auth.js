import { failure, isUuid, safeFilename, MAX_PDF_BYTES } from './document-input.js';

export function createDocumentAuthorization({ url, publicKey, fetcher = fetch }) {
  const get = async (path, authorization, deniedStatus = 403) => {
    const result = await fetcher(url + path, { headers: { apikey: publicKey, Authorization: authorization, 'Cache-Control': 'no-cache' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw failure([400, 401, 403, 404].includes(result.status) ? deniedStatus : 502, 'Unable to authorize this document request.');
    return result.json();
  };
  async function verify(request) {
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) throw failure(401, 'A user session is required.');
    const user = await get('/auth/v1/user', authorization, 401);
    if (!isUuid(user.id)) throw failure(401, 'Invalid user identity.');
    return { id: user.id, authorization };
  }
  async function identity(caller, adminOnly = false) {
    const [profiles, roles] = await Promise.all([
      get(`/rest/v1/profiles?id=eq.${caller.id}&select=id,dealer_id,is_active`, caller.authorization),
      get(`/rest/v1/user_roles?user_id=eq.${caller.id}&select=role`, caller.authorization) ]);
    if (profiles.length !== 1 || profiles[0].id !== caller.id || profiles[0].is_active !== true || roles.length !== 1
      || !['admin', 'dealer'].includes(roles[0].role) || (adminOnly && roles[0].role !== 'admin')) throw failure(403, 'An active authorized account is required.');
    const actor = { role: roles[0].role, dealerId: profiles[0].dealer_id };
    // Admins have no required organization; existing RLS allows all historical orders.
    if (actor.role === 'dealer') {
      if (!isUuid(actor.dealerId)) throw failure(403, 'An active organization is required.');
      const organizations = await get(`/rest/v1/dealers?id=eq.${actor.dealerId}&select=id,is_active`, caller.authorization);
      if (organizations.length !== 1 || organizations[0].id !== actor.dealerId || organizations[0].is_active !== true) throw failure(403, 'An active organization is required.');
    }
    return actor;
  }
  async function order(caller, id, actor) {
    const rows = await get(`/rest/v1/orders?id=eq.${id}&select=id,dealer_id`, caller.authorization, 404);
    if (rows.length !== 1 || rows[0].id !== id || (actor.role === 'dealer' && rows[0].dealer_id !== actor.dealerId)) throw failure(404, 'Document is unavailable.');
  }
  async function published(caller, id) {
    const actor = await identity(caller);
    const rows = await get(`/rest/v1/order_documents?id=eq.${id}&select=id,order_id,object_path,file_name,byte_size`, caller.authorization, 404);
    if (rows.length !== 1 || rows[0].id !== id) throw failure(404, 'Document is unavailable.');
    const document = rows[0];
    if (!isUuid(document.order_id) || document.object_path !== `${document.order_id}/${id}.pdf` || !safeFilename(document.file_name)
      || !Number.isInteger(document.byte_size) || document.byte_size < 1 || document.byte_size > MAX_PDF_BYTES) throw failure(502, 'Stored document metadata is invalid.');
    await order(caller, document.order_id, actor);
    return document;
  }
  async function upload(caller, document) { await order(caller, document.orderId, await identity(caller, true)); }
  return { verify, identity, published, upload };
}
