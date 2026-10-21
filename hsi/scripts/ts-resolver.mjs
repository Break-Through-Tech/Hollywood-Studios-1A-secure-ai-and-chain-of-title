// Lets node run the api/ handlers directly: they import siblings with the ".js"
// extension that TypeScript's nodenext mode requires, but only ".ts" exists on disk.
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

export function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
    const asTs = specifier.replace(/\.js$/, '.ts');
    if (existsSync(fileURLToPath(new URL(asTs, context.parentURL)))) {
      return next(asTs, context);
    }
  }
  return next(specifier, context);
}
