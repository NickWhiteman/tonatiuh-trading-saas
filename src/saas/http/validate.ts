import { validationError } from './errors';

export function objectValue(value: unknown, allowedFields?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('Expected a JSON object.');
  }
  const result = value as Record<string, unknown>;
  if (allowedFields) {
    const unknownFields = Object.keys(result).filter((field) => !allowedFields.includes(field));
    if (unknownFields.length) throw validationError('Unknown fields.', { fields: unknownFields });
  }
  return result;
}

export function stringValue(value: unknown, field: string, maxLength = 255): string {
  if (typeof value !== 'string') throw validationError(`${field} must be a string.`);
  const result = value.trim();
  if (!result || result.length > maxLength) {
    throw validationError(`${field} must contain between 1 and ${maxLength} characters.`);
  }
  return result;
}

export function optionalStringValue(value: unknown, field: string, maxLength = 255): string | undefined {
  return value === undefined || value === null ? undefined : stringValue(value, field, maxLength);
}

export function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw validationError(`${field} must be a boolean.`);
  return value;
}
