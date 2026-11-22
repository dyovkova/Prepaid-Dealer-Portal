import { feedback } from '../draft/ui.js';
export function documentView(root, admin) {
  root.innerHTML = `<section class="card my-4" aria-labelledby="documents-title"><div class="card-body">
    <div class="section-heading"><h2 id="documents-title">Documents</h2><button type="button" class="btn btn-outline-primary btn-sm" data-reload>Reload documents</button></div>
    <p class="form-note">Published order PDFs. Downloads check your current account and order access.</p>
    <div data-state role="status" aria-live="polite" hidden></div><ul data-documents class="list-unstyled mb-0"></ul>
    ${admin ? `<form data-upload class="mt-4"><fieldset disabled><legend class="h5">Upload a PDF</legend>
      <label for="document-file" class="form-label">PDF file</label><input id="document-file" type="file" accept=".pdf,application/pdf" class="form-control" aria-describedby="document-help">
      <p id="document-help" class="form-note mt-2">Maximum 10 MiB. The server validates PDF bytes before publication. No overwrite or automatic deletion.</p>
      <p data-saved class="product-description" hidden></p><div class="d-flex flex-wrap gap-2">
      <button data-submit class="btn btn-primary" type="submit">Upload and publish PDF</button><button data-another class="btn btn-outline-primary" type="button" hidden>Upload another PDF</button></div>
      </fieldset></form>` : ''}
    <div data-feedback class="mt-3" role="status" aria-live="polite" hidden></div>
    </div></section>`;
  const list = root.querySelector('[data-documents]'), state = root.querySelector('[data-state]'), notice = root.querySelector('[data-feedback]');
  function render(rows) {
    list.replaceChildren(...rows.map(row => {
      const li = document.createElement('li'); li.className = 'border-top py-3'; li.dataset.documentId = row.id;
      li.innerHTML = `<div class="d-flex flex-wrap justify-content-between align-items-start gap-2"><div class="mw-100"><h3 class="h6 product-description mb-1" data-name></h3><time class="form-note"></time></div><button type="button" class="btn btn-outline-primary btn-sm" data-download>Download</button></div>`;
      li.querySelector('[data-name]').textContent = row.name;
      li.querySelector('time').dateTime = row.createdAt.toISOString(); li.querySelector('time').textContent = `Uploaded ${row.createdAt.toLocaleString()}`;
      li.querySelector('button').setAttribute('aria-label', `Download ${row.name}`); return li;
    }));
  }
  function controls(enabled, busy, record = null) {
    root.querySelectorAll('button,input,fieldset').forEach(element => { element.disabled = !enabled || busy; });
    const submit = root.querySelector('[data-submit]'), another = root.querySelector('[data-another]'), saved = root.querySelector('[data-saved]');
    if (!submit) return;
    const confirmed = record?.phase === 'confirmed'; submit.hidden = confirmed; another.hidden = !confirmed;
    root.querySelector('input').disabled = !enabled || busy || confirmed;
    submit.textContent = record ? 'Retry saved PDF' : 'Upload and publish PDF';
    saved.hidden = !record; saved.textContent = record ? `${confirmed ? 'Published' : 'Saved PDF request'}: ${record.fileName}.${confirmed ? '' : ' Retry this request unchanged. If the upload was interrupted, reselect the same original file.'}` : '';
  }
  return { render, controls, state: (text, type) => feedback(state, text, type), message: (text, type) => feedback(notice, text, type) };
}
