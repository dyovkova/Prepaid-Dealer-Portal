import { loadDocuments, downloadPdf } from '../services/documents.js';
import { processPdf } from './upload.js';
import { readUpload, startAnotherUpload, uploadKey } from './recovery.js';
import { documentMessage } from './model.js';
import { documentView } from './view.js';

export function createDocuments(root, admin = false) {
  const view = documentView(root, admin), form = root.querySelector('form'), file = root.querySelector('input');
  let account, orderId, rows = [], generation = 0, loading, action, busy = false, localBlocked = false;
  function controls() {
    let record = null; localBlocked = false;
    try { if (admin && account && orderId) record = readUpload(account.userId, orderId); }
    catch (error) { localBlocked = true; view.message(documentMessage(error), 'danger'); }
    view.controls(Boolean(account && orderId), busy, record);
    if (localBlocked && form) form.querySelector('fieldset').disabled = true;
  }
  async function load() {
    if (!account || !orderId) return;
    loading?.abort(); const request = loading = new AbortController(), current = generation;
    view.state('Loading documents...'); root.querySelector('[data-documents]').setAttribute('aria-busy', 'true');
    try {
      const documents = await loadDocuments(account, orderId, request.signal);
      if (request.signal.aborted || current !== generation) return;
      rows = documents; view.render(rows); view.state(rows.length ? '' : 'No published documents for this order.'); controls();
    } catch (error) { if (!request.signal.aborted && current === generation) { rows = []; view.render([]); view.state(documentMessage(error), 'danger'); } }
    finally { if (current === generation) root.querySelector('[data-documents]').setAttribute('aria-busy', 'false'); }
  }
  form?.addEventListener('submit', async event => {
    event.preventDefault(); if (!account || busy || localBlocked) return;
    const actor = account, id = orderId, current = generation; busy = true; action = new AbortController(); controls();
    try {
      const record = await processPdf(actor, id, file.files[0], undefined, text => { if (current === generation) view.message(text); }, action.signal);
      if (current !== generation) return;
      file.value = ''; view.message(`PDF published: ${record.fileName}.`, 'success'); await load();
    } catch (error) { if (current === generation) view.message(documentMessage(error), 'danger'); }
    finally { if (current === generation) { busy = false; controls(); } }
  });
  root.querySelector('[data-another]')?.addEventListener('click', async () => {
    if (!account || busy) return;
    const actor = account, id = orderId, current = generation; busy = true; controls();
    try {
      if (!navigator.locks) throw new Error('Browser locks unavailable');
      const saved = readUpload(actor.userId, id);
      await navigator.locks.request(uploadKey(actor.userId, id), () => startAnotherUpload(actor.userId, id, saved?.id));
      if (current === generation) { file.value = ''; view.message('Select the next PDF. The published document is unchanged.'); }
    } catch (error) { if (current === generation) view.message(documentMessage(error), 'danger'); }
    finally { if (current === generation) { busy = false; controls(); } }
  });
  root.addEventListener('click', async event => {
    const id = event.target.closest('[data-download]')?.closest('[data-document-id]')?.dataset.documentId;
    const document = rows.find(row => row.id === id); if (!document || !account || busy) return;
    const current = generation; busy = true; action = new AbortController(); controls(); view.message('Preparing secure PDF download...');
    try {
      const blob = await downloadPdf(account, document, action.signal); if (current !== generation || action.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = window.document.createElement('a'); link.href = url; link.download = document.name;
      window.document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      view.message('PDF download started.', 'success');
    } catch (error) { if (current === generation) view.message(documentMessage(error), 'danger'); }
    finally { if (current === generation) { busy = false; controls(); } }
  });
  root.querySelector('[data-reload]').addEventListener('click', () => { if (!busy) void load(); });
  window.addEventListener('storage', event => { if (account && orderId && event.key === uploadKey(account.userId, orderId)) controls(); });
  return { setContext(next, id = null) {
    generation++; loading?.abort(); action?.abort(); account = next; orderId = id; busy = false; rows = [];
    root.hidden = !account || !orderId; view.render([]); view.state(''); view.message(''); if (file) file.value = ''; controls();
    if (account && orderId) void load();
  } };
}
