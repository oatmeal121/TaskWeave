import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2]?.trim();
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("Usage: npm run version:set -- 1.0.1");
}

function updateJson(path, update) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  update(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

updateJson("package.json", (value) => { value.version = version; });
updateJson("package-lock.json", (value) => {
  value.version = version;
  value.packages[""].version = version;
});
updateJson("src-tauri/tauri.conf.json", (value) => { value.version = version; });

const cargoTomlPath = "src-tauri/Cargo.toml";
const cargoToml = readFileSync(cargoTomlPath, "utf8").replace(
  /(\[package\][\s\S]*?\nversion = ")[^"]+("\r?\n)/,
  (_match, before, after) => `${before}${version}${after}`,
);
writeFileSync(cargoTomlPath, cargoToml, "utf8");

const cargoLockPath = "src-tauri/Cargo.lock";
const cargoLock = readFileSync(cargoLockPath, "utf8").replace(
  /(\[\[package\]\]\r?\nname = "taskweave"\r?\nversion = ")[^"]+("\r?\n)/,
  (_match, before, after) => `${before}${version}${after}`,
);
writeFileSync(cargoLockPath, cargoLock, "utf8");

console.log(`TaskWeave version set to ${version}.`);
