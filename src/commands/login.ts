import * as p from "@clack/prompts";
import pc from "picocolors";
import { validateApiKey } from "../api.ts";
import { getApiKey, setApiKey } from "../config.ts";

export async function login(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" bunnyup login ")));

  // Check for existing key
  const existingKey = await getApiKey();
  if (existingKey) {
    const shouldReplace = await p.confirm({
      message: "You already have an API key stored. Replace it?",
      initialValue: false,
    });

    if (p.isCancel(shouldReplace) || !shouldReplace) {
      p.outro("Keeping existing API key.");
      return;
    }
  }

  p.note(
    `Get your API key from:\n${pc.cyan("https://dash.bunny.net/account/api-key")}`,
    "API Key",
  );

  const apiKey = await p.password({
    message: "Enter your Bunny.net API key:",
    validate: (value) => {
      if (!value || value.length < 10) {
        return "API key seems too short";
      }
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Login cancelled.");
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start("Validating API key...");

  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    spinner.stop("Invalid API key");
    p.cancel("The API key is invalid. Please check and try again.");
    process.exit(1);
  }

  spinner.message("Storing API key...");

  try {
    await setApiKey(apiKey);
    spinner.stop("API key stored securely");
  } catch (error) {
    spinner.stop("Could not store in keychain");
    p.log.warn(
      `Could not store in OS keychain. Set ${pc.cyan("BUNNY_API_KEY")} environment variable instead.`,
    );
  }

  p.note(
    `For CI/CD, set the ${pc.cyan("BUNNY_API_KEY")} environment variable.`,
    "Tip",
  );

  p.outro(pc.green("Logged in successfully!"));
}
