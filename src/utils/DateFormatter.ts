import { format, formatRelative } from "date-fns";

/**
 * Helper class to provide some convenience functions for formatting dates.
 *
 * @author Joern Meyer <joern.meyer@kernpunkt.de>
 */
class DateFormatter {
  static readonly FORMAT = "yyyy-MM-dd hh:ii:ss";

  /**
   * Formats the date as a date string using the format provided in this class.
   *
   * @param {string | Date} input
   * @returns {string}
   */
  static formatDate(input: string | Date): string {
    if (typeof input === "string") {
      return format(Date.parse(input), DateFormatter.FORMAT);
    }
    return format(input, DateFormatter.FORMAT);
  }

  /**
   * Formats the date as a relative date ("3 days ago")
   *
   * @param {string | Date} input
   * @returns {string}
   */
  static relativeDate(input: string | Date): string {
    if (typeof input === "string") {
      return formatRelative(Date.parse(input), new Date());
    }
    return formatRelative(input, new Date());
  }
}

export default DateFormatter;
