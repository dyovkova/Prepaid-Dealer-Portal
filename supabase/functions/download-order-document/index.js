import { createDownloader } from './handler.js';
import { documentConfig } from '../_shared/document-config.js';
Deno.serve(createDownloader(documentConfig()));
