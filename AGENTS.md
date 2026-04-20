# AGENTS.md - POS System Development Guidelines

## Build, Lint, and Test Commands

### Development
```bash
npm run dev              # Start dev server (http://localhost:5173)
npm run dev:https        # Start with HTTPS
npm run dev:network      # Start accessible on network
npm run electron:dev     # Run with Electron (React + electron)
npm run electron:dev-debug  # Run with Electron + Chrome debugging
```

### Building
```bash
npm run build            # Build for production (outputs to dist/)
npm run preview          # Preview production build locally
```

### Linting & Type Checking
```bash
npm run lint             # Run ESLint on all files
```

### Testing
```bash
npm test                 # Run all tests
npm test -- src/tests/Auth.test.tsx  # Run specific test file
npm test -- --run       # Run tests once (no watch mode)
npm test -- --coverage  # Run with coverage report
```

### End-to-end (Playwright)
```bash
npx playwright install chromium   # One-time browser download (per machine)
npm run test:e2e                  # Headless E2E (starts Vite via playwright.config)
npm run test:e2e:ui               # Playwright UI mode
npm run test:e2e:headed           # See the browser while tests run
npm run test:e2e:debug            # Step through with Playwright Inspector
```

`e2e/auth.spec.ts` signs in as the bootstrap admin from `public/bootstrap-data.json` using the demo password **`password`** (SHA-256 stored in `password_hash`). Adjust that file if you change credentials.

### Electron Distribution
```bash
npm run electron:dist           # Build for current platform
npm run electron:dist:all       # Build for all platforms
npm run electron:pack           # Build and package
```

---

## Code Style Guidelines

### TypeScript Conventions

**Interface Naming:**
- Entities: `PascalCase` (e.g., `Employee`, `Product`)
- Props: `ComponentNameProps` (e.g., `LoginFormProps`)
- Context: `ContextNameType` (e.g., `AuthContextType`)

**Type Rules:**
- **NEVER** use `any` - define proper interfaces
- Use `Pick<T, K>` for partial interfaces
- Use unions for controlled values: `type Status = 'active' | 'inactive'`
- Enable strict mode - `noUnusedLocals`, `noUnusedParameters` enforced

### Component Structure (Enforced Order)

```typescript
const ComponentName: React.FC<ComponentNameProps> = ({ prop1, prop2 }) => {
  // 1. Hooks (useState, useEffect, useContext)
  const [state, setState] = useState(initialValue);
  const { globalState } = useContext();

  // 2. Event handlers
  const handleClick = () => { /* ... */ };

  // 3. Computed values (useMemo)
  const computed = useMemo(() => expensiveCalc(state), [state]);

  // 4. Effects (useEffect)
  useEffect(() => { /* ... */ }, [dependencies]);

  // 5. Render
  return <div>...</div>;
};
```

### Import Order

1. React hooks (`React`, `useState`, `useEffect`)
2. External libraries (`lucide-react` icons)
3. Local contexts (`../../contexts/`)
4. Local components (`../components/`)
5. Types (`../../types/`)
6. Utils (`../../utils/`)

### File Organization

```
src/
├── components/
│   ├── Auth/           # Feature-specific folders
│   ├── Layout/
│   └── VirtualKeyboard.tsx  # Shared at root
├── contexts/           # React contexts
├── pages/             # Page components
├── types/             # TypeScript interfaces
├── services/          # API/service layers
├── hooks/             # Custom hooks
└── utils/             # Helper functions
```

### React Patterns

**State Management:**
- `useState`: Component-specific UI state
- `useReducer`: Complex state logic
- Context: Global app state (auth, cart)
- `useMemo`/`useCallback`: Performance optimization

**Component Patterns:**
- Use `React.memo` for components with frequent re-renders
- Memoize expensive calculations with `useMemo`
- Memoize handlers passed to children with `useCallback`

### Error Handling

```typescript
// Async error handling pattern
try {
  const result = await asyncOperation();
  setState({ data: result, loading: false, error: null });
} catch (error) {
  setState({ 
    data: null, 
    loading: false, 
    error: error instanceof Error ? error.message : 'Unknown error' 
  });
}

// UI Error display
{error && (
  <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
    <p className="text-red-700 text-xl font-medium">{error}</p>
  </div>
)}
```

### Tailwind CSS Guidelines

**Touch Screen Optimization (CRITICAL):**
- Minimum touch targets: `min-h-[60px]`
- Large action buttons: `min-h-[80px]`
- Employee cards: `min-h-[280px]`
- Avoid dropdowns and hover-dependent interactions

**Spacing Scale:**
- `gap-2` (8px): Tight spacing (keyboard keys)
- `gap-4` (16px): Standard spacing
- `gap-6` (24px): Comfortable spacing
- `gap-8` (32px): Large spacing (cards)

**Transitions:**
- `duration-200`: Buttons, hover effects
- `duration-300`: Cards, larger elements
- `duration-150`: Keyboard keys (fast response)

**Role-Based Colors (MANDATORY):**
- Admin: `from-red-500 to-pink-600`
- Manager: `from-orange-500 to-amber-600`
- Cashier: `from-blue-500 to-purple-600`

**Functional Colors:**
- Success: `bg-green-500 hover:bg-green-600`
- Danger: `bg-red-500 hover:bg-red-600`
- Warning: `bg-orange-500 hover:bg-orange-600`

---

## Testing Patterns

**Test File Location:** `tests/` (root level, not inside src/)

**Test Structure:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ComponentName', () => {
  const mockProps = { /* ... */ };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<Component {...mockProps} />);
    expect(screen.getByText('Expected')).toBeInTheDocument();
  });
});
```

**Mocking Services:**
```typescript
vi.mock('../src/services/employeeService', () => ({
  employeeService: {
    getEmployeeByNumber: vi.fn(),
    // ...
  }
}));
```

### Fiscal signing (AT / RSG)

- **Browser / dev:** PEM PKCS#8 in Settings is imported with Web Crypto (`WebCryptoRsaSha1Signer`) in the renderer.
- **Electron:** Prefer **Guardar chave no armazenamento seguro** (Settings): PEM is encrypted with `safeStorage` in the main process; signing runs over IPC (`fiscal:sign-hash-plaintext`) via `ElectronSafeStorageSigner`, so the private key is not kept in renderer memory or localStorage. If a secure key exists, `createSignerFromSettings` uses it before falling back to the PEM field.

---

## Required Documentation

Before implementing features, reference:
- `STYLE_GUIDE.md` - UI/design patterns, colors, typography
- `DEVELOPMENT_GUIDE.md` - Architecture, TypeScript, components

---

## Git Conventions

```
feat: add new feature
fix: resolve bug
docs: documentation changes
refactor: code restructuring
test: add/update tests
style: formatting, no code change
```
