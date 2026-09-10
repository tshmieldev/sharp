// Runs in the page's world, not the extension's. It decorates window.fetch so
// Sharp can read what X's own client already has: per-post feedback metadata
// from timeline responses, and the headers X signs its API calls with. Nothing
// here touches chrome.*, the DOM, or the request itself; the original fetch is
// called with the original arguments and its response returned untouched.
import { feedbackMetadata, pickSigning, type WireMessage } from './wire-extract';

const apiPath = '/i/api/';
const post = (message: WireMessage) => window.postMessage(message, location.origin);
let lastHeaders = '';

function requestOf(input: RequestInfo | URL, init?: RequestInit) {
  const url = input instanceof Request ? input.url : String(input);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
  return { url, headers };
}

function observe(url: string, headers: Headers, response: Response) {
  const signing = pickSigning(headers);
  if (signing) {
    const serialised = JSON.stringify(signing);
    if (serialised !== lastHeaders) {
      lastHeaders = serialised;
      post({ aitf: 'wire', kind: 'headers', headers: signing });
    }
  }
  if (!url.includes('/graphql/') || !response.ok) return;
  if (!/json/i.test(response.headers.get('content-type') ?? '')) return;
  // A clone reads its own copy of the body; the page's copy is unaffected.
  void response
    .clone()
    .json()
    .then((json: unknown) => {
      const entries = feedbackMetadata(json);
      if (entries.length) post({ aitf: 'wire', kind: 'metadata', entries });
    })
    .catch(() => {});
}

const original = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const promise = original.call(this, input, init);
  try {
    const { url, headers } = requestOf(input, init);
    if (url.includes(apiPath)) {
      void promise.then((response) => observe(url, headers, response)).catch(() => {});
    }
  } catch {
    // Observation must never change what the page sees.
  }
  return promise;
};
