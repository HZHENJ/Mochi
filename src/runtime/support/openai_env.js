const fs = require("fs");
const os = require("os");
const path = require("path");

const OPENAI_ENV_FILE = path.join(os.homedir(), ".openai-env");

function loadOpenAIEnvFile({ override = true } = {}) {
  if (!fs.existsSync(OPENAI_ENV_FILE)) {
    return;
  }

  const pattern = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
  const lines = fs.readFileSync(OPENAI_ENV_FILE, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (override || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

module.exports = {
  loadOpenAIEnvFile,
};
