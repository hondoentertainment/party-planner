import { test, expect } from "@playwright/test";

test("parseMoneyToCents and centsToMoney are inverse", async () => {
  const { parseMoneyToCents, formatMoney } = await import("../src/lib/format.ts");

  const centsCases = [
    0,
    1,
    50,
    100,
    2599,
    100000,
    123456,
    99999999,
    1234567890,
  ];

  for (const cents of centsCases) {
    const formatted = formatMoney(cents);
    const back = parseMoneyToCents(formatted);
    expect(back, `formatMoney(${cents}) -> ${JSON.stringify(formatted)} should round-trip`).toBe(cents);
  }

  const stringCases: Array<[string, string, number]> = [
    ["0", "$0.00", 0],
    ["$0", "$0.00", 0],
    ["$1", "$1.00", 100],
    ["$25.99", "$25.99", 2599],
    ["25.99", "$25.99", 2599],
    ["$1,234.56", "$1,234.56", 123456],
    ["$1,234,567.89", "$1,234,567.89", 123456789],
  ];

  for (const [input, expectedFormatted, expectedCents] of stringCases) {
    const cents = parseMoneyToCents(input);
    expect(cents, `parseMoneyToCents(${JSON.stringify(input)}) should be ${expectedCents}`).toBe(expectedCents);
    expect(formatMoney(cents)).toBe(expectedFormatted);
  }

  expect(parseMoneyToCents("")).toBe(0);
  expect(parseMoneyToCents("abc")).toBe(0);
});
