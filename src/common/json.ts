/**
 * Population counts are stored as bigint. JSON has no bigint, so they are serialized as strings
 * to avoid silent precision loss. Clients must treat them as strings.
 */
export function installBigIntJson() {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
    return this.toString();
  };
}
