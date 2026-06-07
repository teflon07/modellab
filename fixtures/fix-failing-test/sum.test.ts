import { test, expect } from "bun:test";
import { sum } from "./sum";

test("sum adds two numbers", () => {
  expect(sum(2, 3)).toBe(5);
  expect(sum(0, 0)).toBe(0);
});
