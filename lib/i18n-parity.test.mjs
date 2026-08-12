import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// Locale parity: every dictionary must carry the exact key set of en.json with
// the same {placeholder} names. translate() falls back to English silently, so
// a missing key would otherwise ship untranslated UI without any failure.

const LOCALES_DIR = new URL("./i18n/locales/", import.meta.url);

async function loadDictionaries() {
  const files = (await readdir(LOCALES_DIR)).filter((f) => f.endsWith(".json")).sort();
  const dicts = new Map();
  for (const file of files) {
    dicts.set(file, JSON.parse(await readFile(new URL(file, LOCALES_DIR), "utf8")));
  }
  return dicts;
}

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

test("all locale dictionaries have the same keys as en.json", async () => {
  const dicts = await loadDictionaries();
  const en = dicts.get("en.json");
  assert.ok(en, "en.json must exist");
  const enKeys = Object.keys(en).sort();

  for (const [file, dict] of dicts) {
    if (file === "en.json") continue;
    const keys = Object.keys(dict).sort();
    assert.deepEqual(keys, enKeys, `${file} key set diverges from en.json`);
  }
});

test("all locale dictionaries preserve en.json placeholders per key", async () => {
  const dicts = await loadDictionaries();
  const en = dicts.get("en.json");

  for (const [file, dict] of dicts) {
    if (file === "en.json") continue;
    for (const [key, text] of Object.entries(en)) {
      const enVars = placeholders(text);
      const localeVars = placeholders(dict[key] ?? "");
      // A locale may not drop a placeholder en uses (the translation would
      // lose information the caller provides)...
      for (const name of enVars) {
        assert.ok(localeVars.includes(name), `${file}: "${key}" drops en placeholder {${name}}`);
      }
      // ...nor invent one the caller never substitutes — except {count} in
      // plural keys, which translatePlural always provides (CJK locales use
      // the same counted string for the .one form, where en hardcodes "1").
      const isPluralForm = key.endsWith(".one") || key.endsWith(".other");
      for (const name of localeVars) {
        assert.ok(
          enVars.includes(name) || (isPluralForm && name === "count"),
          `${file}: "${key}" adds unknown placeholder {${name}}`,
        );
      }
    }
  }
});

test("every locale file is registered in the i18n module", async () => {
  const dicts = await loadDictionaries();
  const source = await readFile(new URL("./i18n/index.tsx", import.meta.url), "utf8");

  for (const file of dicts.keys()) {
    assert.match(source, new RegExp(`"\\./locales/${file}"`), `${file} is not imported by lib/i18n/index.tsx`);
    const locale = file.replace(/\.json$/, "");
    assert.match(source, new RegExp(`"${locale}"`), `locale "${locale}" is not referenced in lib/i18n/index.tsx`);
  }
});
