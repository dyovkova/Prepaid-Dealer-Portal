import { createPublisher } from './handler.js';
import { documentConfig } from '../_shared/document-config.js';
Deno.serve(createPublisher(documentConfig()));
