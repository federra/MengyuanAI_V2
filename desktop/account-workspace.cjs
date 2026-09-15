/* oxlint-disable typescript/no-require-imports -- Electron main process uses CommonJS. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const exists = (p) =>
  fs
    .access(p)
    .then(() => true)
    .catch((e) => {
      if (e.code === 'ENOENT') return false;
      throw e;
    });
class AccountWorkspace {
  constructor(root) {
    this.root = root;
    this.accounts = path.join(root, 'accounts');
  }
  path(id) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))
      throw Error('INVALID_USER_ID');
    return path.join(this.accounts, id);
  }
  async legacyPath() {
    try {
      const settings = JSON.parse(
        await fs.readFile(
          path.join(this.root, 'directory-settings.json'),
          'utf8',
        ),
      );
      if (path.isAbsolute(settings.workspaceDir)) return settings.workspaceDir;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    return path.join(this.root, 'workspace');
  }
  async hasLegacy() {
    return (
      (await exists(await this.legacyPath())) ||
      (await exists(path.join(this.root, 'doubao-data')))
    );
  }
  async prepare(id, claim = false) {
    const target = this.path(id);
    await fs.mkdir(this.accounts, { recursive: true, mode: 0o700 });
    const marker = path.join(this.accounts, 'legacy-owner.json');
    let owner;
    try {
      owner = JSON.parse(await fs.readFile(marker, 'utf8')).userId;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (claim && owner && owner !== id) throw Error('LEGACY_CLAIMED');
    if (await exists(path.join(target, 'owner.json'))) return target;
    if (claim && !owner)
      await fs.writeFile(
        marker,
        JSON.stringify({ userId: id, claimedAt: new Date().toISOString() }),
        { flag: 'wx', mode: 0o600 },
      );
    const stage = path.join(this.accounts, '.prepare-' + randomUUID());
    await fs.mkdir(stage, { mode: 0o700 });
    // Original files remain a recovery copy; never copy a live backend database.
    if (claim) {
      const workspace = await this.legacyPath();
      if (await exists(workspace))
        await fs.cp(workspace, path.join(stage, 'workspace'), {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
      try {
        const old = JSON.parse(
          await fs.readFile(
            path.join(this.root, 'directory-settings.json'),
            'utf8',
          ),
        );
        if (path.isAbsolute(old.jianyingDraftDir))
          await fs.writeFile(
            path.join(stage, 'directory-settings.json'),
            JSON.stringify({
              workspaceDir: path.join(target, 'workspace'),
              jianyingDraftDir: old.jianyingDraftDir,
            }),
            { mode: 0o600 },
          );
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      for (const name of ['model-key.bin', 'doubao-data'])
        if (await exists(path.join(this.root, name)))
          await fs.cp(path.join(this.root, name), path.join(stage, name), {
            recursive: true,
            errorOnExist: true,
            force: false,
          });
    }
    await fs.writeFile(
      path.join(stage, 'owner.json'),
      JSON.stringify({ userId: id, legacyClaimed: claim }),
      { flag: 'wx', mode: 0o600 },
    );
    await fs.rename(stage, target);
    return target;
  }
}
module.exports = { AccountWorkspace };
