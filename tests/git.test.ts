import { test, expect, describe } from "bun:test";
import { parseGitHubRemote } from "../src/git.ts";

describe("parseGitHubRemote", () => {
  test("parses https URL with .git suffix", () => {
    expect(parseGitHubRemote("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  test("parses https URL without .git suffix", () => {
    expect(parseGitHubRemote("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  test("parses http URL", () => {
    expect(parseGitHubRemote("http://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  test("parses https URL with embedded credentials", () => {
    expect(
      parseGitHubRemote("https://x-access-token:ghp_xxx@github.com/owner/repo.git"),
    ).toEqual({ owner: "owner", repo: "repo" });
  });

  test("parses scp-style ssh URL", () => {
    expect(parseGitHubRemote("git@github.com:owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  test("parses ssh:// URL", () => {
    expect(parseGitHubRemote("ssh://git@github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  test("trims surrounding whitespace", () => {
    expect(parseGitHubRemote("  https://github.com/owner/repo\n")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  test("handles repo names with hyphens and dots", () => {
    expect(parseGitHubRemote("https://github.com/my-org/my.repo-name")).toEqual({
      owner: "my-org",
      repo: "my.repo-name",
    });
  });

  test("returns null for non-GitHub hosts", () => {
    expect(parseGitHubRemote("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubRemote("https://tangled.org/owner/repo")).toBeNull();
    expect(parseGitHubRemote("git@gitlab.com:owner/repo.git")).toBeNull();
  });

  test("returns null for malformed input", () => {
    expect(parseGitHubRemote("")).toBeNull();
    expect(parseGitHubRemote("not a url")).toBeNull();
    expect(parseGitHubRemote("github.com/owner/repo")).toBeNull();
  });
});
