// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Playwright for the browser tests (Test Plan 14). Playwright is installed with the test environment, not
// vendored: it never ships in docs/. Resolved with require so a global install is found through NODE_PATH.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const playwright = require('playwright');
