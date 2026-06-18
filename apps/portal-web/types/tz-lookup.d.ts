declare module "tz-lookup" {
  /**
   * Returns the IANA timezone name (e.g. "America/Chicago") for a latitude /
   * longitude. Throws a RangeError on out-of-range input. The package ships no
   * types of its own, so this minimal declaration covers the single export.
   */
  const tzlookup: (lat: number, lon: number) => string;
  export default tzlookup;
}
