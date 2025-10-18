import { describe, it } from "node:test";
import assert from "node:assert";
import {
  globalFunctions,
  stringExtensions,
  numberExtensions,
  arrayExtensions,
  dateExtensions,
  Link,
} from "./functions.js";

describe("globalFunctions", () => {
  it("date() should parse string dates", () => {
    const result = globalFunctions.date("2024-01-15");
    assert.ok(result instanceof Date);
    assert.strictEqual(result.getFullYear(), 2024);
  });

  it("max() should return largest number", () => {
    assert.strictEqual(globalFunctions.max(1, 5, 3), 5);
  });

  it("min() should return smallest number", () => {
    assert.strictEqual(globalFunctions.min(1, 5, 3), 1);
  });

  it("link() should create basic link", () => {
    const result = globalFunctions.link("path");
    assert.ok(result instanceof Link);
    assert.strictEqual(result.toString(), "[[path]]");
  });

  it("link() should create link with display text", () => {
    const result = globalFunctions.link("path", "text");
    assert.ok(result instanceof Link);
    assert.strictEqual(result.toString(), "[[path|text]]");
  });

  it("list() should wrap non-array in array", () => {
    const result = globalFunctions.list("value");
    assert.ok(Array.isArray(result));
    assert.strictEqual(result[0], "value");
  });

  it("list() should return array unchanged", () => {
    const arr = [1, 2, 3];
    const result = globalFunctions.list(arr);
    assert.strictEqual(result, arr);
  });

  it("now() should return current date", () => {
    const result = globalFunctions.now();
    assert.ok(result instanceof Date);
  });

  it("today() should return date with time set to midnight", () => {
    const result = globalFunctions.today();
    assert.strictEqual(result.getHours(), 0);
    assert.strictEqual(result.getMinutes(), 0);
  });

  it("number() should convert strings to numbers", () => {
    assert.strictEqual(globalFunctions.number("42"), 42);
    assert.strictEqual(globalFunctions.number("3.14"), 3.14);
  });

  it("number() should convert booleans", () => {
    assert.strictEqual(globalFunctions.number(true), 1);
    assert.strictEqual(globalFunctions.number(false), 0);
  });
});

describe("stringExtensions", () => {
  it("contains() should check substring", () => {
    assert.strictEqual(
      stringExtensions.contains.call("hello world", "world"),
      true
    );
    assert.strictEqual(
      stringExtensions.contains.call("hello world", "missing"),
      false
    );
  });

  it("lower() should convert to lowercase", () => {
    assert.strictEqual(stringExtensions.lower.call("HELLO"), "hello");
  });

  it("title() should capitalize words", () => {
    assert.strictEqual(
      stringExtensions.title.call("hello world"),
      "Hello World"
    );
  });

  it("reverse() should reverse string", () => {
    assert.strictEqual(stringExtensions.reverse.call("hello"), "olleh");
  });
});

describe("numberExtensions", () => {
  it("abs() should return absolute value", () => {
    assert.strictEqual(numberExtensions.abs.call(-5), 5);
    assert.strictEqual(numberExtensions.abs.call(5), 5);
  });

  it("round() should round to specified digits", () => {
    assert.strictEqual(numberExtensions.round.call(3.14159, 2), 3.14);
  });

  it("ceil() should round up", () => {
    assert.strictEqual(numberExtensions.ceil.call(2.1), 3);
  });

  it("floor() should round down", () => {
    assert.strictEqual(numberExtensions.floor.call(2.9), 2);
  });
});

describe("arrayExtensions", () => {
  it("unique() should remove duplicates", () => {
    const result = arrayExtensions.unique.call([1, 2, 2, 3]);
    assert.deepStrictEqual(result, [1, 2, 3]);
  });

  it("flat() should flatten nested arrays", () => {
    const result = arrayExtensions.flat.call([1, [2, 3]]);
    assert.deepStrictEqual(result, [1, 2, 3]);
  });

  it("contains() should check for element", () => {
    assert.strictEqual(arrayExtensions.contains.call([1, 2, 3], 2), true);
    assert.strictEqual(arrayExtensions.contains.call([1, 2, 3], 5), false);
  });
});

describe("dateExtensions", () => {
  const testDate = new Date("2024-01-15T10:30:00Z");

  it("format() should format date", () => {
    const result = dateExtensions.format.call(testDate, "YYYY-MM-DD");
    assert.strictEqual(result, "2024-01-15");
  });

  it("time() should return time string", () => {
    const result = dateExtensions.time.call(testDate);
    assert.match(result, /^\d{2}:\d{2}:\d{2}$/);
  });
});
