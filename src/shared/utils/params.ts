/**
 * Helper to safely extract string from Express query/params
 */
export function getStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function getStringParamOrThrow(value: string | string[] | undefined, paramName: string): string {
  const result = getStringParam(value);
  if (!result) {
    throw new Error(`Missing required parameter: ${paramName}`);
  }
  return result;
}
