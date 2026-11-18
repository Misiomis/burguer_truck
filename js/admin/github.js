// Cliente mínimo de la API de GitHub para el panel de administración.
// El token lo ingresa quien administra; nunca está en el código del sitio.
// Permisos necesarios (token fine-grained): solo este repositorio, "Contents: Read and write".

export const REPO = { owner: 'Misiomis', repo: 'burguer_truck', branch: 'main' };
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind; // 'auth' | 'permiso' | 'conflicto' | 'red' | 'otro'
  }
}

export function createGitHub(token, { repo = REPO, fetchImpl = (...a) => fetch(...a) } = {}) {
  const base = `${API}/repos/${repo.owner}/${repo.repo}`;

  async function call(url, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        cache: 'no-store',
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError('No hay conexión con GitHub. Revisá internet y probá de nuevo.', 0, 'red');
    }
    if (res.status === 401) throw new GitHubError('El token no es válido o venció.', 401, 'auth');
    if (res.status === 403 || res.status === 404) throw new GitHubError('El token no tiene acceso a este repositorio.', res.status, 'permiso');
    if (res.status === 409 || res.status === 422) throw new GitHubError('El repositorio cambió mientras editabas.', res.status, 'conflicto');
    if (!res.ok) throw new GitHubError(`GitHub respondió con un error (${res.status}).`, res.status, 'otro');
    return accept.includes('raw') ? res.text() : res.json();
  }

  return {
    /** Verifica acceso y permiso de escritura. Devuelve { login, canWrite }. */
    async check() {
      const info = await call(base);
      let login = '';
      try { login = (await call(`${API}/user`)).login || ''; } catch { /* algunos tokens no leen /user */ }
      return { login, canWrite: Boolean(info.permissions && (info.permissions.push || info.permissions.admin)) };
    },
    /** SHA del último commit de la rama. */
    async headSha() {
      const ref = await call(`${base}/git/ref/heads/${repo.branch}`);
      return ref.object.sha;
    },
    /** Contenido de texto de un archivo en un commit dado. */
    readText(path, ref) {
      return call(`${base}/contents/${path}?ref=${encodeURIComponent(ref)}`, { accept: 'application/vnd.github.raw+json' });
    },
    /**
     * Un commit con varios archivos sobre `parentSha`; mueve la rama sin forzar.
     * Si la rama avanzó entre medio, GitHub lo rechaza (conflicto) y no se pisa nada.
     */
    async commitFiles({ files, message, parentSha }) {
      const parent = await call(`${base}/git/commits/${parentSha}`);
      // files: { ruta: texto | { base64 } (binario, ej. una foto) | null (borrar) }
      const entries = [];
      for (const [path, content] of Object.entries(files)) {
        if (content === null) entries.push({ path, mode: '100644', type: 'blob', sha: null });
        else if (typeof content === 'object' && typeof content.base64 === 'string') {
          const blob = await call(`${base}/git/blobs`, { method: 'POST', body: { content: content.base64, encoding: 'base64' } });
          entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        } else entries.push({ path, mode: '100644', type: 'blob', content });
      }
      const tree = await call(`${base}/git/trees`, {
        method: 'POST',
        body: { base_tree: parent.tree.sha, tree: entries },
      });
      const commit = await call(`${base}/git/commits`, { method: 'POST', body: { message, tree: tree.sha, parents: [parentSha] } });
      await call(`${base}/git/refs/heads/${repo.branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
      return commit.sha;
    },
  };
}
