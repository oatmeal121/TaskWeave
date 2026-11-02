import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repository = process.env.GITHUB_REPOSITORY?.trim();
const publicKey = process.env.TAURI_SIGNING_PUBLIC_KEY?.trim();

if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("GITHUB_REPOSITORY must use the owner/repository format.");
}
if (!publicKey) {
  throw new Error("TAURI_SIGNING_PUBLIC_KEY is missing.");
}

const outputPath = resolve("src-tauri/target/tauri.github.conf.json");
const config = {
  bundle: {
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [
        `https://github.com/${repository}/releases/latest/download/latest.json`,
      ],
      requireSignedVersion: true,
      windows: {
        installMode: "passive",
      },
    },
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Prepared updater configuration for ${repository}.`);
