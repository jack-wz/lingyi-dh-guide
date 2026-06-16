import assert from 'node:assert/strict';
import test from 'node:test';
import { ErrorCodes, ERROR_CATALOG, formatStoredError, listErrorCatalog } from './apiErrors.js';

test('ERROR_CATALOG covers all ErrorCodes', () => {
  for (const code of Object.values(ErrorCodes)) {
    assert.ok(ERROR_CATALOG[code], `missing catalog entry for ${code}`);
    assert.ok(ERROR_CATALOG[code].remediation.length > 10);
  }
});

test('listErrorCatalog returns stable codes', () => {
  const list = listErrorCatalog();
  assert.ok(list.some((e) => e.code === ErrorCodes.TEMPLATE_NOT_FOUND));
});

test('formatStoredError prefixes code', () => {
  assert.equal(formatStoredError(ErrorCodes.VALIDATION, 'bad'), '[G001] bad');
});