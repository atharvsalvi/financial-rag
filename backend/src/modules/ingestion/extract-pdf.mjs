// Run outside the HTTP process so the caller can stop a slow or oversized PDF.
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { getDocumentProxy } from 'unpdf';

async function extract() {
  const input = [];
  for await (const part of process.stdin) input.push(part);
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.concat(input)), {
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: false,
    useWorkerFetch: false,
  });
  try {
    if (pdf.numPages > 600) return { error: 'limit' };
    const pages = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      const parts = [];
      for (const item of items) {
        if (typeof item.str !== 'string') continue;
        length += item.str.length + 1;
        if (length > 2000000) return { error: 'limit' };
        parts.push(item.str, item.hasEOL ? '\n' : ' ');
      }
      pages.push({ pageNumber, text: parts.join('').trim() });
      page.cleanup();
    }
    return { pages };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

try {
  process.stdout.write(JSON.stringify(await extract()));
} catch (error) {
  if (
    error.name === 'PasswordException' ||
    error.name === 'InvalidPDFException'
  ) {
    process.stdout.write(
      JSON.stringify({
        error: error.name === 'PasswordException' ? 'password' : 'invalid',
      }),
    );
  } else {
    throw error;
  }
}
