const uploadForm = document.getElementById('upload-form');
const uploadStatus = document.getElementById('upload-status');
const documentsList = document.getElementById('documents-list');
const refreshButton = document.getElementById('refresh-documents');
const pollingIndicator = document.getElementById('polling-indicator');
const searchForm = document.getElementById('search-form');
const searchResults = document.getElementById('search-results');

const NON_TERMINAL_STATUSES = new Set(['CREATED', 'UPLOADING', 'QUEUED', 'PROCESSING', 'RETRYING']);
const POLL_INTERVAL_MS = 2000;
let pollTimer = null;

function currentOwnerId() {
  return document.getElementById('ownerId').value.trim() || 'demo-owner';
}

function renderTitle(text, id, hasFile) {
  if (!hasFile) {
    const div = document.createElement('div');
    div.className = 'document-title';
    div.textContent = text;
    return div;
  }
  const link = document.createElement('a');
  link.className = 'document-title document-title-link';
  link.textContent = text;
  link.href = `/documents/${id}/file`;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

function renderDocument(doc) {
  const li = document.createElement('li');
  li.className = 'document-item';

  const info = document.createElement('div');
  info.className = 'document-info';
  const title = renderTitle(doc.title, doc.id, doc.status !== 'CREATED');
  const meta = document.createElement('div');
  meta.className = 'document-meta';
  const parts = [doc.subject, doc.university];
  if (doc.tags?.length) parts.push(doc.tags.join(', '));
  if (doc.failureReason) parts.push(`⚠ ${doc.failureReason}`);
  meta.textContent = parts.filter(Boolean).join(' · ');
  info.append(title, meta);

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.alignItems = 'center';
  right.style.gap = '0.5rem';

  const badge = document.createElement('span');
  badge.className = `badge badge-${doc.status}`;
  badge.textContent = doc.status;
  right.appendChild(badge);

  if (doc.status === 'FAILED') {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'retry-button';
    retryBtn.type = 'button';
    retryBtn.textContent = 'Reintentar';
    retryBtn.addEventListener('click', () => retryDocument(doc.id));
    right.appendChild(retryBtn);
  }

  li.append(info, right);
  return li;
}

async function loadDocuments() {
  const ownerId = currentOwnerId();
  const response = await fetch(`/documents?ownerId=${encodeURIComponent(ownerId)}&limit=20`);
  const docs = await response.json();

  documentsList.innerHTML = '';
  if (docs.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Sin documentos todavía. Sube uno arriba.';
    documentsList.appendChild(empty);
  } else {
    for (const doc of docs) {
      documentsList.appendChild(renderDocument(doc));
    }
  }

  const anyInFlight = docs.some((doc) => NON_TERMINAL_STATUSES.has(doc.status) && doc.status !== 'CREATED');
  setPolling(anyInFlight);
}

function setPolling(shouldPoll) {
  pollingIndicator.hidden = !shouldPoll;
  if (shouldPoll && !pollTimer) {
    pollTimer = setInterval(loadDocuments, POLL_INTERVAL_MS);
  } else if (!shouldPoll && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function retryDocument(id) {
  await fetch(`/documents/${id}/retry`, { method: 'POST' });
  await loadDocuments();
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = uploadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  uploadStatus.classList.remove('error');
  uploadStatus.textContent = 'Creando metadatos...';

  try {
    const ownerId = currentOwnerId();
    const title = document.getElementById('title').value;
    const subject = document.getElementById('subject').value;
    const university = document.getElementById('university').value;
    const tags = document
      .getElementById('tags')
      .value.split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const file = document.getElementById('file').files[0];

    const createResponse = await fetch('/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId, title, subject, university, tags }),
    });
    if (!createResponse.ok) {
      throw new Error(`No se pudo crear el documento (HTTP ${createResponse.status})`);
    }
    const created = await createResponse.json();

    uploadStatus.textContent = 'Subiendo PDF...';
    const formData = new FormData();
    formData.append('file', file);
    const uploadResponse = await fetch(`/documents/${created.id}/complete-upload`, {
      method: 'POST',
      body: formData,
    });
    if (!uploadResponse.ok) {
      const body = await uploadResponse.json().catch(() => ({}));
      throw new Error(body.error ?? `No se pudo subir el archivo (HTTP ${uploadResponse.status})`);
    }

    uploadStatus.textContent = 'Documento en cola de procesamiento.';
    uploadForm.reset();
    document.getElementById('ownerId').value = ownerId;
    await loadDocuments();
  } catch (error) {
    uploadStatus.classList.add('error');
    uploadStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener('click', loadDocuments);

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const params = new URLSearchParams();
  const text = document.getElementById('search-text').value.trim();
  const subject = document.getElementById('search-subject').value.trim();
  const university = document.getElementById('search-university').value.trim();
  if (text) params.set('text', text);
  if (subject) params.set('subject', subject);
  if (university) params.set('university', university);

  const response = await fetch(`/search?${params.toString()}`);
  const result = await response.json();

  searchResults.innerHTML = '';
  if (result.items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Sin resultados.';
    searchResults.appendChild(empty);
    return;
  }
  for (const item of result.items) {
    const li = document.createElement('li');
    li.className = 'document-item';
    const info = document.createElement('div');
    info.className = 'document-info';
    // Search only ever indexes documents that finished processing, so a
    // search hit always has a file to open.
    const title = renderTitle(item.title, item.documentId, true);
    const meta = document.createElement('div');
    meta.className = 'document-meta';
    meta.textContent = [item.subject, item.university, item.tags.join(', ')].filter(Boolean).join(' · ');
    info.append(title, meta);
    li.appendChild(info);
    searchResults.appendChild(li);
  }
});

loadDocuments();
