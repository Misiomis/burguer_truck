// Genera capturas de inicio, carta y pedido (escritorio y móvil) en docs/capturas/despues/.
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=capturas', 'tests/ui/'], {
  stdio: 'inherit',
  env: { ...process.env, CAPTURAS: 'docs/capturas/despues' },
});
process.exit(r.status ?? 1);
