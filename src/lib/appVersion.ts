// Read from package.json rather than restated here: `<ProductVersion>` (Portaria
// 302/2016 field 1.17) is a legal declaration of the build that produced the
// file, and a second copy of the version is a second thing to forget to bump —
// which is how every filed SAF-T came to claim 0.1.0 against a 0.1.10 build.
import { version } from '../../package.json';

export const APP_VERSION: string = version;
